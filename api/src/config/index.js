import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Which settings file to load (from the api folder):
 *   ENV_FILE=…              → that file
 *   NODE_ENV=production     → .env.production (prod: SQL Server), when it exists
 *   otherwise               → .env (dev: PostgreSQL)
 */
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prodFile = path.join(apiDir, '.env.production');
export const envFile = path.resolve(
  apiDir,
  process.env.ENV_FILE || (process.env.NODE_ENV === 'production' && fs.existsSync(prodFile) ? prodFile : '.env'),
);
dotenv.config({ path: envFile });

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

  // Main database. Sequelize creates/updates the tables here.
  // postgres (dev) or mssql (SQL Server, prod).
  DB_DIALECT: z.enum(['postgres', 'mssql']).default('postgres'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().optional(),
  DB_NAME: z.string().min(1).default('mytplus_tracking'),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().default(''),
  DB_ENCRYPT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_TRUST_CERT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DB_SYNC: z.enum(['alter', 'force', 'none']).default('alter'),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  APP_API_KEY: z.string().min(16, 'APP_API_KEY must be at least 16 characters'),

  // PostgreSQL to copy from with `npm run migrate:pg` (into SQL Server).
  PG_HOST: z.string().default(''),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_NAME: z.string().default(''),
  PG_USER: z.string().default('postgres'),
  PG_PASSWORD: z.string().default(''),

  // Admin "SQL Query" page (it uses the main database above).
  SQL_MAX_ROWS: z.coerce.number().int().positive().default(5000),
  SQL_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default(''),

  // CCare staff sign-in (Tb_User_detail): one-time code by SMS (TplusSMS gateway).
  SMS_URL: z.string().default(''),
  SMS_APIKEY: z.string().default(''),
  SMS_USER: z.string().default('TPLUS'),
  SMS_FROM: z.string().default('TPLUS'),
  // Lao mobiles are stored as 20xxxxxxxx; the gateway may want 85620xxxxxxxx.
  SMS_COUNTRY_CODE: z.string().default(''),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  // Comma-separated phone numbers that always receive a REAL SMS while testing;
  // when SMS is unconfigured the code is returned to the caller instead (dev only).
  OTP_TEST_NUMBERS: z.string().default(''),

  // CCare login source:
  //   proxy  → the existing My CCare API only (real accounts; our own won't work)
  //   local  → our own md5 + SMS only (MyTPlus-created accounts)
  //   hybrid → try the My CCare API first, fall back to our own md5 (both work)
  // Server activity agent (deploy/server-agent): shared secret it sends in
  // `x-agent-key`. Empty → the agent endpoint is switched off.
  SERVER_AGENT_KEY: z
    .string()
    .default('')
    .refine((v) => v === '' || v.length >= 24, 'SERVER_AGENT_KEY must be at least 24 characters'),
  // After this many seconds without a heartbeat an agent is shown as silent.
  SERVER_AGENT_STALE_SECONDS: z.coerce.number().int().positive().default(180),

  // CCare passwords expire this many days after they were set (0 = never).
  CCARE_PASSWORD_MAX_AGE_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
  CCARE_AUTH_MODE: z.enum(['proxy', 'local', 'hybrid']).default('hybrid'),
  CCARE_AUTH_URL: z.string().default('http://10.30.6.94:5151'),
  CCARE_LOGIN_PATH: z.string().default('/api/8'),
  CCARE_VERIFY_PATH: z.string().default('/api/9'),
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

  envFile,

  db: Object.freeze({
    dialect: env.DB_DIALECT,
    host: env.DB_HOST,
    port: env.DB_PORT ?? (env.DB_DIALECT === 'mssql' ? 1433 : 5432),
    name: env.DB_NAME,
    user: env.DB_USER ?? (env.DB_DIALECT === 'mssql' ? 'sa' : 'postgres'),
    password: env.DB_PASSWORD,
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_CERT,
    sync: env.DB_SYNC,
    logging: env.DB_LOGGING,
  }),

  appApiKey: env.APP_API_KEY,

  pg: Object.freeze({
    enabled: !!env.PG_HOST && !!env.PG_NAME,
    host: env.PG_HOST,
    port: env.PG_PORT,
    name: env.PG_NAME,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
  }),

  // Admin "SQL Query" page: rows sent per result and the query time limit.
  sqlConsole: Object.freeze({ maxRows: env.SQL_MAX_ROWS, timeoutMs: env.SQL_TIMEOUT_MS }),

  jwt: Object.freeze({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN }),
  firstAdmin: Object.freeze({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),

  // CCare SMS one-time codes. `enabled` false → the code is returned to the
  // caller (development), so the flow works without a live SMS gateway.
  sms: Object.freeze({
    enabled: !!env.SMS_URL && !!env.SMS_APIKEY,
    url: env.SMS_URL,
    apiKey: env.SMS_APIKEY,
    user: env.SMS_USER,
    from: env.SMS_FROM,
    countryCode: env.SMS_COUNTRY_CODE,
  }),
  otp: Object.freeze({
    ttlMs: env.OTP_TTL_SECONDS * 1000,
    length: env.OTP_LENGTH,
    testNumbers: env.OTP_TEST_NUMBERS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }),

  ccarePasswordMaxAgeDays: env.CCARE_PASSWORD_MAX_AGE_DAYS,

  serverAgent: Object.freeze({ key: env.SERVER_AGENT_KEY, staleMs: env.SERVER_AGENT_STALE_SECONDS * 1000 }),

  // CCare login: delegate to the existing My CCare API ('proxy') or own it ('local').
  ccareAuth: Object.freeze({
    mode: env.CCARE_AUTH_MODE,
    base: env.CCARE_AUTH_URL.replace(/\/$/, ''),
    loginPath: env.CCARE_LOGIN_PATH,
    verifyPath: env.CCARE_VERIFY_PATH,
  }),
});
