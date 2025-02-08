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
            status: { privacyStatus: 'private' },
          },
          {
            params: { part: 'snippet,status' },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );
      return response.data.id;
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to create YouTube playlist: ${error.message}`);
      }
      throw error;
    }
  }

  async clearPlaylist(id: string) {
    const token = await this.authService.getValidAccessToken();
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/playlistItems`, {
        params: { part: 'id', playlistId: id },
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    const items = response.data.items;
    for (const item of items) {
      await firstValueFrom(
        this.httpService.delete(`${this.apiUrl}/playlistItems`, {
          params: { part: 'id', id: item.id },
        })
      );
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
      if (error instanceof AxiosError) {
        throw new Error(`Failed to add video to playlist: ${error.message}`);
      }
      throw error;
    }
  }

  async addVideosToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
    // Add videos sequentially to respect API quotas
    for (const videoId of videoIds) {
      await this.addVideoToPlaylist(playlistId, videoId);
    }
  }

  async updatePlaylistPrivacy(playlistId: string, privacyStatus: 'private' | 'unlisted' | 'public'): Promise<void> {
    try {
      const token = await this.authService.getValidAccessToken();
      this.logger.debug(`Updating playlist ${playlistId} privacy to ${privacyStatus}`);
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/playlists`, {
          params: { part: 'snippet,status', id: playlistId },
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      const playlist = response.data.items[0];
      if (!playlist) {
        throw new Error(`Playlist ${playlistId} not found`);
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.apiUrl}/playlists`,
          {
            id: playlistId,
            snippet: {
              title: playlist.snippet.title,
              description: playlist.snippet.description,
            },
            status: { privacyStatus },
          },
          {
            params: { part: 'snippet,status' },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );
      this.logger.debug(`Successfully updated playlist ${playlistId} privacy to ${privacyStatus}`);
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error('Failed to update playlist privacy:', error.response?.data || error.message);
        throw new Error(`Failed to update playlist privacy: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
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