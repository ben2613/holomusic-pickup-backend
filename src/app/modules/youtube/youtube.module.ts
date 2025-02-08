import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { YouTubeVideoService } from './services/youtube.video.service';
import { YouTubePlaylistService } from './services/youtube.playlist.service';
import { YouTubeController } from './youtube.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    AuthModule,
  ],
  providers: [YouTubeVideoService, YouTubePlaylistService],
  exports: [YouTubeVideoService, YouTubePlaylistService],
  controllers: [YouTubeController],
})
export class YouTubeModule {} 