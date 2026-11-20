import { sequelize } from '../db/index.js';
import { AppUser, Event } from '../models/index.js';
import { normalizeMsisdn, sanitizeProperties } from '../utils/sanitize.js';
import { broadcast } from './live.service.js';

/** Receives event batches from the mobile app. */

const toWholeNumber = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);

/** Updates the user's profile (name, device, login count, data balance) from a batch. */
async function updateUserFromBatch(user, batch, clampDate, transaction) {
  const lastEventAt = batch.events.reduce(
    (max, e) => (clampDate(e.occurredAt) > max ? clampDate(e.occurredAt) : max),
    user.lastSeenAt,
  );
  const changes = {
    lastSeenAt: lastEventAt,
    platform: batch.platform ?? user.platform,
    appVersion: batch.appVersion ?? user.appVersion,
    deviceModel: batch.deviceModel ?? user.deviceModel,
  };
  if (batch.firstName) changes.firstName = batch.firstName;
  if (batch.lastName) changes.lastName = batch.lastName;

  const logins = batch.events.filter((e) => e.type === 'login');
  if (logins.length) {
    changes.loginCount = user.loginCount + logins.length;
    changes.lastLoginAt = clampDate(logins.at(-1).occurredAt);
  }

  // Keep the newest active-packages snapshot on the user.
  const snapshot = batch.events.findLast((e) => e.type === 'action' && e.name === 'active_packages');
  if (snapshot?.properties && Array.isArray(snapshot.properties.packages)) {
    changes.activePackages = sanitizeProperties({ list: snapshot.properties.packages.slice(0, 30) }).list ?? [];
    changes.dataRemainMb = toWholeNumber(snapshot.properties.remainMb);
    changes.dataUsedMb = toWholeNumber(snapshot.properties.usedMb);
    changes.packagesUpdatedAt = clampDate(snapshot.occurredAt);
  }
  await user.update(changes, { transaction });
}

/**
 * Stores a validated batch, then pushes it to the admin website in real time.
 * @returns {Promise<number>} number of events stored
 */
export async function ingestBatch(batch, { ip }) {
  const msisdn = normalizeMsisdn(batch.msisdn);
  const now = new Date();
  // Don't trust device clocks blindly: future timestamps become "now".
  const clampDate = (date) => (date && date <= now ? date : now);

  const { created, user } = await sequelize.transaction(async (transaction) => {
    let appUser = null;
    if (msisdn) {
      [appUser] = await AppUser.findOrCreate({ where: { msisdn }, defaults: { msisdn }, transaction });
      await updateUserFromBatch(appUser, batch, clampDate, transaction);
    }
    const rows = batch.events.map((e) => ({
      userId: appUser?.id ?? null,
      msisdn,
      sessionId: e.sessionId ?? null,
      type: e.type,
      name: e.name,
      screen: e.screen ?? null,
      properties: sanitizeProperties(e.properties ?? {}),
      success: e.success ?? null,
      result: e.result ?? null,
      platform: batch.platform ?? null,
      appVersion: batch.appVersion ?? null,
      deviceId: batch.deviceId ?? null,
      deviceModel: batch.deviceModel ?? null,
      ip,
      occurredAt: clampDate(e.occurredAt),
    }));
    return { created: await Event.bulkCreate(rows, { transaction, returning: true }), user: appUser };
  });

  const userInfo = user
    ? { id: user.id, msisdn: user.msisdn, firstName: user.firstName, lastName: user.lastName }
    : null;
  broadcast('events', {
    user: user ? user.toJSON() : null,
    events: created.map((e) => ({ ...e.toJSON(), id: String(e.id), user: userInfo })),
  });
  return created.length;
}
