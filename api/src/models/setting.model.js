import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

/** Small key → JSON store for settings changed from the admin website. */
export const Setting = sequelize.define(
  'Setting',
  {
    key: { type: DataTypes.STRING(60), primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { tableName: 'settings', underscored: true },
);
