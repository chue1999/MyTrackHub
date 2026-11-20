import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

/** A person using the MyTPlus app, identified by phone number (msisdn). */
export const AppUser = sequelize.define(
  'AppUser',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    msisdn: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    firstName: { type: DataTypes.STRING(100) },
    lastName: { type: DataTypes.STRING(100) },
    platform: { type: DataTypes.STRING(20) },
    appVersion: { type: DataTypes.STRING(30) },
    deviceModel: { type: DataTypes.STRING(100) },
    loginCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lastLoginAt: { type: DataTypes.DATE },
  },
  {
    tableName: 'app_users',
    underscored: true,
    indexes: [{ fields: ['last_seen_at'] }, { fields: ['first_name', 'last_name'] }],
  },
);

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

/** Someone allowed to log in to the admin website. */
export const Admin = sequelize.define(
  'Admin',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    displayName: { type: DataTypes.STRING(100) },
    lastLoginAt: { type: DataTypes.DATE },
  },
  { tableName: 'admins', underscored: true },
);

AppUser.hasMany(Event, { foreignKey: 'userId', as: 'events', onDelete: 'SET NULL' });
Event.belongsTo(AppUser, { foreignKey: 'userId', as: 'user' });
