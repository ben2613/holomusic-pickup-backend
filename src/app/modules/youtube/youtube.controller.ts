import { Controller, Get } from '@nestjs/common';
import { YouTubePlaylistService } from './services/youtube.playlist.service';

@Controller('youtube')
export class YouTubeController {
  constructor(private readonly youtubePlaylistService: YouTubePlaylistService) {}

  @Get('playlists')
  async getPlaylists() {  
    return this.youtubePlaylistService.getPlaylists();
  }
} 