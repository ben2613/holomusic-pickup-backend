import { Injectable, Logger } from '@nestjs/common';
import { VideoWithChannel } from '../../holodex/holodex.types';
import { SongData } from './song-processing.service';

@Injectable()
export class SongFilterService {
  private readonly logger = new Logger(SongFilterService.name);

  /**
   * Apply all filters to a list of songs
   */
  filterSongs(songs: VideoWithChannel[], options: {
    filterInstrumental?: boolean;
    // Add more filter options here as needed
  } = {}): (VideoWithChannel)[] {
    this.logger.debug(`Filtering ${songs.length} songs with options:`, options);
    
    let filteredSongs = [...songs];

    // Apply each filter based on options
    if (options.filterInstrumental) {
      filteredSongs = this.filterInstrumentalSongs(filteredSongs);
    }

    // Add more filters here as needed
    
    this.logger.debug(`Filtered to ${filteredSongs.length} songs`);
    return filteredSongs;
  }

  /**
   * Filter out instrumental songs
   */
  private filterInstrumentalSongs(songs: (VideoWithChannel)[]): (VideoWithChannel)[] {
    return songs.filter(song => !song.title.toLowerCase().includes('instrumental'));
  }
} 