// Input validation / sanitising. Pure functions so they can be unit-tested without a database.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['new', 'acknowledged', 'investigating', 'resolved'];
const ZONES = ['hostel_a', 'hostel_b', 'kitchen', 'washrooms'];
const STR_FIELDS = ['zoneName', 'ruleId', 'ruleName', 'detectedAt', 'detectedDate', 'timestamp', 'resolvedAt',
  'observedPattern', 'reason', 'suggestedAction'];
const NUM_FIELDS = ['durationMinutes', 'excessRate', 'estimatedLoss'];

// Returns a clean alert object (only known fields) or throws Error with a message.
function sanitizeAlert(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Alert must be an object');
  if (typeof a.id !== 'string' || !/^ALT-\d{1,8}$/.test(a.id)) throw new Error('Invalid alert id');
  if (!ZONES.includes(a.zoneId)) throw new Error('Invalid zoneId');
  if (!SEVERITIES.includes(a.severity)) throw new Error('Invalid severity');
  const status = a.status === undefined ? 'new' : a.status;
  if (!STATUSES.includes(status)) throw new Error('Invalid status');
  const out = { id: a.id, zoneId: a.zoneId, severity: a.severity, status };
  STR_FIELDS.forEach(k => { if (typeof a[k] === 'string') out[k] = a[k].slice(0, 1000); });
  NUM_FIELDS.forEach(k => { if (Number.isFinite(a[k])) out[k] = a[k]; });
  out.notes = typeof a.notes === 'string' ? a.notes.slice(0, 2000) : '';
  if (typeof a.active === 'boolean') out.active = a.active;
  out.isSimulated = a.isSimulated !== false;
  if (a.observedValues && typeof a.observedValues === 'object' && !Array.isArray(a.observedValues)) {
    const ov = {};
    ['currentFlow', 'baseline', 'excessRate', 'peakFlow', 'threshold', 'durationMinutes'].forEach(k => {
      if (Number.isFinite(a.observedValues[k])) ov[k] = a.observedValues[k];
    });
    if (typeof a.observedValues.unit === 'string') ov.unit = a.observedValues.unit.slice(0, 10);
    out.observedValues = ov;
  }
  return out;
}

function sanitizeAlertList(list) {
  if (!Array.isArray(list)) throw new Error('Expected an array of alerts');
  if (list.length > 500) throw new Error('Too many alerts (max 500)');
  return list.map(sanitizeAlert);
}

const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const hhmm = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function sanitizeThresholds(t) {
  if (!t || typeof t !== 'object') throw new Error('thresholds must be an object');
  if (!inRange(t.nightBaselineThreshold, 0.1, 100)) throw new Error('nightBaselineThreshold out of range');
  if (!inRange(t.nightDurationTrigger, 1, 600)) throw new Error('nightDurationTrigger out of range');
  if (!inRange(t.highFlowCeiling, 1, 1000)) throw new Error('highFlowCeiling out of range');
  if (!inRange(t.highFlowDurationTrigger, 1, 600)) throw new Error('highFlowDurationTrigger out of range');
  if (!hhmm(t.nightStart) || !hhmm(t.nightEnd)) throw new Error('night window must be HH:MM');
  const { nightBaselineThreshold, nightDurationTrigger, highFlowCeiling, highFlowDurationTrigger, nightStart, nightEnd } = t;
  return { nightBaselineThreshold, nightDurationTrigger, highFlowCeiling, highFlowDurationTrigger, nightStart, nightEnd };
}

function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') throw new Error('settings must be an object');
  if (!['lpm', 'm3h', 'gpm'].includes(s.unit)) throw new Error('Invalid unit');
  if (!inRange(s.tariffRate, 0.5, 500)) throw new Error('tariffRate must be between 0.5 and 500 (INR per kL)');
  if (!inRange(s.simSpeed, 500, 10000)) throw new Error('simSpeed out of range');
  const period = ['today', 'yesterday', 'week'].includes(s.selectedPeriod) ? s.selectedPeriod : 'today';
  return { unit: s.unit, tariffRate: s.tariffRate, currency: 'INR', simSpeed: s.simSpeed, selectedPeriod: period };
}

module.exports = { sanitizeAlert, sanitizeAlertList, sanitizeThresholds, sanitizeSettings };
