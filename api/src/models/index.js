import { Admin } from './admin.model.js';
import { AppUser } from './app-user.model.js';
import { CcareAccountDev } from './ccare-account-dev.model.js';
import { CcareLog } from './ccare-log.model.js';
import { Event, EVENT_TYPES } from './event.model.js';
import { ServerAgent, ServerLog, SERVER_LOG_TYPES, SERVER_TASK_ACTIONS, ServerTask } from './server-log.model.js';
import { Setting } from './setting.model.js';

// ── associations ──
AppUser.hasMany(Event, { foreignKey: 'userId', as: 'events', onDelete: 'SET NULL' });
Event.belongsTo(AppUser, { foreignKey: 'userId', as: 'user' });

export {
  Admin,
  AppUser,
  CcareAccountDev,
  CcareLog,
  Event,
  EVENT_TYPES,
  ServerAgent,
  ServerLog,
  SERVER_LOG_TYPES,
  SERVER_TASK_ACTIONS,
  ServerTask,
  Setting,
};
