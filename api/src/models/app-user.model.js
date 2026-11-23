import { DataTypes } from 'sequelize';
import { jsonColumn, sequelize } from '../db/index.js';

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
    // Internal note written by staff on the admin website.
    note: { type: DataTypes.TEXT },
    // Latest snapshot of the user's active packages (from the app's InquiryPackage call).
    activePackages: jsonColumn('activePackages'),
    dataRemainMb: { type: DataTypes.INTEGER },
    dataUsedMb: { type: DataTypes.INTEGER },
    packagesUpdatedAt: { type: DataTypes.DATE },
  },
  {
    tableName: 'app_users',
    underscored: true,
    indexes: [{ fields: ['last_seen_at'] }, { fields: ['first_name', 'last_name'] }],
  },
);
