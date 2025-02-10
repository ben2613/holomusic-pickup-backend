import { Injectable, Logger } from '@nestjs/common';
import { SongProcessingService } from './services/song-processing.service';
import { OAuthService } from './services/oauth.service';
import { DiscordService } from '../discord/discord.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly songProcessingService: SongProcessingService,
    private readonly oAuthService: OAuthService,
    private readonly discordService: DiscordService,
  ) {}

  async fetchAndFilterSongs(): Promise<void> {
    try {
      this.logger.log('Starting fetchAndFilterSongs task...');
      
      const playlists = await this.songProcessingService.createYouTubePlaylists();
      await this.songProcessingService.fetchAndFilterSongs();
      const { stars, girls } = await this.songProcessingService.pickLessPopularSongs();
      await this.songProcessingService.insertIntoYouTubePlaylists(playlists, stars, girls);
      
      this.logger.log('Completed fetchAndFilterSongs task');

      // Send completion notification
      const totalSongs = stars.originals.length + stars.covers.length + girls.originals.length + girls.covers.length;
      await this.discordService.sendPlaylistUpdateComplete('All Playlists', totalSongs);
    } catch (error) {
      this.logger.error('Error in fetchAndFilterSongs task:', error);
      this.discordService.logError(`Error in fetchAndFilterSongs task: ${error.message}`);
      await this.discordService.sendErrorSummary();
      throw error;
    }
  }

  async checkOAuthToken(): Promise<void> {
    try {
      this.logger.log('Starting checkOAuthToken task...');
      await this.oAuthService.checkOAuthToken();
      this.logger.log('Completed checkOAuthToken task');
    } catch (error) {
      this.logger.error('Error in checkOAuthToken task:', error);
      this.discordService.logError(`Error in checkOAuthToken task: ${error.message}`);
      await this.discordService.sendErrorSummary();
      throw error;
    }
  }
} 