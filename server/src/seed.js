// Optional: creates an admin user from environment variables (no hardcoded credentials).
//   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-strong-password' npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User } = require('./models');
(async () => {
  const email = process.env.SEED_ADMIN_EMAIL, password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 chars) in the environment.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  if (!(await User.findOne({ email: email.toLowerCase() }))) {
    await User.create({ name: 'Admin', email, passwordHash: await bcrypt.hash(password, 10), role: 'admin' });
    console.log('Admin created:', email);
  } else console.log('User already exists:', email);
  await mongoose.disconnect();
})();
