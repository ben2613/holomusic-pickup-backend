import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DiscordWebhookMessage } from './discord.types';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);
  private readonly adminWebhookUrl: string;
  private readonly notificationWebhookUrl: string;
  private errorMessages: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.adminWebhookUrl = this.configService.get<string>('DISCORD_ADMIN_WEBHOOK_URL');
    this.notificationWebhookUrl = this.configService.get<string>('DISCORD_NOTIFICATION_WEBHOOK_URL');

    if (!this.adminWebhookUrl) {
      this.logger.warn('No admin Discord webhook URL configured');
    }
    if (!this.notificationWebhookUrl) {
      this.logger.warn('No notification Discord webhook URL configured');
    }
  }

  private async sendToWebhook(webhookUrl: string, message: DiscordWebhookMessage): Promise<void> {
    if (!webhookUrl) {
      this.logger.warn('No webhook URL provided, skipping message send');
      return;
    }

    // Add @everyone mention to all messages
    const messageWithMention = {
      ...message,
      content: `@everyone${message.content ? ' ' + message.content : ''}`,
    };

    try {
      await firstValueFrom(
        this.httpService.post(webhookUrl, messageWithMention)
      );
      this.logger.debug(`Successfully sent message to webhook`);
    } catch (error) {
      this.logger.error(`Failed to send message to webhook: ${error.message}`);
      throw error;
    }
  }

  async sendToAdmin(message: DiscordWebhookMessage): Promise<void> {
    await this.sendToWebhook(this.adminWebhookUrl, message);
  }

  async sendToNotification(message: DiscordWebhookMessage): Promise<void> {
    await this.sendToWebhook(this.notificationWebhookUrl, message);
  }

  async sendOAuthLink(oauthUrl: string): Promise<void> {
    const embed = {
      title: 'OAuth Authentication Link',
      description: `Click [here](${oauthUrl}) to authenticate with Google OAuth.`,
      color: 0x00ff00,
      timestamp: new Date().toISOString(),
    };

    await this.sendToAdmin({
      embeds: [embed],
    });
  }

  logError(error: string): void {
    this.errorMessages.push(`[${new Date().toISOString()}] ${error}`);
  }

  async sendErrorSummary(): Promise<void> {
    if (this.errorMessages.length === 0) {
      return;
    }

    const errorSummary = this.errorMessages.slice(-10).join('\n'); // Get last 10 errors
    const totalErrors = this.errorMessages.length;

    const embed = {
      title: 'Error Summary',
      description: totalErrors > 10 
        ? `Last 10 of ${totalErrors} errors:\n\n${errorSummary}`
        : `All ${totalErrors} errors:\n\n${errorSummary}`,
      color: 0xff0000,
      timestamp: new Date().toISOString(),
    };

    await this.sendToAdmin({
      embeds: [embed],
    });

    // Clear the error messages after sending
    this.errorMessages = [];
  }

  async sendPlaylistUpdateComplete(playlistName: string, songsUpdated: number): Promise<void> {
    const embed = {
      title: 'Playlist Update Complete',
      description: `Successfully updated playlist "${playlistName}" with ${songsUpdated} songs.`,
      color: 0x00ff00,
      timestamp: new Date().toISOString(),
    };

    await this.sendToNotification({
      embeds: [embed],
    });
  }

  // Legacy methods for backward compatibility
  async sendMessage(message: DiscordWebhookMessage): Promise<void> {
    await this.sendToNotification(message);
  }

  async sendSimpleMessage(content: string): Promise<void> {
    await this.sendToNotification({ content });
  }

  async sendEmbedMessage(
    title: string,
    description: string,
    color?: number,
    fields?: Array<{ name: string; value: string; inline?: boolean }>,
    thumbnail?: string
  ): Promise<void> {
    const embed = {
      title,
      description,
      color,
      fields,
      thumbnail: thumbnail ? { url: thumbnail } : undefined,
      timestamp: new Date().toISOString(),
    };

    await this.sendToNotification({
      embeds: [embed],
    });
  }
} 