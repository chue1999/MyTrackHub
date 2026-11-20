import { Setting } from '../models/index.js';
import { broadcast } from './live.service.js';

/** Website name and logo ("Website name & logo" on the Settings page). */

const SETTING_KEY = 'branding';

// The logo is stored as a data URL (the website resizes it to 256×256 before upload).
export const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 700_000; // about 500 KB of image

export const BRANDING_DEFAULTS = Object.freeze({
  logo: null,
  name: 'MyTPlus',
  subtitle: 'Activity Center',
  title: 'MyTPlus Activity',
  updatedAt: null,
  updatedBy: null,
});

export async function getBranding() {
  const row = await Setting.findByPk(SETTING_KEY);
  return { ...BRANDING_DEFAULTS, ...(row?.value ?? {}) };
}

/** Saves the changed fields and tells every open admin page to reload them. */
export async function updateBranding(patch, by) {
  const next = { ...(await getBranding()), ...patch, updatedAt: new Date().toISOString(), updatedBy: by };
  await Setting.upsert({ key: SETTING_KEY, value: next });
  broadcast('branding', { updatedAt: next.updatedAt });
  return next;
}
