import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';
import { signToken } from '../utils/jwt.js';
import * as ccare from './ccare.service.js';
import { logCcare } from './ccare-log.service.js';
import { passwordStatus } from './ccare-password-policy.service.js';
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

/**
 * May we text this number? With an SMS gateway plus OTP_TEST_NUMBERS set, only
 * those numbers are enabled, so real staff are never texted during a test window.
 */
function textable(phone) {
  const to = normalizePhone(phone);
  const whitelist = config.otp.testNumbers;
  return !config.sms.enabled || whitelist.length === 0 || whitelist.includes(phone) || whitelist.includes(to);
}

/** Throws a clear error when a new password could not be texted to this phone. */
export function assertCanText(phone) {
  if (!phone) throw HttpError.badRequest('Enter the phone number: the password is sent to it by SMS.');
  // In production the password is only ever delivered by SMS: without a gateway
  // nobody would receive it, so refuse instead of creating an unusable account.
  if (!config.smsPassword.enabled && config.isProduction) {
    throw new HttpError(
      503,
      'SMS is not set up on this server (SMS_URL or SMS_PASSWORD_URL in api/.env.production), so the password cannot be sent.',
    );
  }
  if (!textable(phone)) {
    throw HttpError.forbidden('SMS to this number is not enabled yet (test mode). Use one of the test numbers.');
  }
}

/**
 * Texts a (new) password to the account's phone and logs it (never the password
 * itself). In development without an SMS gateway the password comes back in
 * `devPassword` so the flow is testable; never in production.
 */
export async function deliverPassword({ user, password, reason, actor, ip }) {
  assertCanText(user.staffTel);
  const content = fill(config.smsTemplates.password, { password, name: user.name });
  let gateway = 'disabled';
  if (config.smsPassword.enabled) {
    const r = await sendSms(normalizePhone(user.staffTel), content, config.smsPassword).catch((err) => ({
      ok: false,
      error: err.message,
    }));
    // e.g. "error:401 Unauthorized…" or "error:connect ETIMEDOUT…" — shown to the admin and logged.
    const reply = typeof r.response === 'string' ? r.response : JSON.stringify(r.response ?? '');
    gateway = r.ok ? 'sent' : `error:${r.status ?? ''} ${r.error ?? reply}`.trim().slice(0, 200);
    if (!r.ok) {
      await logCcare({
        ccareUserId: user.id,
        name: user.name,
        action: 'password_sent',
        success: false,
        actor,
        ip,
        detail: { reason, phoneHint: maskPhone(user.staffTel), gateway, shownToAdmin: config.smsPasswordFallback },
      });
      // Temporary fallback (SMS_PASSWORD_FALLBACK=true): while the gateway refuses
      // us, show the password once to the admin, who hands it over in person.
      if (config.smsPasswordFallback) {
        return { phoneHint: maskPhone(user.staffTel), sent: false, gatewayError: gateway, fallbackPassword: password };
      }
      throw new HttpError(
        502,
        `The SMS with the password could not be sent (gateway: ${gateway}). Use "Send new password" to try again.`,
      );
    }
  }
  await logCcare({
    ccareUserId: user.id,
    name: user.name,
    action: 'password_sent',
    success: true,
    actor,
    ip,
    detail: { reason, phoneHint: maskPhone(user.staffTel), gateway },
  });
  const out = { phoneHint: maskPhone(user.staffTel), sent: config.smsPassword.enabled };
  if (!config.smsPassword.enabled && !config.isProduction) out.devPassword = password;
  return out;
}

