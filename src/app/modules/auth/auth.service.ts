import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DynamoDBService } from '../dynamodb/dynamodb.service';
import { DiscordService } from '../discord/discord.service';
import { AppConfig } from '../../config/configuration';
import { Credentials, OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private readonly oauth2Client: OAuth2Client;
  private readonly logger = new Logger(AuthService.name);
  private readonly OAUTH_DB_KEY = 'YOUTUBE_OAUTH_TOKEN';

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly dynamoDBService: DynamoDBService,
    private readonly discordService: DiscordService,
  ) {
    const config = this.configService.get('oauth');
    const clientId = config?.clientId;
    const clientSecret = config?.clientSecret;
    const redirectUri = config?.redirectUri;

    this.logger.debug('OAuth2 Config:', {
      clientId,
      clientSecret: clientSecret ? '***' : 'missing',
      redirectUri
    });

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing required OAuth configuration');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
  }

  /**
   * Gets a valid access token, refreshing if necessary.
   * This should be called before any YouTube API operation that requires authentication.
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = await this.dynamoDBService.get('hololive_songs', { id: this.OAUTH_DB_KEY });
    if (!tokens) {
      throw new Error('No OAuth tokens found');
    }

    // Check if token is expired or will expire in the next 5 minutes
    const expiryDate = new Date(tokens.expiry_date);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (expiryDate.getTime() - now.getTime() <= fiveMinutes) {
      this.logger.debug('Access token expired or will expire soon, refreshing...');
      await this.refreshToken();
      // Get the new tokens after refresh
      const newTokens = await this.dynamoDBService.get('hololive_songs', { id: this.OAUTH_DB_KEY });
      return newTokens.access_token;
    }

    return tokens.access_token;
  }

  async handleOAuthCallback(code: string): Promise<void> {
    try {
      this.logger.debug('Handling OAuth callback with code:', code.substring(0, 10) + '...');
      
      const { tokens } = await this.oauth2Client.getToken(code);
      this.logger.debug('Successfully obtained tokens');

      // Store tokens in DynamoDB
      await this.dynamoDBService.put('hololive_songs', {
        id: this.OAUTH_DB_KEY,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type,
        scope: tokens.scope,
      });

      // Send success message to Discord
      await this.discordService.sendEmbedMessage(
        '✅ YouTube Authentication Successful',
        'The application has been successfully authenticated with YouTube.',
        0x00ff00, // Green color
        [
          {
            name: 'Status',
            value: 'OAuth tokens have been stored securely.',
          },
          {
            name: 'Next Steps',
            value: 'The application will now be able to create and manage playlists automatically.',
          }
        ]
      );

      this.logger.log('OAuth flow completed successfully');
    } catch (error) {
      this.logger.error('Error in OAuth callback:', {
        error: error.message,
        response: error.response?.data,
        config: {
          redirectUri: this.configService.get('oauth')?.redirectUri,
          clientId: this.configService.get('oauth')?.clientId ? '***' : 'missing',
          clientSecret: this.configService.get('oauth')?.clientSecret ? '***' : 'missing'
        }
      });

      // Send error message to Discord
      await this.discordService.sendEmbedMessage(
        '❌ YouTube Authentication Failed',
        'Failed to complete the authentication process.',
        0xff0000, // Red color
        [
          {
            name: 'Error',
            value: error.message,
          }
        ]
      );
      
      throw new BadRequestException({
        message: 'Failed to exchange authorization code',
        error: error.response?.data || error.message
      });
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      const storedTokens = await this.dynamoDBService.get('hololive_songs', { id: this.OAUTH_DB_KEY });
      
      if (!storedTokens?.refresh_token) {
        throw new Error('No refresh token found');
      }

      this.oauth2Client.setCredentials({
        refresh_token: storedTokens.refresh_token
      });

      const response = await this.oauth2Client.refreshAccessToken();
      const credentials: Credentials = response.credentials;
      this.logger.debug('Successfully refreshed access token');

      // Update tokens in DynamoDB
      await this.dynamoDBService.put('hololive_songs', {
        id: this.OAUTH_DB_KEY,
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || storedTokens.refresh_token, // Keep old refresh token if new one not provided
        expiry_date: credentials.expiry_date,
        token_type: credentials.token_type,
        scope: credentials.scope,
      });

      this.logger.log('Token refresh completed successfully');
    } catch (error) {
      this.logger.error('Error refreshing token:', error);
      throw error;
    }
  }
} 