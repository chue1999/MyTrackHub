import https from 'node:https';
import { URL } from 'node:url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Sends SMS through the TplusSMS gateway (used for CCare one-time codes).
 * The gateway has a self-signed certificate on an internal host, so TLS
 * verification is turned off for it only (as the original PHP did).
 */

/** 20xxxxxxxx → 85620xxxxxxxx when a country code is set (gateway format). */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const cc = config.sms.countryCode.replace(/\D/g, '');
  if (!digits) return '';
  if (cc && !digits.startsWith(cc)) return cc + digits.replace(/^0+/, '');
  return digits;
}

/**
 * Sends one message. Returns { ok, status, response }.
 * Throws only on a transport error (the caller logs the outcome).
 */
export function sendSms(to, content) {
  if (!config.sms.enabled) {
    logger.warn(
      { hasUrl: !!config.sms.url, hasApiKey: !!config.sms.apiKey },
      'SMS not sent: gateway disabled (set SMS_URL to enable)',
    );
    return Promise.resolve({ ok: false, skipped: true, response: 'SMS gateway not configured' });
  }
  const url = new URL(config.sms.url);
  const body = JSON.stringify({
    TransactionID: `sv94${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}`,
    User: config.sms.user,
    Header: config.sms.from,
    To: to,
    Content: content,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        rejectUnauthorized: false, // internal gateway, self-signed cert (matches the PHP client)
        headers: {
          'Content-Type': 'application/json',
          // Only when a key is configured (the internal gateway may not need one).
          ...(config.sms.apiKey ? { apikey: config.sms.apiKey } : {}),
          'Content-Length': Buffer.byteLength(body),
        },
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
            // keep the raw text
          }
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          // Log the gateway outcome so OTP delivery can be debugged (the code
          // itself is never logged — only the recipient and the gateway reply).
          logger.info({ to, status: res.statusCode, ok, response: parsed }, 'SMS gateway response');
          resolve({ ok, status: res.statusCode, response: parsed });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('SMS gateway timed out')));
    req.on('error', (err) => {
      logger.warn({ err: err.message }, 'SMS send failed');
      reject(err);
    });
    req.write(body);
    req.end();
  });
}
