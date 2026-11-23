import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';
import { signToken } from '../utils/jwt.js';
import * as ccare from './ccare.service.js';
import { logCcare } from './ccare-log.service.js';
import { normalizePhone, sendSms } from './sms.service.js';

/**
 * CCare staff sign-in with a one-time SMS code (two steps):
 *   start  → check name + password, send a code to the account's phone
 *   verify → check the code, issue the login token
 * Plus the same two steps for "forgot password".
 *
 * Codes live in memory with a short expiry (one pm2 worker). On restart any
 * pending code is simply gone and the person asks for a new one.
 */
const challenges = new Map();

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function newCode() {
  let code = '';
  for (let i = 0; i < config.otp.length; i += 1) code += crypto.randomInt(0, 10);
  return code;
}

/** 20781234 → ••••••1234 */
function maskPhone(phone) {
  const d = String(phone || '');
  return d.length <= 4 ? d : '••••••' + d.slice(-4);
}

function store(data) {
  const id = crypto.randomBytes(24).toString('hex');
  challenges.set(id, { ...data, attempts: 0, expires: Date.now() + config.otp.ttlMs });
  // Opportunistic cleanup so the map can't grow without bound.
  if (challenges.size > 500) {
    const now = Date.now();
    for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
  }
  return id;
}

function ccareIdentity(user) {
  return {
    id: user.id,
    username: user.name,
    displayName: user.nameLa || user.name,
    role: 'ccare',
    kind: 'ccare',
    canManage: user.canManage,
    staffId: user.staffId,
    division: user.division,
  };
}

/**
 * Sends a code to the account and returns the challenge. In development (no SMS
 * gateway) the code comes back in `devCode` so the flow is testable. With a
 * gateway plus OTP_TEST_NUMBERS set, only those numbers are enabled — everyone
 * else is refused, so real staff are never texted during a test window.
 */
async function issueCode({ user, purpose, action, ip }) {
  const phone = user.staffTel;
  if (!phone) throw HttpError.badRequest('No phone number on file for this account. Ask an administrator.');

  const to = normalizePhone(phone);
  const whitelist = config.otp.testNumbers;
  const whitelisted = whitelist.length === 0 || whitelist.includes(phone) || whitelist.includes(to);
  if (config.sms.enabled && !whitelisted) {
    await logCcare({
      ccareUserId: user.id,
      name: user.name,
      action: 'otp_blocked',
      success: false,
      ip,
      detail: { purpose },
    });
    throw HttpError.forbidden('CCare sign-in is still being set up for your number. Please try again later.');
  }

  const code = newCode();
  const challenge = store({ userId: user.id, name: user.name, phone, codeHash: sha(code), purpose });
  const content = `MyTPlus CCare code: ${code} (valid ${Math.round(config.otp.ttlMs / 60000)} min). Do not share it.`;

  let gateway = 'disabled';
  if (config.sms.enabled) {
    try {
      const r = await sendSms(to, content);
      gateway = r.ok ? 'sent' : `error:${r.status ?? ''}`;
    } catch (err) {
      gateway = 'error';
      await logCcare({
        ccareUserId: user.id,
        name: user.name,
        action: 'otp_sent',
        success: false,
        ip,
        detail: { purpose, phoneHint: maskPhone(phone), error: err.message },
      });
      throw new HttpError(502, 'Could not send the SMS code. Please try again.');
    }
  }
  await logCcare({
    ccareUserId: user.id,
    name: user.name,
    action: action || 'otp_sent',
    success: true,
    ip,
    detail: { purpose, phoneHint: maskPhone(phone), gateway },
  });

  const out = { challenge, phoneHint: maskPhone(phone), length: config.otp.length };
  // Return the code only in development; never in production, even with SMS off.
  if (!config.sms.enabled && !config.isProduction) out.devCode = code;
  return out;
}

const PROXY = config.ccareAuth.mode === 'proxy';

/** What the sign-in portal may offer, given the auth mode. */
export function portalConfig() {
  // In proxy mode passwords live in the My CCare system, so we can't create
  // accounts or reset passwords here (our hash would not match theirs).
  return { mode: config.ccareAuth.mode, canRegister: !PROXY, canReset: !PROXY };
}

/** Step 1 of sign-in: name + password → send a code. */
export async function startLogin({ name, password, ip }) {
  if (PROXY) return startLoginProxy({ name, password, ip });
  const user = await ccare.verifyLogin(name, password); // throws 403 if the account is closed
  if (!user) {
    await logCcare({ name, action: 'login_fail', success: false, ip });
    throw new HttpError(401, 'Wrong username or password', 'INVALID_CREDENTIALS');
  }
  return issueCode({ user, purpose: 'login', action: 'login_start', ip });
}

/** Step 2 of sign-in: the code → a login token. */
export async function verifyLogin({ challenge, code, ip }) {
  const entry = challenges.get(challenge);
  if (entry?.mode === 'proxy') return verifyLoginProxy({ challenge, code, ip });
  const checked = take(challenge, 'login', code, ip);
  const user = await ccare.getActiveById(checked.userId);
  if (!user) throw new HttpError(403, 'This CCare account is closed. Ask an administrator.', 'ACCOUNT_DISABLED');
  await logCcare({ ccareUserId: user.id, name: user.name, action: 'login_ok', success: true, ip });
  const identity = ccareIdentity(user);
  return { token: signToken(identity), admin: identity };
}

