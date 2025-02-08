import { Injectable, Logger } from '@nestjs/common';
import { SongProcessingService } from './services/song-processing.service';
import { OAuthService } from './services/oauth.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly songProcessingService: SongProcessingService,
    private readonly oAuthService: OAuthService,
  ) {}

  async fetchAndFilterSongs(): Promise<void> {
    this.logger.log('Starting fetchAndFilterSongs task...');
    await this.songProcessingService.fetchAndFilterSongs();
    const { stars, girls } = await this.songProcessingService.pickLessPopularSongs();
    await this.songProcessingService.createYouTubePlaylists(stars, girls);
    this.logger.log('Completed fetchAndFilterSongs task');
  }

  async checkOAuthToken(): Promise<void> {
    this.logger.log('Starting checkOAuthToken task...');
    await this.oAuthService.checkOAuthToken();
    this.logger.log('Completed checkOAuthToken task');
  }
} 