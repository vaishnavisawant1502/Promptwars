const router = require('express').Router();
const { Alert, Setting, Telemetry } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sanitizeAlert, sanitizeAlertList, sanitizeThresholds, sanitizeSettings } = require('../validate');

router.use(requireAuth);

const strip = (o) => { const { _id, __v, createdAt, updatedAt, ...rest } = o; return rest; };

// Full app state in one call (used on dashboard boot)
router.get('/state', async (req, res, next) => {
  try {
    const [alerts, s] = await Promise.all([
      Alert.find().sort({ createdAt: -1 }).lean(),
      Setting.findOne({ key: 'facility' }).lean()
    ]);
    res.json({
      alerts: alerts.map(strip),
      thresholds: s?.thresholds || null,
      settings: s?.settings || null
    });
  } catch (e) { next(e); }
});

// ---- Alerts ----
router.get('/alerts', async (req, res, next) => {
  try {
    const q = {};
    ['status', 'severity', 'zoneId'].forEach(k => { if (req.query[k]) q[k] = req.query[k]; });
    res.json((await Alert.find(q).sort({ createdAt: -1 }).lean()).map(strip));
  } catch (e) { next(e); }
});

router.put('/alerts/:id', async (req, res, next) => {
  try {
    let clean;
    try { clean = sanitizeAlert({ ...req.body, id: req.params.id }); } catch (e) { return res.status(400).json({ error: e.message }); }
    const doc = await Alert.findOneAndUpdate({ id: clean.id }, { $set: { ...clean, updatedBy: req.user.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    res.json(strip(doc));
  } catch (e) { next(e); }
});

// Bulk sync: upserts the given alerts ONLY. It never deletes anything, so a stale or
// malicious client cannot wipe alerts that other users created.
router.put('/alerts', async (req, res, next) => {
  try {
    let list;
    try { list = sanitizeAlertList(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (list.length) await Alert.bulkWrite(list.map(a => ({
      updateOne: { filter: { id: a.id }, update: { $set: { ...a, updatedBy: req.user.name } }, upsert: true }
    })));
    res.json({ ok: true, count: list.length });
  } catch (e) { next(e); }
});

// Admin-only: replace ALL alerts with the given list (used by "Reset demo data").
router.post('/alerts/reset', requireAdmin, async (req, res, next) => {
  try {
    let list;
    try { list = sanitizeAlertList(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    await Alert.deleteMany({});
    if (list.length) await Alert.insertMany(list.map(a => ({ ...a, updatedBy: req.user.name })));
    res.json({ ok: true, count: list.length });
  } catch (e) { next(e); }
});

router.delete('/alerts/:id', requireAdmin, async (req, res, next) => {
  try {
    await Alert.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Settings / thresholds ----
router.put('/settings', async (req, res, next) => {
  try {
    const { thresholds, settings } = req.body || {};
    const $set = {};
    try {
      if (thresholds) $set.thresholds = sanitizeThresholds(thresholds);
      if (settings) $set.settings = sanitizeSettings(settings);
    } catch (e) { return res.status(400).json({ error: e.message }); }
    if (Object.keys($set).length) await Setting.findOneAndUpdate({ key: 'facility' }, { $set }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Telemetry ----
router.post('/telemetry', async (req, res, next) => {
  try {
    const batch = (Array.isArray(req.body) ? req.body : []).slice(0, 200)
      .filter(r => r && ['hostel_a', 'hostel_b', 'kitchen', 'washrooms'].includes(r.zoneId) && Number.isFinite(r.rate));
    if (batch.length) await Telemetry.insertMany(batch.map(r => ({
      zoneId: r.zoneId, rate: r.rate, expected: r.expected, excess: r.excess, simTime: r.simTime
    })));
    res.status(201).json({ ok: true, stored: batch.length });
  } catch (e) { next(e); }
});

router.get('/telemetry', async (req, res, next) => {
  try {
    const q = req.query.zoneId ? { zoneId: req.query.zoneId } : {};
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    res.json((await Telemetry.find(q).sort({ at: -1 }).limit(limit).lean()).map(strip));
  } catch (e) { next(e); }
});

// ---- Aggregated stats (MongoDB aggregation) ----
router.get('/stats', async (req, res, next) => {
  try {
    const [byZone, byStatus, totals] = await Promise.all([
      Alert.aggregate([{ $group: { _id: '$zoneId', alerts: { $sum: 1 }, loss: { $sum: '$estimatedLoss' } } }, { $sort: { loss: -1 } }]),
      Alert.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Alert.aggregate([{ $group: { _id: null, totalLoss: { $sum: '$estimatedLoss' }, alerts: { $sum: 1 } } }])
    ]);
    res.json({ byZone, byStatus, totals: totals[0] || { totalLoss: 0, alerts: 0 } });
  } catch (e) { next(e); }
});

module.exports = router;
