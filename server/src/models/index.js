const mongoose = require('mongoose');
const { Schema } = mongoose;

const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' }
}, { timestamps: true }));

// Alert: mirrors the object shape the frontend already uses.
const Alert = mongoose.model('Alert', new Schema({
  id: { type: String, required: true, unique: true, index: true }, // e.g. ALT-1042
  zoneId: { type: String, required: true, index: true },
  zoneName: String,
  ruleId: String,
  ruleName: String,
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
  status: { type: String, enum: ['new', 'acknowledged', 'investigating', 'resolved'], default: 'new', index: true },
  detectedAt: String,
  detectedDate: String,
  timestamp: String,
  resolvedAt: String,
  durationMinutes: Number,
  excessRate: Number,
  estimatedLoss: Number,
  observedValues: Schema.Types.Mixed,
  observedPattern: String,
  reason: String,
  suggestedAction: String,
  notes: { type: String, default: '', maxlength: 2000 },
  active: Boolean,
  isSimulated: { type: Boolean, default: true },
  updatedBy: String
}, { timestamps: true, strict: false }));

// Single shared settings document (thresholds + display prefs)
const Setting = mongoose.model('Setting', new Schema({
  key: { type: String, default: 'facility', unique: true },
  thresholds: Schema.Types.Mixed,
  settings: Schema.Types.Mixed
}, { timestamps: true }));

// Telemetry readings (simulated sensor samples). TTL: auto-delete after 7 days.
const Telemetry = mongoose.model('Telemetry', new Schema({
  zoneId: { type: String, required: true, index: true },
  rate: { type: Number, required: true },
  expected: Number,
  excess: Number,
  simTime: String,
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }
}));

module.exports = { User, Alert, Setting, Telemetry };
