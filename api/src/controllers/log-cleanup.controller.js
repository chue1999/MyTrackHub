import { ipOf } from '../services/ccare-log.service.js';
import * as cleanup from '../services/log-cleanup.service.js';

// CCare administrators may only clean the CCare log; MyTPlus administrators any log.
const kindFor = (req) => (req.me.kind === 'ccare' ? 'ccare' : req.validatedQuery.kind);

/** GET …/logs-cleanup?kind=&days= — how many entries would be deleted. */
export async function preview(req, res) {
  res.json(await cleanup.preview(kindFor(req), req.validatedQuery.days));
}

/** DELETE …/logs-cleanup?kind=&days= — delete entries older than N days (recorded in the audit log). */
export async function run(req, res) {
  res.json(await cleanup.cleanup(kindFor(req), req.validatedQuery.days, { by: req.me.username, ip: ipOf(req) }));
}