/** "OTP: {code}" + { code: 123456 } → "OTP: 123456" */
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

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
  if (!textable(phone)) {
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
  const content = fill(config.smsTemplates.otp, {
    code,
    minutes: Math.round(config.otp.ttlMs / 60000),
    name: user.name,
  });

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

// In development (PostgreSQL / local dev accounts) sign-in is fully local: the
// My CCare proxy (10.30.6.94) is skipped so accounts created in dev log in with
// their own md5 password and a local OTP code.
const MODE = ccare.ccareDev ? 'local' : config.ccareAuth.mode; // 'proxy' | 'local' | 'hybrid'
const USES_PROXY = MODE === 'proxy' || MODE === 'hybrid';
const USES_LOCAL = MODE === 'local' || MODE === 'hybrid';

/**
 * Refuses sign-in when the (correct) password is older than the allowed age.
 * Returns the expiry info to show a warning when it is close.
 */
async function checkExpiry(user, ip) {
  const status = await passwordStatus(user);
  if (status.expired) {
    await logCcare({
      ccareUserId: user.id,
      name: user.name,
      action: 'password_expired',
      success: false,
      ip,
      detail: { expiredAt: status.expiresAt, maxAgeDays: status.maxAgeDays },
    });
    throw new HttpError(
      403,
      `Your password has expired (passwords must be changed every ${status.maxAgeDays} days). Use "Forgot password" to set a new one with an SMS code.`,
      'PASSWORD_EXPIRED',
    );
  }
  return { passwordExpiresAt: status.expiresAt, passwordDaysLeft: status.daysLeft };
}

/** What the sign-in portal may offer, given the auth mode. */
export function portalConfig() {
  // New accounts are created by a CCare administrator in the admin, never by
  // self-registration on the public sign-in page. Password reset stays available
  // when we own the password (local / hybrid).
  return { mode: MODE, canRegister: false, canReset: USES_LOCAL };
}

/**
 * Step 1 of sign-in: name + password → send a code.
 * hybrid: try the My CCare API first (real accounts keep their password); if it
 * rejects the credentials, fall back to our own md5 (MyTPlus-created accounts).
 */
export async function startLogin({ name, password, ip }) {
  if (USES_PROXY) {
    try {
      return await startLoginProxy({ name, password, ip });
    } catch (err) {
      const status = err?.status ?? 0;
      // Only fall back for wrong credentials (401) or an unreachable gateway (502).
      if (!USES_LOCAL || (status !== 401 && status !== 502)) throw err;
    }
  }
  const { user, reason } = await ccare.checkLogin(name, password); // throws 403 if the account is closed
  if (!user) {
    await logCcare({ name, action: 'login_fail', success: false, ip, detail: { reason, via: 'local' } });
    throw new HttpError(401, 'Wrong username or password', 'INVALID_CREDENTIALS');
  }
  const expiry = await checkExpiry(user, ip);
  return { ...(await issueCode({ user, purpose: 'login', action: 'login_start', ip })), ...expiry };
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
  // The password is correct (the My CCare API said so): apply the same expiry rule.
  const expiry = profile ? await checkExpiry(profile, ip) : {};
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
    ...expiry,
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
  if (!USES_LOCAL) {
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

/**
 * Forgot password, step 2: check the SMS code. A right code is swapped for a
 * one-use ticket (valid as long as a code), used in step 3 to set the password.
 */
export async function checkResetCode({ challenge, code, ip }) {
  const entry = take(challenge, 'reset', code, ip);
  await logCcare({ ccareUserId: entry.userId, name: entry.name, action: 'forgot_code_ok', success: true, ip });
  return { ticket: store({ userId: entry.userId, name: entry.name, purpose: 'resetReady' }) };
}

/** Forgot password, step 3: the ticket from step 2 (or the code itself) + a new password. */
export async function resetPassword({ challenge, code, newPassword, ip }) {
  const entry = code ? take(challenge, 'reset', code, ip) : takeTicket(challenge);
  await ccare.resetPassword(entry.userId, newPassword);
  await logCcare({ ccareUserId: entry.userId, name: entry.name, action: 'password_reset', success: true, ip });
}

/** A ticket from a checked reset code: one use, expires like a code. */
function takeTicket(ticket) {
  const entry = challenges.get(ticket);
  challenges.delete(ticket);
  if (!entry || entry.purpose !== 'resetReady' || Date.now() > entry.expires) {
    throw HttpError.badRequest('This reset has expired. Please start again.');
  }
  return entry;
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
