import * as brandingService from '../services/branding.service.js';
import * as retentionService from '../services/retention.service.js';

/** GET /settings/retention?days=|months= (previews another period) */
export async function getRetention(req, res) {
  const { days, months } = req.validatedQuery;
  res.json(await retentionService.getRetentionInfo({ preview: days || months ? { days, months } : undefined }));
}

/** PUT /settings/retention */
export async function updateRetention(req, res) {
  res.json(await retentionService.updateRetention(req.body, req.me.username));
}

/** POST /settings/retention/run */
export async function runRetentionNow(req, res) {
  res.json(await retentionService.runCleanupNow(req.me.username));
}

/** GET /settings/branding (also public: GET /api/v1/public/branding) */
export async function getBranding(_req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json(await brandingService.getBranding());
}

/** PUT /settings/branding */
export async function updateBranding(req, res) {
  res.json(await brandingService.updateBranding(req.body, req.me.username));
}
