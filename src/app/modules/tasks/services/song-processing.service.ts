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
const CALL_YOUTUBE = process.env.CALL_YOUTUBE === 'true';

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

  private async processSongs(videos: VideoWithChannel[], songType: 'original' | 'cover'): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Filter out videos newer than 7 days
    const videosToProcess = videos.filter(video => {
      const publishedAt = new Date(video.published_at);
      return publishedAt <= sevenDaysAgo;
    });

    if (videosToProcess.length === 0) {
      return;
    }

    // Get additional details from YouTube API in batch
    const youtubeData = !CALL_YOUTUBE ? videosToProcess.map(video => ({
      id: video.id,
      statistics: {
        viewCount: '' + Math.floor(Math.random() * 1000000),
        likeCount: '' + Math.floor(Math.random() * 1000000)
      }
    })) : await this.youtubeVideoService.getVideosByIds(videosToProcess.map(video => video.id));

    // Create a map of video data for easy lookup
    const youtubeDataMap = new Map(youtubeData.map(data => [data.id, data]));

    // Process each video and prepare for batch DB update
    const songsToStore: SongData[] = videosToProcess.map(video => {
      const youtubeStats = youtubeDataMap.get(video.id)?.statistics;
      if (!youtubeStats) {
        this.logger.warn(`No YouTube data found for video ${video.id}`);
        return null;
      }

      // Clean up suborg if needed
      if (video.channel.suborg) {
        video.channel.suborg = video.channel.suborg.slice(2);
      }

      return {
        id: video.id,
        title: video.title,
        channel_id: video.channel_id,
        channel: video.channel,
        published_at: video.published_at,
        available_at: video.available_at,
        song_type: songType,
        duration: video.duration,
        status: video.status,
        youtube_view_count: youtubeStats.viewCount,
        youtube_like_count: youtubeStats.likeCount,
        processed_at: new Date().toISOString(),
        mentions: video.mentions ?? [],
        thumbnail_url: `https://img.youtube.com/vi/${video.id}/0.jpg`
      };
    }).filter(song => song !== null);

    // Store all songs in DynamoDB
    await Promise.all(
      songsToStore.map(song => 
        this.dynamoDBService.put('hololive_songs', song)
          .catch(error => this.logger.error(`Error storing song ${song.id}:`, error))
      )
    );

    this.logger.log(`Processed ${songsToStore.length} ${songType} songs in batch`);
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
      const batchSize = 50; // Increased batch size since we're using batch API
      const processSongsBatch = async (songs: VideoWithChannel[], type: 'original' | 'cover') => {
        for (let i = 0; i < songs.length; i += batchSize) {
          const batch = songs.slice(i, i + batchSize);
          await this.processSongs(batch, type)
            .catch(error => this.logger.error(`Error processing batch of ${type} songs:`, error));
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
    const numToPick = Math.min(parseInt(process.env.SONGS_TO_PICK || '50') + 10, songs.length);
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

  private async createPlaylists(playlists: { title: string; description: string }[]): Promise<string[]> {
    const playlistIds: string[] = [];
    
    for (const playlist of playlists) {
      try {
        this.logger.debug(`Creating playlist: ${playlist.title}`);
        const playlistId = await this.youtubePlaylistService.createPlaylistIfNotExists(
          playlist.title,
          playlist.description
        );
        playlistIds.push(playlistId);
        this.logger.log(`Created playlist: ${playlist.title} (${playlistId})`);
      } catch (error) {
        this.logger.error(`Error creating playlist ${playlist.title}:`, error);
        throw error;
      }
    }
    
    return playlistIds;
  }

  private async addVideosToPlaylists(playlistsWithIds: { id: string; title: string; songs: SongData[] }[]): Promise<void> {
    for (const playlist of playlistsWithIds) {
      if (playlist.songs.length === 0) {
        this.logger.debug(`Skipping empty playlist: ${playlist.title}`);
        continue;
      }

      try {
        this.logger.debug(`Adding ${playlist.songs.length} songs to playlist ${playlist.title}`);
        await this.youtubePlaylistService.addVideosToPlaylist(
          playlist.id,
          playlist.songs.map(song => song.id)
        );
        this.logger.log(`Added videos to playlist: ${playlist.title} (${playlist.id})`);
      } catch (error) {
        this.logger.error(`Error adding videos to playlist ${playlist.title}:`, error);
        throw error;
      }
    }
  }

  async createYouTubePlaylists(): Promise<{ id: string; title: string; description: string }[]> {
    try {
      if (!CALL_YOUTUBE) {
        this.logger.debug('Skipping YouTube playlist creation (CALL_YOUTUBE is false)');
        return [];
      }

      const playlistsToCreate = [
        {
          title: `Holostars Original Songs Picks`,
          description: 'Automatically picked original songs from Holostars members',
        },
        {
          title: `Holostars Cover Songs Picks`,
          description: 'Automatically picked cover songs from Holostars members',
        },
        {
          title: `Hololive Original Songs Picks`,
          description: 'Automatically picked original songs from Hololive members',
        },
        {
          title: `Hololive Cover Songs Picks`,
          description: 'Automatically picked cover songs from Hololive members',
        },
      ];

      // Create all playlists and return their metadata
      const playlistIds = await this.createPlaylists(playlistsToCreate);
      return playlistsToCreate.map((playlist, index) => ({
        ...playlist,
        id: playlistIds[index],
      }));
    } catch (error) {
      this.logger.error('Error creating YouTube playlists:', error);
      throw error;
    }
  }

  async insertIntoYouTubePlaylists(
    playlists: { id: string; title: string; description: string }[],
    pickedStarsSongs: GroupedSongs,
    pickedGirlsSongs: GroupedSongs
  ): Promise<void> {
    try {
      if (!CALL_YOUTUBE) {
        this.logger.debug('Skipping YouTube playlist video insertion (CALL_YOUTUBE is false)');
        return;
      }

      const playlistsWithSongs = [
        {
          ...playlists[0],
          songs: pickedStarsSongs.originals,
        },
        {
          ...playlists[1],
          songs: pickedStarsSongs.covers,
        },
        {
          ...playlists[2],
          songs: pickedGirlsSongs.originals,
        },
        {
          ...playlists[3],
          songs: pickedGirlsSongs.covers,
        },
      ];

      await this.addVideosToPlaylists(playlistsWithSongs);
    } catch (error) {
      this.logger.error('Error inserting videos into YouTube playlists:', error);
      throw error;
    }
  }
} 