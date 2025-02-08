import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [DynamoDBModule, DiscordModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {} 