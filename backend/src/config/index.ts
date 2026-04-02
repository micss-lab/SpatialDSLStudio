import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  corsOrigin: string[];
  maxFileSize: number;
  logLevel: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  resendApiKey: string;
  resendFromEmail: string;
  appUrl: string;
}

const config: Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(origin => origin.trim()),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default
  logLevel: process.env.LOG_LEVEL || 'debug',
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
};

// Validate required configuration
if (!config.databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (config.nodeEnv === 'production' && config.jwt.secret === 'fallback-secret-key-change-in-production') {
  console.error('ERROR: JWT_SECRET must be set in production environment');
  process.exit(1);
}

if (config.nodeEnv === 'production') {
  if (!process.env.CORS_ORIGIN) {
    console.error('ERROR: CORS_ORIGIN must be set in production environment');
    process.exit(1);
  }

  const hasInvalidOrigin = config.corsOrigin.some(
    origin => !origin || origin === '*' || origin.includes('localhost') || origin.includes('127.0.0.1')
  );

  if (hasInvalidOrigin) {
    console.error('ERROR: CORS_ORIGIN contains invalid production values (localhost, 127.0.0.1, or *)');
    process.exit(1);
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('ERROR: JWT_SECRET must be at least 32 characters in production environment');
    process.exit(1);
  }
}

export default config;
