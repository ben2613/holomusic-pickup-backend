import { Injectable, Logger } from '@nestjs/common';
import { VideoWithChannel } from '../../holodex/holodex.types';
import { SongData } from './song-processing.service';
import { EXCLUDE_VIDEO_IDS } from '@app/const/excludeVideoIds';

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

    filteredSongs = this.filterExcludeVideoIds(filteredSongs);

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

  private filterExcludeVideoIds(songs: (VideoWithChannel)[]): (VideoWithChannel)[] {
    return songs.filter(song => !EXCLUDE_VIDEO_IDS.includes(song.id));
  }
}
