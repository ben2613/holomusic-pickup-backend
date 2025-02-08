import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HolodexModule } from './modules/holodex/holodex.module';
import { YouTubeModule } from './modules/youtube/youtube.module';
import { DynamoDBModule } from './modules/dynamodb/dynamodb.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import configuration from './config/configuration';
import { DiscordModule } from './modules/discord/discord.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    HolodexModule,
    YouTubeModule,
    DynamoDBModule,
    TasksModule,
    AuthModule,
    DiscordModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
