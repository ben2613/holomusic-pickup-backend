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
DISCORD_WEBHOOK_URLS=your_webhook_urls
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

ISC License 