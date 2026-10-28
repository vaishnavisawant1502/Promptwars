const { test } = require('node:test');
const assert = require('node:assert');
const v = require('../src/validate');

const good = { id: 'ALT-1050', zoneId: 'kitchen', severity: 'high', status: 'new', estimatedLoss: 100, notes: 'ok' };

test('valid alert passes and unknown/dangerous fields are dropped', () => {
  const out = v.sanitizeAlert({ ...good, $set: { role: 'admin' }, _id: 'x', evil: 1 });
  assert.strictEqual(out.id, 'ALT-1050');
  assert.ok(!('$set' in out) && !('_id' in out) && !('evil' in out));
});
test('bad id / zone / severity / status are rejected', () => {
  assert.throws(() => v.sanitizeAlert({ ...good, id: '../x' }));
  assert.throws(() => v.sanitizeAlert({ ...good, zoneId: 'moon' }));
  assert.throws(() => v.sanitizeAlert({ ...good, severity: 'meh' }));
  assert.throws(() => v.sanitizeAlert({ ...good, status: 'deleted' }));
});
test('alert list must be an array of at most 500', () => {
  assert.throws(() => v.sanitizeAlertList({}));
  assert.throws(() => v.sanitizeAlertList(Array(501).fill(good)));
});
test('thresholds and tariff are range-checked', () => {
  const t = { nightBaselineThreshold: 3, nightDurationTrigger: 15, highFlowCeiling: 45, highFlowDurationTrigger: 20, nightStart: '23:00', nightEnd: '05:30' };
  assert.deepStrictEqual(v.sanitizeThresholds(t), t);
  assert.throws(() => v.sanitizeThresholds({ ...t, highFlowCeiling: -1 }));
  assert.throws(() => v.sanitizeThresholds({ ...t, nightStart: '25:00' }));
  assert.throws(() => v.sanitizeSettings({ unit: 'lpm', tariffRate: 0, simSpeed: 2500 }));
  assert.strictEqual(v.sanitizeSettings({ unit: 'lpm', tariffRate: 25, simSpeed: 2500 }).currency, 'INR');
});
