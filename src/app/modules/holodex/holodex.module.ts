import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HolodexService } from './holodex.service';

@Module({
  imports: [
    HttpModule,
  ],
  providers: [HolodexService],
  exports: [HolodexService],
})
export class HolodexModule {} 