import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

/** Someone allowed to log in to the admin website. */
export const Admin = sequelize.define(
  'Admin',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    displayName: { type: DataTypes.STRING(100) },
    // admin = full access incl. managing accounts; viewer = read-only.
    role: { type: DataTypes.ENUM('admin', 'viewer'), allowNull: false, defaultValue: 'admin' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE },
  },
  {
    tableName: 'admins',
    underscored: true,
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  },
);
