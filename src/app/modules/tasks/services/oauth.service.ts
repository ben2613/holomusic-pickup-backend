import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../../dynamodb/dynamodb.service';
import { DiscordService } from '../../discord/discord.service';
import { AppConfig } from '../../../config/configuration';

export const OAUTH_DB_KEY = 'YOUTUBE_OAUTH_TOKEN';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly dynamoDBService: DynamoDBService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly discordService: DiscordService,
  ) {}

  async checkOAuthToken(): Promise<void> {
    this.logger.log('Checking OAuth token status...');
    
    try {
      const token = await this.dynamoDBService.get('hololive_songs', { id: OAUTH_DB_KEY });
      
      if (!token) {
        this.logger.warn('No OAuth token found in DynamoDB');
        await this.sendOAuthLoginLink();
        return;
      }

      this.logger.log('OAuth token exists in DynamoDB');
    } catch (error) {
      this.logger.error('Error checking OAuth token:', error);
      throw error;
    }
  }

  private async sendOAuthLoginLink(): Promise<void> {
    const config = this.configService.get('oauth');
    const clientId = config?.clientId;
    const redirectUri = config?.redirectUri;
    
    if (!clientId || !redirectUri) {
      throw new Error('Missing OAuth configuration');
    }
    
    const scopes = [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ];

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    const embed = {
      title: '🔑 YouTube OAuth Authentication Required',
      description: 'The application needs YouTube OAuth authentication to function properly.',
      color: 0xff0000, // Red color for urgency
      fields: [
        {
          name: 'Action Required',
          value: 'Please click the link below to authenticate with YouTube:',
        },
        {
          name: 'Authentication Link',
          value: authUrl.toString(),
        },
      ],
      footer: {
        text: 'This link will grant the application necessary permissions to manage YouTube playlists',
      },
    };

    await this.discordService.sendMessage({
      embeds: [embed],
    });

    this.logger.log('Sent OAuth login link to Discord');
  }
} 