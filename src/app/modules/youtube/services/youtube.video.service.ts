import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { YouTubeVideo } from '../youtube.types';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class YouTubeVideoService {
  private readonly apiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    this.apiUrl = 'https://www.googleapis.com/youtube/v3';
  }

  async getVideoById(videoId: string): Promise<YouTubeVideo | null> {
    try {
      const token = await this.authService.getValidAccessToken();
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/videos`, {
          params: {
            part: 'snippet,statistics',
            id: videoId,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      if (!response.data.items?.length) {
        return null;
      }
      return response.data.items[0];
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to fetch video from YouTube: ${error.message}`);
      }
      return null;
    }
  }

  async getVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
    try {
      const token = await this.authService.getValidAccessToken();
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/videos`, {
          params: {
            part: 'snippet,statistics',
            id: videoIds.join(','),
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );
      return response.data.items || [];
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to fetch videos from YouTube: ${error.message}`);
      }
      return [];
    }
  }
} 