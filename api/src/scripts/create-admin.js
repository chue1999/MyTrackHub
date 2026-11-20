// Create or reset an admin account:
//   npm run seed:admin -- <username> <password> [display name]
import bcrypt from 'bcryptjs';
import { ensureDatabase, sequelize } from '../db.js';
import { Admin } from '../models/index.js';

const [username, password, ...nameParts] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run seed:admin -- <username> <password> [display name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

await ensureDatabase();
await sequelize.sync();
const passwordHash = await bcrypt.hash(password, 10);
const [admin, created] = await Admin.findOrCreate({
  where: { username },
  defaults: { username, passwordHash, displayName: nameParts.join(' ') || username },
});
if (!created) await admin.update({ passwordHash });
console.log(`${created ? 'Created' : 'Updated password for'} admin "${username}"`);
await sequelize.close();
