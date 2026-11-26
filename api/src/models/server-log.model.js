import { DataTypes } from 'sequelize';
import { jsonColumn, sequelize } from '../db/index.js';

/**
 * What happened on the Linux servers themselves (not through the website):
 * SSH sign-ins, sudo, su, account changes, file deletes/changes and attempts
 * to switch auditing off. Sent by deploy/server-agent. Entries are never
 * deleted through the API.
 */
export const SERVER_LOG_TYPES = [
  'login_ok',
  'login_fail',
  'logout',
  'sudo',
  'su',
  'account_change',
  'file_delete',
  'file_change',
  'audit_tamper',
  'agent_start',
  'agent_stop',
  'maintenance',
];

export const ServerLog = sequelize.define(
  'ServerLog',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    // Which server (agent host label) and the agent's id for the entry, so a
    // re-sent batch is not stored twice.
    host: { type: DataTypes.STRING(100), allowNull: false },
    eventKey: { type: DataTypes.STRING(64), allowNull: false },
    at: { type: DataTypes.DATE, allowNull: false },
    type: { type: DataTypes.STRING(30), allowNull: false },
    // The person (login user) behind it, and the account it ran as (root for sudo).
    user: { type: DataTypes.STRING(64) },
    runAs: { type: DataTypes.STRING(64) },
    sourceIp: { type: DataTypes.STRING(64) },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    summary: { type: DataTypes.STRING(500) },
    detail: jsonColumn('detail', { allowNull: true }),
    receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'server_logs',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['host', 'event_key'] },
      { fields: ['at'] },
      { fields: ['type'] },
      { fields: ['user'] },
    ],
  },
);

/** One row per server running the agent: when it last reported, and auditd state. */
export const ServerAgent = sequelize.define(
  'ServerAgent',
  {
    host: { type: DataTypes.STRING(100), primaryKey: true },
    agentVersion: { type: DataTypes.STRING(20) },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false },
    lastIp: { type: DataTypes.STRING(64) },
    auditd: { type: DataTypes.BOOLEAN },
    startedAt: { type: DataTypes.DATE },
    // Cache sizes the agent measured (bytes), for the Clear cache page.
    caches: jsonColumn('caches', { allowNull: true }),
    cachesAt: { type: DataTypes.DATE },
  },
  { tableName: 'server_agents', underscored: true, timestamps: false },
);

/** The cache-clearing actions the agent knows. The web can only ask for these. */
export const SERVER_TASK_ACTIONS = ['page_cache', 'journal', 'apt', 'tmp', 'pm2_logs', 'nginx_cache'];

/**
 * A cache-clear request from the web, run by the agent (as root) on its server.
 * pending → running → done | failed.
 */
export const ServerTask = sequelize.define(
  'ServerTask',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    host: { type: DataTypes.STRING(100), allowNull: false },
    action: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
    requestedBy: { type: DataTypes.STRING(60), allowNull: false },
    requestedIp: { type: DataTypes.STRING(64) },
    requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    startedAt: { type: DataTypes.DATE },
    finishedAt: { type: DataTypes.DATE },
    freedBytes: { type: DataTypes.BIGINT },
    output: { type: DataTypes.TEXT },
  },
  {
    tableName: 'server_tasks',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['host', 'status'] }, { fields: ['requested_at'] }],
  },
);
