import { Admin } from './admin.model.js';
import { AppUser } from './app-user.model.js';
import { CcareLog } from './ccare-log.model.js';
import { Event, EVENT_TYPES } from './event.model.js';
import { Setting } from './setting.model.js';

// ── associations ──
AppUser.hasMany(Event, { foreignKey: 'userId', as: 'events', onDelete: 'SET NULL' });
Event.belongsTo(AppUser, { foreignKey: 'userId', as: 'user' });

export { Admin, AppUser, CcareLog, Event, EVENT_TYPES, Setting };
