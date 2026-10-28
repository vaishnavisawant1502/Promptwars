# HydroSense Sentinel

> **SIMULATED DEMO DATA.** All flow readings, alerts and loss figures are generated in the browser. No real meters or sensors are connected. Every litre and rupee figure is an **estimate** of *potential* excess water, not a confirmed leak or verified saving.

Built for the PromptWars × KickToTech 2026 hackathon.

## 1. Problem & users
Hostels waste water quietly: a stuck flapper, a jammed urinal valve or a hose left open can lose thousands of litres overnight before anyone notices. **Intended users:** hostel maintenance staff and wardens who need a short, ranked list of *what to inspect first* and an estimate of how much water is at stake.

## 2. What it does (implemented)
- Simulates flow meters for 4 zones: Block A, Block B, Kitchen, Common Washrooms (24h diurnal curves + jitter).
- Two explainable rule-based checks (no ML):
  1. **Sustained night flow:** flow above the night threshold (default 3.0 L/min) in the night window (default 23:00-05:30) for at least 15 min.
  2. **Runaway high flow:** flow above the ceiling (default 45 L/min) for at least 20 min.
  Both rules also require the flow to be **>25% above that zone's normal flow for that hour**, so routine demand (kitchen at dinner, showers at 05:00) is not flagged. Short spikes are filtered by the duration requirement.
- Ranked inspection queue with a transparent priority score, and a workflow: Acknowledge, Investigating, Resolved, Reopen, plus staff notes.
- Insights: estimated excess water per zone, estimated cost in **₹**, zone efficiency table.
- Settings: thresholds, night window, units (L/min, m³/h, GPM), tariff (₹ per kL, editable estimate), simulation speed.
- Express + MongoDB backend with JWT login, saved alerts, settings and telemetry. If no backend is reachable the app runs in **local-only mode** (browser localStorage).

## 3. How estimates are calculated
`Estimated excess water (L) = excess flow (L/min) × duration (min)`
- Excess = observed flow minus the zone's expected baseline (night: the higher of the zone's night baseline and the hourly baseline). Never negative.
- One simulation tick = one simulated minute. An ongoing incident updates one alert (no double counting).
- `Estimated cost (₹) = litres / 1000 × tariff`. The default ₹25/kL is a placeholder, **not an official rate**. Set your local tariff in Settings.
- The alert detail view shows the arithmetic (excess × duration). Wording is "potential/estimated": the system flags *suspicious* flow, a human must inspect.

## 4. Tech stack
Vanilla JS + HTML/CSS + Chart.js 4.4.1 (CDN) · Node.js + Express · MongoDB (Mongoose) · JWT + bcryptjs · helmet, express-rate-limit · Node's built-in test runner + jsdom.

```
index.html  style.css  script.js  api.js  fx.js
server/
  src/server.js  src/validate.js  src/seed.js
  src/models/  src/routes/(auth,data)  src/middleware/auth.js
  test/detection.test.js  test/validate.test.js
```

## 5. Install & run
Requires Node.js 18+ and MongoDB (local, or a free MongoDB Atlas URI).
```bash
cd server
npm install
cp .env.example .env
# edit .env: set MONGODB_URI and a strong JWT_SECRET, for example:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start        # http://localhost:5000
```
Open http://localhost:5000 and register. The first account becomes admin (or set `ADMIN_EMAIL` in `.env` so only that email is admin; set `ALLOW_REGISTRATION=false` to close sign-up afterwards). Optional: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed`.

**Frontend only (no backend):** open `index.html` directly. The app runs in local-only mode.

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | 16+ chars; server refuses to start with the example value |
| `PORT`, `JWT_EXPIRES_IN` | no | default 5000, 7d |
| `ADMIN_EMAIL`, `ALLOW_REGISTRATION` | no | admin assignment / close sign-up |

## 6. Demo script (about 2 minutes)
1. **Normal flow:** Overview tab. Click **Restore Normal Baseline** on Live Monitor. Zero active alerts.
2. **Night leak:** Live Monitor → **Test Overnight Leak**. Block A flow jumps ~12.5 L/min above baseline at ~02:30; an alert appears.
3. **Why:** open the alert. Read the plain-English reason, the observed values and the priority-score breakdown.
4. **Calculation:** the detail view shows `est. litres ≈ excess L/min × minutes`; Insights shows the ₹ estimate.
5. **Short spike:** **Test Short Spike**. Block B surges for ~3 min and **no alert** is raised (duration filter).
6. **Workflow:** Acknowledge → Investigating → add a note → Resolved; counters update.
7. Change a threshold in Settings and repeat to show it changes detection.

## 7. Testing
```bash
cd server && npm test
```
11 tests: the real frontend runs in jsdom and the simulation is stepped through a 24h normal day (no false alerts), night leak (single alert), short spike (no alert), kitchen runaway (loss = excess × duration), settings affecting detection, ₹ display; plus backend input-validation tests. **Not covered:** live MongoDB integration, browser/visual tests, accessibility audit. Check these manually before relying on them.

## 8. Limitations (be upfront in the pitch)
- All data is simulated; thresholds and baselines are illustrative, not calibrated on real meters. No accuracy or savings claims are made.
- Heuristic rules only; no machine learning is implemented.
- The scenario buttons deliberately fast-forward the duration counter so the demo alerts within seconds; natural detection needs the full configured duration.
- Alerts are shared by all logged-in users of one facility; there is no multi-facility separation. Bulk sync never deletes; only an admin can reset/delete.
- A stale browser tab can overwrite a newer status of the same alert (last write wins).
- The ₹ tariff is an editable placeholder. Authentication is basic (no password reset or email verification).
- The MongoDB-backed server was code-reviewed and route-guard tested without a database, not run against a live MongoDB in the audit environment.

## 9. AI tools used (fill in truthfully)
- Claude (Anthropic) was used to help refactor the original frontend-only prototype into a full-stack app, add the Express/MongoDB backend, fix detection and currency issues, write tests and this README. All output was reviewed and run by the team.
- [ ] Add any other AI tools you used (for example ChatGPT, Copilot, Gemini) and what for.
- **AI inside the app:** none. Detection is rule-based. Do not describe it as AI/ML.

## 10. Originality declaration (complete yourself)
I/We, ____________________ (team ____________), declare that this project is our own work, that AI tools were used only as listed in section 9, that third-party libraries are used under their licences (Chart.js, Express, Mongoose, etc.), and that all data is simulated.
Signed: ____________  Date: ____________

## 11. API (JWT required except `/auth/*`)
`POST /api/auth/register|login`, `GET /api/auth/me`, `GET /api/state`, `GET|PUT /api/alerts` (PUT = upsert only), `PUT /api/alerts/:id`, `POST /api/alerts/reset` (admin), `DELETE /api/alerts/:id` (admin), `PUT /api/settings`, `POST|GET /api/telemetry`, `GET /api/stats`, `GET /api/health`.
