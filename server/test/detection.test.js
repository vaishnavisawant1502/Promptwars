/* Drives the real frontend (index.html + script.js) inside jsdom and ticks the simulation.
   Run: npm test   (needs devDependency jsdom). Checks detection behaviour per scenario. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', '..');

async function boot(preset = {}) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');          // load scripts manually
  html = html.replace(/<link[^>]*stylesheet[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  let tick = null;
  w.setInterval = (fn) => { tick = fn; return 1; };
  w.clearInterval = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: true, addEventListener() {} }));
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.Chart = undefined;                                  // exercise the no-chart fallback path
  if (preset.thresholds) w.localStorage.setItem('hydro_sentinel_thresholds_v1', JSON.stringify(Object.assign({ nightBaselineThreshold: 3.0, nightDurationTrigger: 15, highFlowCeiling: 45.0, highFlowDurationTrigger: 20, nightStart: '23:00', nightEnd: '05:30' }, preset.thresholds)));
  w.eval(fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 60));            // app boots asynchronously
  return { w, run: (n) => { for (let i = 0; i < n; i++) tick(); }, click: (id) => w.document.getElementById(id).click() };
}
const alerts = (w) => JSON.parse(w.localStorage.getItem('hydro_sentinel_alerts_v1') || '[]');
const newAlerts = (w) => alerts(w).filter(a => Number(a.id.split('-')[1]) > 1042);

async function normalDay() {
  const app = await boot();
  const btn = app.w.document.querySelector('#live-restore-normal-btn');
  assert.ok(btn, 'restore-baseline button not found');
  btn.click();
  return app;
}

test('normal 24h baseline raises no false alerts', async () => {
  const { w, run } = await normalDay();
  run(24 * 60 + 5);
  const fp = newAlerts(w);
  assert.deepStrictEqual(fp.map(a => `${a.zoneId}:${a.ruleId}`), [], 'false positives: ' + JSON.stringify(fp.map(a => [a.zoneName, a.ruleName, a.detectedAt])));
});

test('night leak is detected once (no duplicate alerts)', async () => {
  const app = await normalDay();
  app.click('live-generate-scenario-btn');             // "Test Overnight Leak"
  app.run(25);
  const a = alerts(app.w).filter(x => x.zoneId === 'hostel_a' && x.ruleId === 'rule_night_flow' && x.status !== 'resolved');
  assert.strictEqual(a.length, 1, 'expected exactly one open night-flow alert for Block A');
  assert.ok(a[0].estimatedLoss > 0 && a[0].active);
});

test('short spike does not alert', async () => {
  const app = await normalDay();
  const btn = app.w.document.querySelector('#live-test-spike-btn');
  assert.ok(btn, 'spike button not found');
  btn.click();
  app.run(10);
  assert.strictEqual(newAlerts(app.w).filter(a => a.zoneId === 'hostel_b').length, 0);
});

test('kitchen runaway is detected and loss = excess x duration', async () => {
  const app = await normalDay();
  const btn = app.w.document.querySelector('#live-test-high-btn');
  assert.ok(btn, 'kitchen button not found');
  btn.click();
  app.run(30);
  const a = newAlerts(app.w).filter(x => x.zoneId === 'kitchen' && x.ruleId === 'rule_runaway_ceiling');
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].estimatedLoss, Math.round(a[0].excessRate * a[0].durationMinutes));
});

test('settings change detection: a very high ceiling suppresses the kitchen alert', async () => {
  const app = await boot({ thresholds: { highFlowCeiling: 500 } });
  app.w.document.getElementById('live-restore-normal-btn').click();
  app.click('live-test-high-btn');
  app.run(30);
  assert.strictEqual(newAlerts(app.w).filter(a => a.zoneId === 'kitchen').length, 0);
});

test('settings change detection: longer duration requirement is honoured by the alert', async () => {
  const app = await boot({ thresholds: { highFlowDurationTrigger: 50 } });
  app.w.document.getElementById('live-restore-normal-btn').click();
  app.click('live-test-high-btn');
  app.run(5);
  const k = newAlerts(app.w).filter(a => a.zoneId === 'kitchen');
  assert.strictEqual(k.length, 1);
  assert.ok(k[0].durationMinutes >= 50, 'alert should only exist once 50 min has been reached');
});

test('cost is shown in rupees', async () => {
  const app = await normalDay();
  app.run(3);
  const text = app.w.document.body.textContent;
  assert.ok(!/\$\d/.test(text), 'found a dollar amount in the UI');
});
