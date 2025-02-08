import { Controller, Get, Query, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('oauth/callback')
  async handleOAuthCallback(@Query('code') code: string) {
    this.logger.debug('Received OAuth callback with code');
    await this.authService.handleOAuthCallback(code);
    return { message: 'Authentication successful! You can close this window.' };
  }
} 