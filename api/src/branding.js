import { Setting } from './models/index.js';

const KEY = 'branding';
// Logo is stored as a data URL (the website resizes it to 256×256 before upload).
export const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 700_000; // about 500 KB of image

export const DEFAULTS = {
  logo: null,
  name: 'MyTPlus',
  subtitle: 'Activity Center',
  title: 'MyTPlus Activity',
  updatedAt: null,
  updatedBy: null,
};

export async function getBranding() {
  const row = await Setting.findByPk(KEY);
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

export async function saveBranding(patch) {
  const next = { ...(await getBranding()), ...patch };
  await Setting.upsert({ key: KEY, value: next });
  return next;
}
