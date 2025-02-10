# Hololive Music Pickup Backend

A serverless backend service that automatically tracks and filters Hololive music releases. Built with NestJS and AWS Lambda.

## Features

- 🎵 Automated YouTube music video tracking for Hololive channels
- 🔄 Daily scheduled tasks for fetching new songs and maintaining OAuth tokens
- 🎯 Smart filtering to identify original songs and covers
- 🔐 Secure OAuth2 authentication with YouTube API
- 📊 DynamoDB storage for song data
- 🔔 Discord webhook integration for notifications
- ☁️ Serverless deployment on AWS Lambda

## Song Selection Algorithm

The application uses a sophisticated weighted random selection algorithm to pick songs for playlists, designed to surface both popular and lesser-known songs. Here's how it works:

1. **Song Categorization**
   - Songs are first divided into four categories:
     - Hololive Original Songs
     - Hololive Cover Songs
     - Holostars Original Songs
     - Holostars Cover Songs
   - Songs are identified as Holostars content if either the channel or any mentioned collaborators are from Holostars

2. **View-Based Sorting**
   - Within each category, songs are sorted by view count in descending order
   - This creates a ranking where index 0 is the most viewed song

3. **Weighted Random Selection**
   - Songs are picked using a weighted probability system based on their position:
     ```
     Top 10% of songs:    1x weight
     10-20% position:     2x weight
     20-30% position:     4x weight
     30-40% position:     8x weight
     40-50% position:    16x weight
     50-60% position:    32x weight
     60-70% position:    64x weight
     70-80% position:   128x weight
     80-90% position:   256x weight
     Bottom 10%:        512x weight
     ```
   - This exponential weighting gives less viewed songs a significantly higher chance of being selected
   - Each time a song is picked, it's removed from the pool to avoid duplicates

4. **Playlist Creation**
   - Up to 50 songs are selected for each category
   - Selected songs are added to their respective playlists
   - Playlists are cleared and recreated daily to ensure fresh content

This algorithm ensures that:
- Less popular songs get more exposure
- Popular songs still have a chance to be included
- Each category maintains its own selection pool
- The selection process is random but weighted towards discovering hidden gems

## Prerequisites

- Node.js 18.x
- AWS CLI configured with appropriate credentials
- Serverless Framework CLI
- YouTube API credentials
- Discord webhook URL (for notifications)
- Holodex API key

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```env
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
DISCORD_ADMIN_WEBHOOK_URL=your_admin_webhook_url
DISCORD_NOTIFICATION_WEBHOOK_URL=your_notification_webhook_url
HOLODEX_API_KEY=your_holodex_api_key
YOUTUBE_API_KEY=your_youtube_api_key
```

## Installation

```bash
# Install dependencies
npm install

# Run locally
npm run start:dev

# Run serverless offline
npm run offline
```

## Deployment

```bash
# Deploy to AWS
npm run deploy
```

## API Endpoints

- `GET /auth/oauth/callback` - OAuth2 callback handler
- `GET /youtube/playlists` - List YouTube playlists
- `GET /` - Health check endpoint

## Scheduled Tasks

- `checkOAuthToken` - Runs daily at midnight UTC to refresh OAuth tokens
- `fetchAndFilterSongs` - Runs daily at 1 AM UTC to fetch and process new songs

## Development

```bash
# Run tests
npm run test

# Run e2e tests
npm run test:e2e

# Run linter
npm run lint
```

## Architecture

- **NestJS** - Backend framework
- **Serverless Framework** - AWS Lambda deployment
- **DynamoDB** - Data storage
- **YouTube API** - Video and playlist management
- **Discord Webhooks** - Notifications
- **Holodex API** - Hololive channel data

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

"Don't Ask Me About" License

```
The Don't Ask Me About It License

Copying and distribution of this file, with or without modification, are permitted in any medium provided you do not contact the author about the file or any problems you are having with the file
```
