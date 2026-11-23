import { z } from 'zod';
import { CONNECTIONS } from '../services/sql-console.service.js';

const name = z.string().trim().min(1).max(128);
const conn = z.enum(CONNECTIONS).optional();

export const connQuery = z.object({ conn });
export const objectsQuery = z.object({ conn, db: name });
export const columnsQuery = z.object({ conn, db: name, schema: name, name });
export const runQuerySchema = z.object({
  conn,
  db: name,
  sql: z.string().min(1, 'Type some SQL first').max(1_000_000, 'SQL text is too long'),
});
export const backupSchema = z.object({ conn, db: name });
