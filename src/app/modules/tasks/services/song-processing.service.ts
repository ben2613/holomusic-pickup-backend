import { Injectable, Logger } from '@nestjs/common';
import { HolodexService } from '../../holodex/holodex.service';
import { YouTubeVideoService } from '../../youtube/services/youtube.video.service';
import { YouTubePlaylistService } from '../../youtube/services/youtube.playlist.service';
import { DynamoDBService } from '../../dynamodb/dynamodb.service';
import { VideoSearchParams, VideoWithChannel, PaginatedResponse, Channel } from '../../holodex/holodex.types';
import * as fs from 'fs';
import { SongFilterService } from './song-filter.service';
import { OAUTH_DB_KEY } from './oauth.service';

export interface SongData {
  id: string;
  title: string;
  channel_id: string;
  channel: Channel;
  published_at: string;
  available_at: string;
  song_type: 'original' | 'cover';
  duration: number;
  status: string;
  youtube_view_count: string;
  youtube_like_count: string;
  processed_at: string;
  mentions: Channel[];
  thumbnail_url: string;
}

export interface GroupedSongs {
  originals: SongData[];
  covers: SongData[];
}

// when DEBUG we don't call youtube api
const DEBUG = true;

@Injectable()
export class SongProcessingService {
  private readonly logger = new Logger(SongProcessingService.name);

  constructor(
    private readonly holodexService: HolodexService,
    private readonly youtubeVideoService: YouTubeVideoService,
    private readonly youtubePlaylistService: YouTubePlaylistService,
    private readonly dynamoDBService: DynamoDBService,
    private readonly songFilterService: SongFilterService,
  ) {}

  private async fetchAllSongsOfType(params: VideoSearchParams): Promise<VideoWithChannel[]> {
    const allSongs: VideoWithChannel[] = [];
    let offset = 0;
    
    // First call to get total
    const firstResponse = await this.holodexService.searchVideos({
      ...params,
      paginated: 'true',
    }) as PaginatedResponse<VideoWithChannel>;
    
    allSongs.push(...firstResponse.items);
    const total = firstResponse.total;
    
    // Continue fetching if there are more songs
    while (allSongs.length < total) {
      offset += params.limit;
      const response = await this.holodexService.searchVideos({
        ...params,
        offset,
        paginated: 'true',
      }) as PaginatedResponse<VideoWithChannel>;
      
      allSongs.push(...response.items);
      this.logger.debug(`Fetched ${allSongs.length}/${total} songs of type ${params.topic}`);
    }

    return allSongs;
  }

  private async processSong(video: VideoWithChannel, songType: 'original' | 'cover'): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const publishedAt = new Date(video.published_at);
    
    // Skip videos newer than 7 days
    if (publishedAt > sevenDaysAgo) {
      return;
    }

    // Get additional details from YouTube API
    const youtubeData = DEBUG ? {
      statistics: {
        viewCount: '' + Math.floor(Math.random() * 1000000),
        likeCount: '' + Math.floor(Math.random() * 1000000)
      }
    } : await this.youtubeVideoService.getVideoById(video.id);
    if (!youtubeData) {
      return;
    }

    // dunno why suborg starts with 2 random characters
    if (video.channel.suborg) {
      video.channel.suborg = video.channel.suborg.slice(2);
    }

    const songData: SongData = {
      id: video.id,
      title: video.title,
      channel_id: video.channel_id,
      channel: video.channel,
      published_at: video.published_at,
      available_at: video.available_at,
      song_type: songType,
      duration: video.duration,
      status: video.status,
      youtube_view_count: youtubeData.statistics.viewCount,
      youtube_like_count: youtubeData.statistics.likeCount,
      processed_at: new Date().toISOString(),
      mentions: video.mentions ?? [],
      thumbnail_url: `https://img.youtube.com/vi/${video.id}/0.jpg`
    }

    // Store or update the data in DynamoDB
    await this.dynamoDBService.put('hololive_songs', songData);

