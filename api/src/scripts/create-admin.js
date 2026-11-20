// Create an admin account, or reset its password (also re-enables it as administrator):
//   npm run seed:admin -- <username> <password> [display name]
import { connectDatabase, sequelize } from '../db/index.js';
import { Admin } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';

const [username, password, ...nameParts] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run seed:admin -- <username> <password> [display name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

await connectDatabase();
const passwordHash = await hashPassword(password);
const [admin, created] = await Admin.findOrCreate({
  where: { username },
  defaults: { username, passwordHash, displayName: nameParts.join(' ') || username },
});
if (!created) await admin.update({ passwordHash, isActive: true, role: 'admin' });
console.log(`${created ? 'Created' : 'Updated password for'} admin "${username}"`);
await sequelize.close();
