import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment variables, validated once at start-up.
 * A missing or invalid value stops the server with a clear message instead
 * of failing later at runtime.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).default('mytplus_tracking'),
  DB_USER: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_SYNC: z.enum(['alter', 'force', 'none']).default('alter'),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  APP_API_KEY: z.string().min(16, 'APP_API_KEY must be at least 16 characters'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration (see .env.example):\n${lines.join('\n')}`);
  process.exit(1);
}
const env = parsed.data;

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: Object.freeze({
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    sync: env.DB_SYNC,
    logging: env.DB_LOGGING,
  }),

  appApiKey: env.APP_API_KEY,

  jwt: Object.freeze({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN }),
  firstAdmin: Object.freeze({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
});
