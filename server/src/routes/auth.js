const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { requireAuth } = require('../middleware/auth');

const sign = (u) => jwt.sign(
  { id: u._id, name: u.name, email: u.email, role: u.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
    // Admin: if ADMIN_EMAIL is set only that email becomes admin; otherwise the very first account does.
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const isAdmin = adminEmail ? email.toLowerCase() === adminEmail : (await User.countDocuments()) === 0;
    if (process.env.ALLOW_REGISTRATION === 'false' && !isAdmin) return res.status(403).json({ error: 'Registration is closed' });
    const user = await User.create({
      name, email, passwordHash: await bcrypt.hash(password, 10), role: isAdmin ? 'admin' : 'staff'
    });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash)))
      return res.status(401).json({ error: 'Wrong email or password' });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
