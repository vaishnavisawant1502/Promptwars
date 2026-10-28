/* HydroSense API client: JWT auth, login screen, and server sync.
   Falls back to localStorage-only mode if the backend is unreachable. */
(function () {
  const TOKEN_KEY = 'hydro_sentinel_token_v1';
  const USER_KEY = 'hydro_sentinel_user_v1';
  const API_BASE_KEY = 'hydro_sentinel_api_base_v1';
  const K = {
    alerts: 'hydro_sentinel_alerts_v1',
    thresholds: 'hydro_sentinel_thresholds_v1',
    settings: 'hydro_sentinel_settings_v1'
  };
  let offline = false;
  const timers = {};
  let telemetryQueue = [];

  const token = () => localStorage.getItem(TOKEN_KEY);
  const getApiBase = () => {
    const custom = window.HYDRO_API_BASE || localStorage.getItem(API_BASE_KEY) || localStorage.getItem('hydro_api_base');
    return custom ? custom.replace(/\/+$/, '') : '';
  };

  async function req(path, opts = {}) {
    const base = getApiBase();
    const url = (base ? base + '/api' : '/api') + path;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401 && token() && !opts.noAuthRedirect) { logout(); throw new Error('Session expired'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.reload();
  }

  function debounce(key, fn, ms) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, ms);
  }

  // ---- push helpers (called from script.js) ----
  function pushAlerts(alerts) {
    if (offline || !token()) return;
    debounce('alerts', () => req('/alerts', { method: 'PUT', body: alerts }).catch(e => console.warn('[API] alert sync failed:', e.message)), 600);
  }
  function resetAlerts(alerts) {   // admin-only on the server; others just keep their local copy
    if (offline || !token()) return;
    req('/alerts/reset', { method: 'POST', body: alerts }).catch(e => console.warn('[API] reset not synced:', e.message));
  }
  function pushSettings(thresholds, settings) {
    if (offline || !token()) return;
    debounce('settings', () => req('/settings', { method: 'PUT', body: { thresholds, settings } }).catch(e => console.warn('[API] settings sync failed:', e.message)), 600);
  }
  function queueTelemetry(zoneReadings, simTime) {
    if (offline || !token()) return;
    Object.keys(zoneReadings).forEach(zoneId => {
      const p = zoneReadings[zoneId];
      telemetryQueue.push({ zoneId, rate: p.rate, expected: p.expectedBaseline, excess: p.excessRate, simTime });
    });
    if (telemetryQueue.length >= 40) {
      const batch = telemetryQueue; telemetryQueue = [];
      req('/telemetry', { method: 'POST', body: batch }).catch(() => {});
    }
  }

  // ---- initial sync: server -> localStorage cache, then the app boots from it ----
  async function syncDown() {
    const s = await req('/state');
    if (s.alerts && s.alerts.length) localStorage.setItem(K.alerts, JSON.stringify(s.alerts));
    if (s.thresholds) localStorage.setItem(K.thresholds, JSON.stringify(s.thresholds));
    if (s.settings) localStorage.setItem(K.settings, JSON.stringify(s.settings));
    // First run on an empty DB: the app seeds demo alerts locally, then pushes them up (via saveAlerts).
    if (!s.alerts || !s.alerts.length) localStorage.removeItem(K.alerts);
  }

  // ---- login / register overlay ----
  function injectStyles() {
    const st = document.createElement('style');
    st.textContent = `
    #hs-auth{position:fixed;inset:0;z-index:9999;background:linear-gradient(135deg,#0b1f3a,#0f766e);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
    #hs-auth .card{background:#fff;width:min(380px,92vw);border-radius:14px;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
    #hs-auth h2{margin:0 0 4px;color:#0b1f3a;font-size:22px}
    #hs-auth p.sub{margin:0 0 18px;color:#5b6b7c;font-size:13px}
    #hs-auth label{display:block;font-size:12px;font-weight:600;color:#33475b;margin:10px 0 4px}
    #hs-auth input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
    #hs-auth button.main{width:100%;margin-top:16px;padding:11px;background:#0f766e;color:#fff;border:0;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer}
    #hs-auth button.link{background:none;border:0;color:#0f766e;cursor:pointer;font-size:13px;margin-top:12px;padding:0}
    #hs-auth .err{color:#b91c1c;font-size:13px;min-height:18px;margin-top:10px}
    #hs-userbar{position:fixed;top:8px;right:12px;z-index:900;background:#0b1f3a;color:#fff;font:12px system-ui,sans-serif;padding:6px 10px;border-radius:20px;display:flex;gap:10px;align-items:center;opacity:.92}
    #hs-userbar button{background:#0f766e;color:#fff;border:0;border-radius:12px;padding:3px 9px;cursor:pointer;font-size:12px}
    #hs-userbar .off{color:#fbbf24}`;
    document.head.appendChild(st);
  }

  function showAuth() {
    return new Promise(resolve => {
      let mode = 'login';
      const wrap = document.createElement('div');
      wrap.id = 'hs-auth';
      document.body.appendChild(wrap);
      const render = () => {
        wrap.innerHTML = `<div class="card">
          <h2>HydroSense Sentinel</h2>
          <p class="sub">${mode === 'login' ? 'Sign in to the maintenance dashboard' : 'Create a staff account (first account becomes admin)'}</p>
          ${mode === 'register' ? '<label>Name</label><input id="hs-name" autocomplete="name">' : ''}
          <label>Email</label><input id="hs-email" type="email" autocomplete="email">
          <label>Password</label><input id="hs-pass" type="password" autocomplete="current-password">
          <div class="err" id="hs-err"></div>
          <button class="main" id="hs-go">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button class="link" id="hs-switch">${mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
        </div>`;
        wrap.querySelector('#hs-switch').onclick = () => { mode = mode === 'login' ? 'register' : 'login'; render(); };
        const go = async () => {
          const err = wrap.querySelector('#hs-err');
          err.textContent = '';
          try {
            const body = { email: wrap.querySelector('#hs-email').value, password: wrap.querySelector('#hs-pass').value };
            if (mode === 'register') body.name = wrap.querySelector('#hs-name').value;
            const out = await req('/auth/' + mode, { method: 'POST', body, noAuthRedirect: true });
            localStorage.setItem(TOKEN_KEY, out.token);
            localStorage.setItem(USER_KEY, JSON.stringify(out.user));
            wrap.remove();
            resolve();
          } catch (e) { err.textContent = e.message; }
        };
        wrap.querySelector('#hs-go').onclick = go;
        wrap.querySelector('#hs-pass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      };
      render();
    });
  }

  function userBar() {
    const bar = document.createElement('div');
    bar.id = 'hs-userbar';
    let u = {};
    try { u = JSON.parse(localStorage.getItem(USER_KEY) || '{}'); } catch {}
    const label = document.createElement('span');
    label.textContent = offline ? 'Offline mode (local only)' : (u.name || 'User') + (u.role ? ' · ' + u.role : '');
    if (offline) label.className = 'off';
    bar.appendChild(label);
    if (!offline) {
      const b = document.createElement('button');
      b.textContent = 'Logout';
      b.onclick = logout;
      bar.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.textContent = 'Connect Backend';
      b.onclick = () => {
        const curr = localStorage.getItem(API_BASE_KEY) || '';
        const val = prompt('Enter your Render Backend URL (e.g. https://hydrosense-backend.onrender.com):', curr);
        if (val !== null) {
          if (val.trim()) localStorage.setItem(API_BASE_KEY, val.trim());
          else localStorage.removeItem(API_BASE_KEY);
          location.reload();
        }
      };
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
  }

  async function ready() {
    injectStyles();
    // Is the backend reachable? (file:// or no server -> offline mode)
    try {
      const base = getApiBase();
      const h = await fetch((base ? base + '/api' : '/api') + '/health');
      if (!h.ok) throw new Error('no backend');
    } catch {
      offline = true;
      userBar();
      return;
    }
    if (token()) {
      try { await req('/auth/me'); } catch { localStorage.removeItem(TOKEN_KEY); }
    }
    if (!token()) await showAuth();
    try { await syncDown(); } catch (e) { console.warn('[API] initial sync failed:', e.message); }
    userBar();
  }

  window.HydroAPI = { ready, resetAlerts, pushAlerts, pushSettings, queueTelemetry, logout, req, setApiBase: (url) => { localStorage.setItem(API_BASE_KEY, url); location.reload(); } };
})();
