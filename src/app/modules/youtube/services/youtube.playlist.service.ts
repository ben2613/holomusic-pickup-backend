import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { YouTubePlaylist } from '../youtube.types';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class YouTubePlaylistService {
  private readonly apiUrl: string;
  private readonly logger = new Logger(YouTubePlaylistService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    this.apiUrl = 'https://www.googleapis.com/youtube/v3';
  }

  async createPlaylistIfNotExists(title: string, description: string): Promise<string> {
    try {
      const token = await this.authService.getValidAccessToken();
      const playlists = await this.getPlaylists();
      const existingPlaylist = playlists.find(playlist => playlist.snippet.title === title);
      if (existingPlaylist) {
        // if exists, clear all videos in the playlist
        await this.clearPlaylist(existingPlaylist.id);
        return existingPlaylist.id;
      }
      this.logger.debug(`Creating playlist: ${title}`);
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/playlists`,
          {
            snippet: { title, description },
            status: { privacyStatus: 'public' },
          },
          {
            params: { part: 'snippet,status' },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );
      return response.data.id;
    } catch (error) {
      throw error;
    }
  }

  async clearPlaylist(id: string) {
    try {
      this.logger.debug(`Clearing playlist: ${id}`);
      const token = await this.authService.getValidAccessToken();
      let pageToken: string | undefined;
      
      do {
        const response = await firstValueFrom(
          this.httpService.get(`${this.apiUrl}/playlistItems`, {
            params: {
              part: 'id',
              playlistId: id,
              maxResults: 50,
              ...(pageToken && { pageToken }),
            },
            headers: { Authorization: `Bearer ${token}` },
          })
        );
        
        const items = response.data.items;
        pageToken = response.data.nextPageToken;
        
        this.logger.debug(`Found ${items.length} items to remove from playlist ${id}`);
        
        for (const item of items) {
          this.logger.debug(`Removing item: ${item.id} from playlist ${id}`);
          await firstValueFrom(
            this.httpService.delete(`${this.apiUrl}/playlistItems`, {
              params: { id: item.id },
              headers: { 
                Authorization: `Bearer ${token}`,
                Accept: 'application/json'
              },
            })
          );
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } while (pageToken);
      
      this.logger.log(`Successfully cleared playlist ${id}`);
    } catch (error) {
      this.logger.error(`Error clearing playlist ${id}:`, error);
      // throw error;
    }
  }

  async addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
    try {
      const token = await this.authService.getValidAccessToken();
      this.logger.debug(`Adding video to playlist: ${playlistId} with videoId: ${videoId}`);
      await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/playlistItems`,
          {
            snippet: {
              playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId,
              },
            },
          },
          {
            params: { part: 'snippet' },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );
    } catch (error) {
      // if (error instanceof AxiosError) {
      //   throw new Error(`Failed to add video to playlist: ${error.message}`);
      // }
      // throw error;
    }
  }

  async addVideosToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
    let successCount = 0;
    const maxVideos = parseInt(process.env.SONGS_TO_PICK || '50');
    // Add videos sequentially to respect API quotas
    for (let i = 0; i < videoIds.length; i++) {
      if (successCount >= maxVideos) break; // Break if we've reached the maximum
      
      const videoId = videoIds[i];
      try {
        await this.addVideoToPlaylist(playlistId, videoId);
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Failed to add video to playlist: ${videoId}`, error);
      }
    }
    
    this.logger.log(`Successfully added ${successCount} videos to playlist ${playlistId}`);
  }

  async getPlaylists(): Promise<YouTubePlaylist[]> {
    try {
      const token = await this.authService.getValidAccessToken();
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/playlists`, {
          params: { part: 'snippet,status', mine: true, maxResults: 50 },
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return response.data.items;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error('Failed to fetch playlists:', error.response?.data || error.message);
        throw new Error(`Failed to fetch playlists: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
} 