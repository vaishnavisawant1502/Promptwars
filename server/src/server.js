require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const secret = process.env.JWT_SECRET || '';
if (secret.length < 16 || secret.startsWith('change-this')) {
  console.error('Set a strong JWT_SECRET (16+ characters, not the example value) in server/.env');
  process.exit(1);
}

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null   // keeps plain-http localhost working in Safari
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api', require('./routes/data'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the frontend (project root, one level above /server)
app.use(express.static(path.join(__dirname, '..', '..')));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hydrosense')
  .then(() => app.listen(PORT, () => console.log(`HydroSense running → http://localhost:${PORT}`)))
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
