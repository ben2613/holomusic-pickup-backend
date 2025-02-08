import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { VideoSearchParams, VideoWithChannel, PaginatedResponse, Channel } from './holodex.types';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class HolodexService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.apiUrl = 'https://holodex.net/api/v2';
    this.apiKey = this.configService.get('holodexApiKey', { infer: true });
  }

  private getHeaders() {
    return {
      'X-APIKEY': this.apiKey,
    };
  }

  async searchVideos(params: VideoSearchParams): Promise<VideoWithChannel[] | PaginatedResponse<VideoWithChannel>> {
    try {
      const response = await firstValueFrom<AxiosResponse<VideoWithChannel[] | PaginatedResponse<VideoWithChannel>>>(
        this.httpService.get<VideoWithChannel[] | PaginatedResponse<VideoWithChannel>>(`${this.apiUrl}/videos`, {
          headers: this.getHeaders(),
          params: {
            ...params,
            // Convert include array to comma-separated string if it exists
            include: params.include?.join(','),
          },
        })
      );
      
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to fetch videos from Holodex: ${error.message}`);
      }
      throw error;
    }
  }

  async getVideoById(videoId: string, params?: Pick<VideoSearchParams, 'lang'>): Promise<VideoWithChannel> {
    try {
      const response = await firstValueFrom<AxiosResponse<VideoWithChannel>>(
        this.httpService.get<VideoWithChannel>(`${this.apiUrl}/videos/${videoId}`, {
          headers: this.getHeaders(),
          params,
        })
      );
      
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to fetch video from Holodex: ${error.message}`);
      }
      throw error;
    }
  }
} 