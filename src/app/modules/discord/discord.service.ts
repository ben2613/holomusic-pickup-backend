import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DiscordWebhookMessage } from './discord.types';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);
  private readonly webhookUrls: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const webhookUrlsString = this.configService.get<string>('DISCORD_WEBHOOK_URLS');
    if (!webhookUrlsString) {
      this.logger.warn('No Discord webhook URLs configured');
      this.webhookUrls = [];
    } else {
      this.webhookUrls = webhookUrlsString.split(',').map(url => url.trim());
      this.logger.log(`Initialized with ${this.webhookUrls.length} webhook URLs`);
    }
  }

  async sendMessage(message: DiscordWebhookMessage): Promise<void> {
    if (this.webhookUrls.length === 0) {
      this.logger.warn('No Discord webhook URLs configured, skipping message send');
      return;
    }

    const sendPromises = this.webhookUrls.map(async (webhookUrl) => {
      try {
        await firstValueFrom(
          this.httpService.post(webhookUrl, message)
        );
        this.logger.debug(`Successfully sent message to webhook`);
      } catch (error) {
        this.logger.error(`Failed to send message to webhook: ${error.message}`);
        throw error;
      }
    });

    try {
      await Promise.all(sendPromises);
    } catch (error) {
      this.logger.error('Failed to send message to one or more webhooks');
      throw error;
    }
  }

  async sendSimpleMessage(content: string): Promise<void> {
    await this.sendMessage({ content });
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

    await this.sendMessage({
      embeds: [embed],
    });
  }
} 