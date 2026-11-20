import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Op } from 'sequelize';
import { ZodError } from 'zod';
import { config } from './config.js';
import { ensureDatabase, sequelize } from './db.js';
import { Admin, Event } from './models/index.js';
import adminRoutes from './routes/admin.js';
import trackRoutes from './routes/track.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));

// The app calls /api/v1/track from phones (no browser origin), so CORS only
// matters for the admin website.
app.use(
  '/api/admin',
  cors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization'] }),
);

app.get('/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/v1/track', trackRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: 'Invalid request', issues: err.issues });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body is not valid JSON' });
  }
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

async function createFirstAdmin() {
  if ((await Admin.count()) > 0) return;
  if (!config.adminPassword || config.adminPassword.startsWith('change-me')) {
    console.warn('No admin account yet. Set ADMIN_USERNAME / ADMIN_PASSWORD in .env and restart.');
    return;
  }
  await Admin.create({
    username: config.adminUsername,
    passwordHash: await bcrypt.hash(config.adminPassword, 10),
    displayName: 'Administrator',
  });
  console.log(`Created admin account "${config.adminUsername}"`);
}

function scheduleRetention() {
  if (!config.retentionDays) return;
  const run = async () => {
    const cutoff = new Date(Date.now() - config.retentionDays * 86_400_000);
    const deleted = await Event.destroy({ where: { occurredAt: { [Op.lt]: cutoff } } });
    if (deleted) console.log(`Retention: deleted ${deleted} events older than ${config.retentionDays} days`);
  };
  run().catch(console.error);
  setInterval(() => run().catch(console.error), 24 * 60 * 60 * 1000).unref();
}

async function start() {
  await ensureDatabase();
  await sequelize.authenticate();
  if (config.db.sync !== 'none') {
    await sequelize.sync({ alter: config.db.sync === 'alter', force: config.db.sync === 'force' });
  }
  await createFirstAdmin();
  scheduleRetention();
  app.listen(config.port, () => {
    console.log(`MyTPlus tracking API listening on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
