import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

/**
 * One capacity reading of the server running the API + website, taken every few
 * minutes (CPU, memory, root disk, load, network, API memory, DB round-trip).
 * Kept SERVER_METRICS_KEEP_DAYS (90) days; shown on Server → Capacity → History.
 */
export const ServerMetric = sequelize.define(
  'ServerMetric',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    host: { type: DataTypes.STRING(100), allowNull: false },
    at: { type: DataTypes.DATE, allowNull: false },
    cpu: { type: DataTypes.FLOAT }, // %
    load1: { type: DataTypes.FLOAT },
    load5: { type: DataTypes.FLOAT },
    load15: { type: DataTypes.FLOAT },
    cores: { type: DataTypes.INTEGER },
    memTotal: { type: DataTypes.BIGINT }, // bytes
    memUsed: { type: DataTypes.BIGINT }, // programs (without cache)
    memAvailable: { type: DataTypes.BIGINT },
    memCache: { type: DataTypes.BIGINT },
    swapUsed: { type: DataTypes.BIGINT },
    diskMount: { type: DataTypes.STRING(100) },
    diskSize: { type: DataTypes.BIGINT },
    diskUsed: { type: DataTypes.BIGINT },
    diskPercent: { type: DataTypes.FLOAT },
    netRx: { type: DataTypes.FLOAT }, // bytes/s, all interfaces
    netTx: { type: DataTypes.FLOAT },
    apiRss: { type: DataTypes.BIGINT },
    dbLatencyMs: { type: DataTypes.FLOAT },
  },
  { tableName: 'server_metrics', underscored: true, timestamps: false, indexes: [{ fields: ['at'] }] },
);
