import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

export const EVENT_TYPES = ['login', 'logout', 'screen_view', 'tap', 'action', 'api', 'error'];

/** One thing a user did: logged in, opened a screen, tapped a button… */
export const Event = sequelize.define(
  'Event',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.UUID },
    msisdn: { type: DataTypes.STRING(20) },
    sessionId: { type: DataTypes.STRING(64) },
    type: { type: DataTypes.ENUM(...EVENT_TYPES), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    screen: { type: DataTypes.STRING(150) },
    properties: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // For API calls: did it work, and the server's message (ResultDesc).
    success: { type: DataTypes.BOOLEAN },
    result: { type: DataTypes.STRING(300) },
    platform: { type: DataTypes.STRING(20) },
    appVersion: { type: DataTypes.STRING(30) },
    deviceId: { type: DataTypes.STRING(100) },
    deviceModel: { type: DataTypes.STRING(100) },
    ip: { type: DataTypes.STRING(64) },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: 'events',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id', 'occurred_at'] },
      { fields: ['occurred_at'] },
      { fields: ['type', 'name'] },
      { fields: ['msisdn'] },
      { fields: ['success', 'occurred_at'] },
    ],
  },
);
