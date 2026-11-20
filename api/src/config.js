import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'mytplus_tracking',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    sync: process.env.DB_SYNC || 'alter', // alter | force | none
    logging: process.env.DB_LOGGING === 'true',
  },

  appApiKey: required('APP_API_KEY'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  retentionDays: Number(process.env.RETENTION_DAYS || 0),
};
