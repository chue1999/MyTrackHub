import { DataTypes } from 'sequelize';
import { jsonColumn, sequelize } from '../db/index.js';

/**
 * Audit trail for the CCare portal: every sign-in, one-time code, password
 * reset and account change, success or failure — like the MyTPlus event log.
 * A new table we own, so Sequelize creates it (PostgreSQL in dev, SQL Server in prod).
 */
export const CcareLog = sequelize.define(
  'CcareLog',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    // The CCare account the entry is about (null for a failed/unknown name).
    ccareUserId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(60) },
    // login_start, otp_sent, login_ok, login_fail, otp_fail, otp_expired,
    // forgot_request, password_reset, logout, account_create, account_update,
    // account_close, account_reopen, password_reset_by_admin, import.
    action: { type: DataTypes.STRING(40), allowNull: false },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Who performed it (an administrator's username for management actions).
    actor: { type: DataTypes.STRING(60) },
    detail: jsonColumn('detail', { allowNull: true }),
    ip: { type: DataTypes.STRING(64) },
    at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'ccare_logs',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['at'] }, { fields: ['ccare_user_id'] }, { fields: ['action'] }],
  },
);
