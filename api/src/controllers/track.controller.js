import * as trackService from '../services/track.service.js';

/** POST /api/v1/track — a batch of events from the mobile app. */
export async function ingest(req, res) {
  const accepted = await trackService.ingestBatch(req.body, { ip: req.ip });
  res.status(202).json({ accepted });
}
