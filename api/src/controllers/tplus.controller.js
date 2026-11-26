/**
 * TPLUS service operations ported from the legacy PHP app (Register E-SIM,
 * Confirm Nice Number, Approve Add/Delete Number, Import IMSI).
 *
 * The list endpoints return EXAMPLE data (see tplus-mock.service.js) and the
 * action endpoints only record the request in the CCare activity log and reply
 * `connected: false` — the real telecom APIs are wired later. Swapping the mock
 * service for real calls is the only change needed; these controllers stay.
 */
import { ipOf, logCcare } from '../services/ccare-log.service.js';
import * as mock from '../services/tplus-mock.service.js';

/** Records a TPLUS operation in the CCare activity log (never throws). */
const record = (req, action, detail, success = true) =>
  logCcare({
    ccareUserId: req.me.kind === 'ccare' ? req.me.id : null,
    name: req.me.username,
    action,
    success,
    actor: req.me.username,
    ip: ipOf(req),
    detail,
  });

const DONE = (extra = {}) => ({
  ok: true,
  logged: true,
  connected: false,
  message: 'Request recorded. The telecom connection is not enabled yet.',
  ...extra,
});

// ── Register E-SIM ────────────────────────────────────────────────────────
/** GET /ccare/tplus/esim/next — a free IMSI + QR and the action list. */
export async function esimNext(_req, res) {
  res.json({ ...mock.nextEsim(), actions: mock.ESIM_ACTIONS });
}

/** POST /ccare/tplus/esim/register — { isdn, imsi, action }. */
export async function esimRegister(req, res) {
  const { isdn, imsi, action } = req.body;
  await record(req, 'tplus_esim_register', { isdn, imsi, action });
  res.json(DONE());
}

// ── Confirm Nice Number ───────────────────────────────────────────────────
/** GET /ccare/tplus/nice?search= — pending nice numbers. */
export async function niceList(req, res) {
  res.json({ rows: mock.niceNumbers(req.validatedQuery?.search ?? '') });
}

/** POST /ccare/tplus/nice/confirm — { msisdn }. */
export async function niceConfirm(req, res) {
  const { msisdn } = req.body;
  await record(req, 'tplus_nice_confirm', { msisdn });
  res.json(DONE());
}

// ── Approve Add / Delete Number ───────────────────────────────────────────
/** GET /ccare/tplus/pool?type=&search= — numbers awaiting approval. */
export async function poolList(req, res) {
  const { type, search } = req.validatedQuery ?? {};
  res.json({ rows: mock.poolNumbers({ priceType: type ?? '', search: search ?? '' }) });
}

/** POST /ccare/tplus/pool/approve — { msisdn, priceType }. */
export async function poolApprove(req, res) {
  const { msisdn, priceType } = req.body;
  await record(req, 'tplus_pool_approve', { msisdn, priceType });
  res.json(DONE());
}
