import * as statsService from '../services/stats.service.js';

/** GET /stats/overview?days=|from=&to= */
export async function overview(req, res) {
  res.json(await statsService.getOverview(req.query));
}

/** GET /stats/packages?days=|from=&to= */
export async function packages(req, res) {
  res.json(await statsService.getPackageStats(req.query));
}

/** GET /stats/features?days=|from=&to=&userId= */
export async function features(req, res) {
  res.json(await statsService.getFeatureStats(req.query));
}
