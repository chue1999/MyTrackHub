// Copies all data from PostgreSQL (PG_*) into SQL Server (DB_* of .env.production).
//   npm run migrate:pg              → copy, keeping anything SQL Server already received
//   npm run migrate:pg -- --replace → delete what is in SQL Server first, then copy
//
// Old IDs are kept, so links to users and actions keep working. Rows SQL Server
// already has (sent by the app after the switch) are kept and merged in:
// the same phone number becomes one user; their newer actions get new IDs.
import pg from 'pg';
import { config } from '../config/index.js';
import { connectDatabase, sequelize } from '../db/index.js';
import { Admin, AppUser, Event, Setting } from '../models/index.js';

const replace = process.argv.includes('--replace');
const BATCH = 200;

if (config.db.dialect !== 'mssql') {
  console.error(`The target must be SQL Server, but ${config.envFile} has DB_DIALECT=${config.db.dialect}.`);
  process.exit(1);
}
if (!config.pg.enabled) {
  console.error('Set PG_HOST and PG_NAME in .env (the old PostgreSQL database) first.');
  process.exit(1);
}

const source = new pg.Client({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.name,
  user: config.pg.user,
  password: config.pg.password,
});
await source.connect();
await connectDatabase();

/** PostgreSQL row (snake_case columns) → model attributes. */
function toAttributes(model, row) {
  const out = {};
  for (const [name, attr] of Object.entries(model.getAttributes())) {
    if (attr.field in row) out[name] = row[attr.field];
  }
  return out;
}

/** Every row of a PostgreSQL table, a page at a time (by primary key). */
async function* readAll(model) {
  const table = model.getTableName();
  const key = model.primaryKeyField;
  let last = null;
  for (;;) {
    const { rows } = await source.query(
      `SELECT * FROM "${table}" ${last === null ? '' : `WHERE "${key}" > $1`} ORDER BY "${key}" LIMIT ${BATCH}`,
      last === null ? [] : [last],
    );
    if (!rows.length) return;
    yield rows.map((r) => toAttributes(model, r));
    last = rows.at(-1)[key];
  }
}

async function copyAll(model, transaction) {
  let n = 0;
  for await (const rows of readAll(model)) {
    await model.bulkCreate(rows, { validate: false, hooks: false, silent: true, transaction });
    n += rows.length;
  }
  console.log(`${model.getTableName()}: copied ${n}`);
}

/** Settings and admin accounts: the PostgreSQL version wins (it holds the real choices/passwords). */
async function upsertByKey(model, uniqueKey, transaction) {
  let n = 0;
  for await (const rows of readAll(model)) {
    for (const row of rows) {
      const existing = await model.unscoped().findOne({ where: { [uniqueKey]: row[uniqueKey] }, transaction });
      if (existing) {
        const { [model.primaryKeyAttribute]: _id, ...rest } = row;
        await existing.update(rest, { silent: true, hooks: false, transaction });
      } else {
        await model.bulkCreate([row], { validate: false, hooks: false, silent: true, transaction });
      }
      n += 1;
    }
  }
  console.log(`${model.getTableName()}: copied ${n}`);
}

const plain = (rows) => rows.map((r) => r.get({ plain: true }));

const transaction = await sequelize.transaction();
try {
  if (replace) {
    for (const m of [Event, AppUser, Admin, Setting]) await m.unscoped().destroy({ where: {}, transaction });
    console.log('Deleted the existing SQL Server rows.');
  }

  // Keep what SQL Server received after the switch, then make room for the old IDs.
  const newUsers = plain(await AppUser.findAll({ transaction }));
  const newEvents = plain(await Event.findAll({ order: [['id', 'ASC']], transaction }));
  await Event.destroy({ where: {}, transaction });
  await AppUser.destroy({ where: {}, transaction });

  await upsertByKey(Setting, 'key', transaction);
  await upsertByKey(Admin, 'username', transaction);
  await copyAll(AppUser, transaction);
  await copyAll(Event, transaction);

  // Put the newer users back; the same phone number joins the old user.
  const idMap = new Map();
  for (const u of newUsers) {
    const old = await AppUser.findOne({ where: { msisdn: u.msisdn }, transaction });
    if (!old) {
      await AppUser.bulkCreate([u], { validate: false, hooks: false, silent: true, transaction });
      continue;
    }
    idMap.set(u.id, old.id);
    const newer = u.lastSeenAt > old.lastSeenAt;
    const pick = (k) => (newer ? (u[k] ?? old[k]) : (old[k] ?? u[k]));
    await old.update(
      {
        ...Object.fromEntries(
          ['firstName', 'lastName', 'platform', 'appVersion', 'deviceModel', 'activePackages', 'dataRemainMb']
            .concat(['dataUsedMb', 'packagesUpdatedAt', 'note'])
            .map((k) => [k, pick(k)]),
        ),
        loginCount: old.loginCount + u.loginCount,
        firstSeenAt: u.firstSeenAt < old.firstSeenAt ? u.firstSeenAt : old.firstSeenAt,
        lastSeenAt: newer ? u.lastSeenAt : old.lastSeenAt,
        lastLoginAt: [u.lastLoginAt, old.lastLoginAt].filter(Boolean).sort((a, b) => b - a)[0] ?? null,
      },
      { silent: true, transaction },
    );
  }

  // Newer actions get new IDs after the old ones.
  if (newEvents.length) {
    await Event.bulkCreate(
      newEvents.map(({ id: _id, ...e }) => ({ ...e, userId: idMap.get(e.userId) ?? e.userId })),
      { validate: false, hooks: false, silent: true, transaction },
    );
  }
  console.log(`kept from SQL Server: ${newUsers.length} users (${idMap.size} merged), ${newEvents.length} actions`);

  await transaction.commit();
  console.log('Done.');
} catch (err) {
  await transaction.rollback();
  console.error('Nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await sequelize.close();
}
