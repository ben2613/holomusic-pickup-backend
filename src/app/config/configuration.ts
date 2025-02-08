export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema: string;
}

export interface DynamoDBConfig {
  endpoint: string;
  region: string;
}

export interface JwtConfig {
  secret: string;
  expiration: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AppConfig {
  env: string;
  port: number;
  holodexApiKey: string;
  youtubeApiKey: string;
  youtubeOAuthToken: string;
  database: DatabaseConfig;
  dynamodb: DynamoDBConfig;
  jwt: JwtConfig;
  googleOAuth: GoogleOAuthConfig;
  oauth: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    backendHost: string;
  };
}

export default (): AppConfig => ({
  env: process.env.APP_ENV || 'dev',
  port: parseInt(process.env.PORT || '3000', 10),
  holodexApiKey: process.env.HOLODEX_API_KEY || '',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  youtubeOAuthToken: process.env.YOUTUBE_OAUTH_TOKEN || '',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'hm_pickup',
    schema: process.env.DB_SCHEMA || 'public',
  },
  dynamodb: {
    region: process.env.DYNAMODB_REGION || 'ap-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || `https://dynamodb.${process.env.DYNAMODB_REGION || 'ap-east-1'}.amazonaws.com`,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret',
    expiration: process.env.JWT_EXPIRATION || '1d',
  },
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4200/oauth/callback',
  },
  oauth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: `${process.env.BACKEND_HOST}/auth/oauth/callback`,
    backendHost: process.env.BACKEND_HOST,
  },
}); 