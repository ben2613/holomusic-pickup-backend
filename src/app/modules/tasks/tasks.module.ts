import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks.service';
import { HolodexModule } from '../holodex/holodex.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { DiscordModule } from '../discord/discord.module';
import { SongProcessingService } from './services/song-processing.service';
import { OAuthService } from './services/oauth.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HolodexModule,
    YouTubeModule,
    DynamoDBModule,
    DiscordModule,
  ],
  providers: [
    TasksService,
    SongProcessingService,
    OAuthService,
  ],
  exports: [TasksService],
})
export class TasksModule {} 