    this.logger.log(`Processed ${songType} song: ${video.title}`);
  }

  async fetchAndFilterSongs() {
    try {
      this.logger.debug('Starting song fetch and filter process...');

      // Purge existing data first
      await this.dynamoDBService.purgeTable('hololive_songs', ['YOUTUBE_OAUTH_TOKEN']);

      this.logger.debug('Fetching and processing Hololive songs...');

      // Search parameters
      const originalParams: VideoSearchParams = {
        org: 'Hololive',
        type: 'stream',
        topic: 'Original_Song',
        status: 'past',
        include: ['mentions'],
        limit: 50,
      };

      const coverParams: VideoSearchParams = {
        org: 'Hololive',
        type: 'stream',
        topic: 'Music_Cover',
        status: 'past',
        include: ['mentions'],
        limit: 50,
      };

      // Fetch all songs first
      let [originalSongs, coverSongs] = await Promise.all([
        this.fetchAllSongsOfType(originalParams),
        this.fetchAllSongsOfType(coverParams),
      ]);

      // Apply filters
      originalSongs = this.songFilterService.filterSongs(originalSongs, {
        filterInstrumental: true,
      });
      
      coverSongs = this.songFilterService.filterSongs(coverSongs, {
        filterInstrumental: true,
      });

      this.logger.log(`Found ${originalSongs.length} original songs and ${coverSongs.length} covers`);

      // Process songs in batches
      const batchSize = 5;
      const processSongsBatch = async (songs: VideoWithChannel[], type: 'original' | 'cover') => {
        for (let i = 0; i < songs.length; i += batchSize) {
          const batch = songs.slice(i, i + batchSize);
          await Promise.all(
            batch.map(song => 
              this.processSong(song, type)
                .catch(error => this.logger.error(`Error processing ${type} song ${song.id}:`, error))
            )
          );
          this.logger.debug(`Processed batch ${i / batchSize + 1} of ${Math.ceil(songs.length / batchSize)} for ${type} songs`);
        }
      };

      // Process both types concurrently
      await Promise.all([
        processSongsBatch(originalSongs, 'original'),
        processSongsBatch(coverSongs, 'cover'),
      ]);

      this.logger.log('Completed processing all songs');
    } catch (error) {
      this.logger.error('Error fetching and filtering songs:', error);
      throw error;
    }
  }

  private sortSongsByViews(songs: SongData[]): SongData[] {
    return [...songs].sort((a, b) => parseInt(b.youtube_view_count) - parseInt(a.youtube_view_count));
  }

  private pickSongsWithWeights(songs: SongData[]): SongData[] {
    const pickedSongs: SongData[] = [];
    const numToPick = Math.min(20, songs.length);
    const remainingSongs = [...songs];

    for (let i = 0; i < numToPick; i++) {
      const weights = remainingSongs.map((_, index) => {
        const percentile = index / remainingSongs.length;
        if (percentile <= 0.1) return 1;
        if (percentile <= 0.2) return 2;
        if (percentile <= 0.3) return 4;
        if (percentile <= 0.4) return 8;
        if (percentile <= 0.5) return 16;
        if (percentile <= 0.6) return 32;
        if (percentile <= 0.7) return 64;
        if (percentile <= 0.8) return 128;
        if (percentile <= 0.9) return 256;
        return 512;
      });

      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const probabilities = weights.map(weight => weight / totalWeight);
      
      const randomIndex = Math.random();
      let cumulativeProbability = 0;
      let selectedIndex = remainingSongs.length - 1;
      
      for (let j = 0; j < remainingSongs.length; j++) {
        cumulativeProbability += probabilities[j];
        if (randomIndex <= cumulativeProbability) {
          selectedIndex = j;
          break;
        }
      }

      pickedSongs.push(remainingSongs[selectedIndex]);
      remainingSongs.splice(selectedIndex, 1);
    }

    return pickedSongs;
  }

  private groupSongsByChannelOrMentionsContainsStars(songs: SongData[]): { starsGroups: GroupedSongs; girlsGroups: GroupedSongs } {
    const starsGroups: GroupedSongs = {
      originals: [],
      covers: [],
    };
    const girlsGroups: GroupedSongs = {
      originals: [],
      covers: [],
    };

    songs.forEach(song => {
      const mentionsPlusChannel = [...(song.mentions || []), song.channel];
      let targetGroup: GroupedSongs;
      if (mentionsPlusChannel.some(mention => (mention.suborg + mention.name).toLowerCase().includes('holostars'))) { 
        targetGroup = starsGroups
      } else {
        targetGroup = girlsGroups;
      }
      
      if (song.song_type === 'original') {
        targetGroup.originals.push(song);
      } else {
        targetGroup.covers.push(song);
      }
    });

    return { starsGroups, girlsGroups };
  }

  async pickLessPopularSongs(): Promise<{ stars: GroupedSongs; girls: GroupedSongs }> {
    try {
      this.logger.debug('Starting to pick popular songs...');

      const songs = (await this.dynamoDBService.scan<SongData>('hololive_songs')).filter(song => song.id !== OAUTH_DB_KEY);

      const { starsGroups, girlsGroups } = this.groupSongsByChannelOrMentionsContainsStars(songs);

      starsGroups.originals = this.sortSongsByViews(starsGroups.originals);
      starsGroups.covers = this.sortSongsByViews(starsGroups.covers);
      girlsGroups.originals = this.sortSongsByViews(girlsGroups.originals);
      girlsGroups.covers = this.sortSongsByViews(girlsGroups.covers);

      const pickedStarsSongs = {
        originals: this.pickSongsWithWeights(starsGroups.originals),
        covers: this.pickSongsWithWeights(starsGroups.covers)
      };
      const pickedGirlsSongs = {
        originals: this.pickSongsWithWeights(girlsGroups.originals),
        covers: this.pickSongsWithWeights(girlsGroups.covers)
      };

      pickedStarsSongs.originals = this.sortSongsByViews(pickedStarsSongs.originals);
      pickedStarsSongs.covers = this.sortSongsByViews(pickedStarsSongs.covers);
      pickedGirlsSongs.originals = this.sortSongsByViews(pickedGirlsSongs.originals);
      pickedGirlsSongs.covers = this.sortSongsByViews(pickedGirlsSongs.covers);

      if (process.env.IS_LOCAL) {
        fs.writeFileSync('picked_songs.json', JSON.stringify({
          stars: pickedStarsSongs,
          girls: pickedGirlsSongs
        }, null, 2));
      }

      this.logger.log(
        'Grouped songs:\n' +
        `Stars group: ${starsGroups.originals.length} originals, ${starsGroups.covers.length} covers\n` +
        `Girls group: ${girlsGroups.originals.length} originals, ${girlsGroups.covers.length} covers`
      );

      return {
        stars: pickedStarsSongs,
        girls: pickedGirlsSongs
      };
    } catch (error) {
      this.logger.error('Error picking less popular songs:', error);
      throw error;
    }
  }

  async createYouTubePlaylists(
    pickedStarsSongs: GroupedSongs,
    pickedGirlsSongs: GroupedSongs
  ): Promise<void> {
    try {
      const playlists = [
        {
          title: `Holostars Original Songs Picks`,
          description: 'Automatically picked original songs from Holostars members',
          songs: pickedStarsSongs.originals,
        },
        {
          title: `Holostars Cover Songs Picks`,
          description: 'Automatically picked cover songs from Holostars members',
          songs: pickedStarsSongs.covers,
        },
        {
          title: `Hololive Original Songs Picks`,
          description: 'Automatically picked original songs from Hololive members',
          songs: pickedGirlsSongs.originals,
        },
        {
          title: `Hololive Cover Songs Picks`,
          description: 'Automatically picked cover songs from Hololive members',
          songs: pickedGirlsSongs.covers,
        },
      ];

      const playlistIds = [];
      for (const playlist of playlists) {
        if (playlist.songs.length === 0) {
          this.logger.debug(`Skipping empty playlist: ${playlist.title}`);
          continue;
        }

        if (!DEBUG) {
          this.logger.debug(`Creating playlist: ${playlist.title}`);
          const playlistId = await this.youtubePlaylistService.createPlaylistIfNotExists(
            playlist.title,
            playlist.description
          );
          playlistIds.push(playlistId);
          this.logger.debug(`Adding ${playlist.songs.length} songs to playlist ${playlist.title}`);
          await this.youtubePlaylistService.addVideosToPlaylist(
            playlistId,
            playlist.songs.map(song => song.id)
          );
          this.logger.log(`Created playlist: ${playlist.title} (${playlistId})`);
        }
      }

      // make all playlists public after all songs are added
      for (const playlistId of playlistIds) {
        await this.youtubePlaylistService.updatePlaylistPrivacy(playlistId, 'public');
      }
    } catch (error) {
      this.logger.error('Error creating YouTube playlists:', error);
      throw error;
    }
  }
} 