/**
 * Proxy login: the existing My CCare API checks the password and sends its own
 * OTP; we just relay. We never see the password hash, so staff keep their current
 * passwords. We still log everything and issue our own session token.
 */
async function startLoginProxy({ name, password, ip }) {
  const { remoteLogin } = await import('./ccare-remote.service.js');
  let r;
  try {
    r = await remoteLogin(name, password);
  } catch (err) {
    await logCcare({ name, action: 'login_fail', success: false, ip, detail: { error: err.message } });
    throw new HttpError(502, 'The CCare sign-in service is unavailable. Please try again.');
  }
  if (!r.ok) {
    await logCcare({ name, action: 'login_fail', success: false, ip, detail: { message: r.message } });
    throw new HttpError(401, r.message || 'Wrong username or password', 'INVALID_CREDENTIALS');
  }
  // A local profile (phone hint, etc.) is nice-to-have; absence must not block login.
  const profile = await ccare.getByName(name).catch(() => null);
  const challenge = store({ name, purpose: 'login', mode: 'proxy' });
  await logCcare({
    ccareUserId: profile?.id,
    name,
    action: 'login_start',
    success: true,
    ip,
    detail: { via: 'proxy' },
  });
  return {
    challenge,
    phoneHint: profile?.staffTel ? maskPhone(profile.staffTel) : 'your phone',
    length: config.otp.length,
  };
}

async function verifyLoginProxy({ challenge, code, ip }) {
  const entry = challenges.get(challenge);
  if (!entry || entry.purpose !== 'login') throw HttpError.badRequest('This sign-in has expired. Start again.');
  const { remoteVerify } = await import('./ccare-remote.service.js');
  let r;
  try {
    r = await remoteVerify(String(code).trim());
  } catch (err) {
    throw new HttpError(502, `Could not confirm the code: ${err.message}`);
  }
  if (!r.ok) {
    await logCcare({
      name: entry.name,
      action: 'otp_fail',
      success: false,
      ip,
      detail: { via: 'proxy', message: r.message },
    });
    throw HttpError.badRequest(r.message || 'Wrong code. Please try again.');
  }
  challenges.delete(challenge);
  // Load our local profile for roles/division; fall back to the API's userData.
  const id = Number(r.userData?.ID);
  const user = (id && (await ccare.getById(id).catch(() => null))) || {
    id,
    name: r.userData?.Name || entry.name,
    nameLa: r.userData?.Name || entry.name,
    canManage: (r.userData?.Status ?? '') === '3',
    staffId: null,
    division: null,
  };
  await logCcare({
    ccareUserId: user.id,
    name: user.name,
    action: 'login_ok',
    success: true,
    ip,
    detail: { via: 'proxy' },
  });
  const identity = ccareIdentity(user);
  return { token: signToken(identity), admin: identity };
}

/** Forgot password, step 1: name → send a code (never reveals whether the name exists). */
export async function startForgot({ name, ip }) {
  if (PROXY) {
    throw HttpError.badRequest('Password reset is handled in the My CCare system. Please ask an administrator.');
  }
  const user = await ccare.getByName(name);
  if (user && user.active && user.staffTel) {
    return issueCode({ user, purpose: 'reset', action: 'forgot_request', ip });
  }
  await logCcare({ name, action: 'forgot_request', success: false, ip, detail: { reason: 'no such active account' } });
  // Same shape as success, so the response does not reveal who exists.
  return { challenge: crypto.randomBytes(24).toString('hex'), phoneHint: '••••••••', length: config.otp.length };
}

/** Forgot password, step 2: the code + a new password. */
export async function resetPassword({ challenge, code, newPassword, ip }) {
  const entry = take(challenge, 'reset', code, ip);
  await ccare.resetPassword(entry.userId, newPassword);
  await logCcare({ ccareUserId: entry.userId, name: entry.name, action: 'password_reset', success: true, ip });
}

/** Validates a code and consumes the challenge (one chance per code, max 5 tries). */
function take(challenge, purpose, code, ip) {
  const entry = challenges.get(challenge);
  if (!entry || entry.purpose !== purpose) throw HttpError.badRequest('This code request has expired. Start again.');
  if (Date.now() > entry.expires) {
    challenges.delete(challenge);
    logCcare({ ccareUserId: entry.userId, name: entry.name, action: 'otp_expired', success: false, ip });
    throw HttpError.badRequest('The code has expired. Please request a new one.');
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    challenges.delete(challenge);
    throw HttpError.badRequest('Too many wrong codes. Please start again.');
  }
  if (sha(String(code).trim()) !== entry.codeHash) {
    logCcare({ ccareUserId: entry.userId, name: entry.name, action: 'otp_fail', success: false, ip });
    throw HttpError.badRequest('Wrong code. Please check and try again.');
  }
  challenges.delete(challenge);
  return entry;
}
