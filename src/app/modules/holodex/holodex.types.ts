// Types based on Holodex API OpenAPI specification

export interface Channel {
  id: string;
  name: string;
  english_name?: string;
  type: 'vtuber' | 'subber';
  photo: string;
  org?: string;
  suborg?: string;
}

export interface Video {
  id: string;
  title: string;
  type: 'stream' | 'clip';
  topic_id?: string;
  published_at?: string;
  available_at: string;
  duration: number;
  status: 'new' | 'upcoming' | 'live' | 'past' | 'missing';
  start_scheduled?: string;
  start_actual?: string;
  end_actual?: string;
  live_viewers?: number;
  description?: string;
  songcount?: number;
  channel_id: string;
  mentions?: Channel[];
}

export interface VideoWithChannel extends Video {
  channel: Channel;
}

export interface VideoSearchParams {
  channel_id?: string;
  status?: 'new' | 'upcoming' | 'live' | 'past' | 'missing';
  lang?: string;
  type?: 'stream' | 'clip';
  topic?: string;
  include?: string[];
  org?: string;
  mentioned_channel_id?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  paginated?: string;
  max_upcoming_hours?: number;
  id?: string;
  from?: string;
  to?: string;
}

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
} 