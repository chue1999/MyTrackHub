import { sequelize } from '../db/index.js';

/** GET /health — for load balancers and uptime monitors. */
export async function health(_req, res) {
  try {
    await sequelize.authenticate();
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ ok: false });
  }
}
