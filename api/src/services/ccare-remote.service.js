import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { config } from '../config/index.js';

/**
 * Thin client for the existing "My CCare" auth API (the same one the current web
 * uses): login + OTP are validated there, so staff sign in with their real
 * passwords without us ever knowing the password hashing.
 *   login  (api/8): { name, password } → sends an OTP, returns a success message
 *   verify (api/9): { otp }            → returns the account's userData
 */
function request(path, payload) {
  const url = new URL(config.ccareAuth.base + path);
  const lib = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        rejectUnauthorized: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // keep raw
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('CCare auth service timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const msg = (r) => (typeof r.body === 'object' ? r.body?.message || '' : String(r.body || ''));

/** Checks the password and triggers an OTP SMS. Returns { ok, message, detail }. */
export async function remoteLogin(name, password) {
  const r = await request(config.ccareAuth.loginPath, { name, password });
  const m = msg(r);
  return { ok: r.status >= 200 && r.status < 300 && /login successful/i.test(m), message: m, detail: r.body?.detail };
}

/** Confirms the OTP. Returns { ok, message, userData }. */
export async function remoteVerify(otp) {
  const r = await request(config.ccareAuth.verifyPath, { otp });
  const m = msg(r);
  return { ok: r.status >= 200 && r.status < 300 && /correct/i.test(m), message: m, userData: r.body?.userData };
}
