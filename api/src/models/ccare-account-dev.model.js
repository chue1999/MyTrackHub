import { DataTypes } from 'sequelize';
import { isMssql, sequelize } from '../db/index.js';

/**
 * DEVELOPMENT-ONLY stand-in for the SQL Server `Tb_User_detail` table.
 *
 * In production CCare accounts live in that external SQL Server table (raw SQL,
 * see ccare.service.js). PostgreSQL dev machines don't have it, so there CCare
 * was off. This local table lets the whole CCare flow (create / list / login /
 * reset / close) be tested in dev. Its columns use the SAME names as
 * Tb_User_detail so the existing `toPublic`/`isActive` helpers work unchanged.
 *
 * It is only defined on PostgreSQL — in production (mssql) it is never created.
 */
export const CcareAccountDev = isMssql
  ? null
  : sequelize.define(
      'CcareAccountDev',
      {
        ID: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        Name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
        Password: { type: DataTypes.STRING(64) },
        Descrip: { type: DataTypes.STRING(20), defaultValue: 'user' },
        Status: { type: DataTypes.STRING(10) },
        Name_la: { type: DataTypes.STRING(120) },
        ANB: { type: DataTypes.INTEGER, defaultValue: 56 },
        BrandID: { type: DataTypes.STRING(40) },
        Division: { type: DataTypes.STRING(120) },
        POSITION: { type: DataTypes.STRING(120) },
        Staffid: { type: DataTypes.STRING(60) },
        stafftel: { type: DataTypes.STRING(40) },
        role_CRM: { type: DataTypes.STRING(40) },
        cdate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        TimeResetPassWord: { type: DataTypes.DATE, allowNull: true },
      },
      {
        tableName: 'ccare_accounts_dev',
        timestamps: false,
        // Keep the column names exactly as written (match Tb_User_detail).
        freezeTableName: true,
      },
    );
