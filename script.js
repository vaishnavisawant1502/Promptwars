/**
 * HydroSense Sentinel — Core Application Engine
 * Water-Waste Monitoring Dashboard for Hostel Maintenance Teams
 * Frontend-only prototype with deterministic simulated telemetry,
 * explainable heuristic anomaly detection, and localStorage persistence.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION, STATE & DEFAULT DATASETS
  // =========================================================================

  const STORAGE_KEYS = {
    ALERTS: 'hydro_sentinel_alerts_v1',
    SETTINGS: 'hydro_sentinel_settings_v1',
    THRESHOLDS: 'hydro_sentinel_thresholds_v1',
    SESSION: 'hydro_sentinel_session_v1'
  };

  // Zone Definitions
  const ZONES = {
    hostel_a: {
      id: 'hostel_a',
      name: 'Hostel Block A',
      type: 'Residential (5-Floor)',
      occupancy: 250,
      nominalNightBaseline: 1.2, // L/min
      color: '#0f766e', // Deep teal
      bgColor: 'rgba(15, 118, 110, 0.15)'
    },
    hostel_b: {
      id: 'hostel_b',
      name: 'Hostel Block B',
      type: 'Residential (4-Floor)',
      occupancy: 220,
      nominalNightBaseline: 0.9, // L/min
      color: '#1e3a8a', // Navy blue
      bgColor: 'rgba(30, 58, 138, 0.15)'
    },
    kitchen: {
      id: 'kitchen',
      name: 'Hostel Kitchen',
      type: 'Commercial Food Prep & Mess',
      occupancy: 600, // meals
      nominalNightBaseline: 0.1, // L/min
      color: '#2dd4bf', // Bright teal
      bgColor: 'rgba(45, 212, 191, 0.15)'
    },
    washrooms: {
      id: 'washrooms',
      name: 'Common Washrooms',
      type: 'Ground Floor & Sports Facilities',
      occupancy: 120,
      nominalNightBaseline: 0.3, // L/min
      color: '#0ea5e9', // Sky
      bgColor: 'rgba(14, 165, 233, 0.15)'
    }
  };

  // Default Detection Thresholds
  const DEFAULT_THRESHOLDS = {
    nightBaselineThreshold: 3.0,     // L/min - Flow above this during night hours triggers sustained flow alert
    nightDurationTrigger: 15,        // Minutes - Required sustained duration to avoid single-flush false alarms
    highFlowCeiling: 45.0,           // L/min - Flow above this ceiling triggers runaway ceiling alert
    highFlowDurationTrigger: 20,     // Minutes - Required sustained duration to distinguish from shower spikes
    nightStart: '23:00',
    nightEnd: '05:30'
  };

  // Default User Preferences & Tariff
  const DEFAULT_SETTINGS = {
    unit: 'lpm',             // 'lpm' (L/min), 'm3h' (m³/h), 'gpm' (GPM)
    tariffRate: 25,          // Rs per 1,000 Litres (kL): editable ESTIMATE, not an official rate
    currency: 'INR',
    simSpeed: 2500,          // Interval in ms per sample (2.5s default)
    selectedPeriod: 'today'  // 'today', 'yesterday', 'week'
  };

  // 24-Hour Diurnal Baseline Curves (litres per minute per hour index 0..23)
  const DIURNAL_BASELINES = {
    // Hostel Block A (Peak at 07:00-09:00 showers & 19:00-22:00 evening return)
    hostel_a: [
      1.1, 0.9, 0.8, 0.9, 1.4, 4.2, 16.5, 34.0, 31.5, 18.2, 9.4, 8.1,
      11.2, 10.5, 7.8, 8.4, 12.0, 19.5, 26.8, 28.4, 22.1, 14.2, 5.8, 2.2
    ],
    // Hostel Block B (Similar curve, slightly scaled for 220 residents)
    hostel_b: [
      0.9, 0.8, 0.7, 0.7, 1.1, 3.5, 14.0, 29.5, 27.0, 15.8, 7.9, 7.0,
      9.5, 9.0, 6.8, 7.2, 10.5, 16.8, 23.0, 24.5, 19.0, 11.8, 4.9, 1.8
    ],
    // Hostel Kitchen (Early morning mess prep, lunch rush, dinner wash)
    kitchen: [
      0.1, 0.1, 0.1, 0.1, 0.8, 8.5, 28.0, 38.5, 24.0, 8.5, 14.0, 32.5,
      42.0, 22.0, 6.5, 5.0, 12.0, 35.0, 48.0, 36.0, 18.0, 6.2, 1.0, 0.2
    ],
    // Common Washrooms (Periodic daytime pulses, minimal night)
    washrooms: [
      0.3, 0.2, 0.2, 0.2, 0.4, 1.2, 5.5, 9.8, 8.2, 7.0, 6.5, 8.0,
      9.2, 7.5, 6.0, 7.8, 10.5, 12.4, 11.0, 8.5, 6.0, 3.2, 1.1, 0.5
    ]
  };

  // Helper to create empty excursion state
  function createEmptyExcursion() {
    return {
      inExcursion: false,
      consecutiveMinutes: 0,
      startTime: null,
      totalExcess: 0,
      peakRate: 0,
      alertId: null
    };
  }

  // Seed Alerts for Realistic Initial Experience
  const SEED_ALERTS = [
    {
      id: 'ALT-1042',
      zoneId: 'hostel_a',
      zoneName: 'Hostel Block A',
      ruleId: 'rule_night_flow',
      ruleName: 'Sustained Nighttime Flow',
      severity: 'critical',
      detectedAt: '02:35 AM',
      detectedDate: 'Today',
      durationMinutes: 180,
      excessRate: 12.5, // L/min excess above baseline
      estimatedLoss: 2250, // 12.5 * 180 = 2250 Litres
      observedValues: {
        currentFlow: 13.7,
        baseline: 1.2,
        excessRate: 12.5,
        peakFlow: 14.1,
        threshold: 3.0,
        durationMinutes: 180,
        unit: 'L/min'
      },
      observedPattern: 'Continuous flat 13.7 L/min between 02:00 and 05:00 with zero baseline decay.',
      reason: 'Hostel Block A historical night baseline is 0.8–1.8 L/min. Continuous elevated flow (> 12 L/min) during minimal occupancy may indicate a running toilet flapper or open washroom fixture on upper floors.',
      suggestedAction: 'Dispatch maintenance to 3rd and 4th floor communal washrooms to inspect cistern flapper valves and auto-shutoff taps.',
      status: 'investigating',
      notes: 'Plumber dispatched at 06:30 AM to inspect 3rd floor west wing cisterns.',
      active: true,
      isSimulated: true
    },
    {
      id: 'ALT-1041',
      zoneId: 'washrooms',
      zoneName: 'Common Washrooms',
      ruleId: 'rule_stuck_solenoid',
      ruleName: 'Cyclic Autoflush Solenoid Drift',
      severity: 'high',
      detectedAt: 'Yesterday 11:20 PM',
      detectedDate: 'Yesterday',
      durationMinutes: 95,
      excessRate: 6.8,
      estimatedLoss: 646, // 6.8 * 95 = 646 Litres
      observedValues: {
        currentFlow: 7.1,
        baseline: 0.3,
        excessRate: 6.8,
        peakFlow: 8.4,
        threshold: 3.0,
        durationMinutes: 95,
        unit: 'L/min'
      },
      observedPattern: 'Repetitive flush cycling every 75 seconds outside operating hours.',
      reason: 'Urinal infrared sensor bank 2 stuck in trigger loop. Continuous unprompted flushes during night hours.',
      suggestedAction: 'Clean optical sensor cover on Urinal Bank B or replace 9V solenoid actuator.',
      status: 'acknowledged',
      notes: 'Identified on Urinal #4; manual shutoff valve closed pending spare sensor.',
      active: false,
      isSimulated: true
    },
    {
      id: 'ALT-1039',
      zoneId: 'kitchen',
      zoneName: 'Hostel Kitchen',
      ruleId: 'rule_runaway_ceiling',
      ruleName: 'Continuous Ceiling Breach',
      severity: 'medium',
      detectedAt: '2 days ago',
      detectedDate: '2 days ago',
      durationMinutes: 45,
      excessRate: 18.0,
      estimatedLoss: 810,
      observedValues: {
        currentFlow: 42.0,
        baseline: 24.0,
        excessRate: 18.0,
        peakFlow: 44.5,
        threshold: 45.0,
        durationMinutes: 45,
        unit: 'L/min'
      },
      observedPattern: 'Sustained pre-rinse hose flow of 42 L/min for 45 minutes after dinner cleanup.',
      reason: 'Flow exceeded peak baseline well past operating shift end. Staff inadvertently left prep sink trickle running.',
      suggestedAction: 'Verify pot-wash station faucets and review kitchen closing checklist with night staff.',
      status: 'resolved',
      notes: 'Night guard notified head chef; valve closed at 22:45. Staff briefed.',
      active: false,
      isSimulated: true
    }
  ];

  // Runtime State
  const state = {
    currentView: 'overview',
    thresholds: Object.assign({}, DEFAULT_THRESHOLDS),
    settings: Object.assign({}, DEFAULT_SETTINGS),
    alerts: [],
    
    // Simulation engine state
    simTimer: null,
    isSimulating: true,
    simTimeHour: 2, // starts at 02:00 AM to immediately showcase night-time telemetry & leak detection!
    simTimeMinute: 45,
    activeScenario: 'night_leak', // 'none', 'night_leak', 'kitchen_burst', 'short_spike'
    scenarioTicksRemaining: 0,
    liveSelectedZone: 'hostel_a',
    
    // Stateful Excursion Tracking per Zone & Rule
    activeExcursions: {
      hostel_a: { night: createEmptyExcursion(), high: createEmptyExcursion() },
      hostel_b: { night: createEmptyExcursion(), high: createEmptyExcursion() },
      kitchen: { night: createEmptyExcursion(), high: createEmptyExcursion() },
      washrooms: { night: createEmptyExcursion(), high: createEmptyExcursion() }
    },

    // Live sliding telemetry buffer (last 30 samples)
    liveTelemetryBuffer: [],
    sessionCumulativeLoss: 0.0, // Litres estimated during this browser session
    
    // Filters for Alerts View
    filters: {
      search: '',
      severity: 'all',
      zone: 'all',
      status: 'unresolved'
    },

    // Chart instances
    charts: {
      overviewFlow: null,
      overviewBreakdown: null,
      liveFlow: null,
      insightsTrajectory: null,
      insightsLossBar: null
    },
    chartJsAvailable: false
  };

  // =========================================================================
  // 2. TRANSPARENT PRIORITY RANKING FORMULA
  // =========================================================================

  /**
   * Transparent Priority Scoring Formula:
   * Score = Status Weight + Severity Weight + Excess Volume Factor + Duration Factor + Active Bonus
   * - Unresolved (New/Investigating): 10,000 pts
   * - Acknowledged: 6,000 pts
   * - Resolved: 0 pts
   * - Severity: Critical = 4,000, High = 2,500, Medium = 1,200, Low = 400
   * - Excess Volume: min(3,000, estimatedLoss * 1.2)
   * - Duration: min(1,000, durationMinutes * 10)
   * - Active Ongoing Event Bonus: +500 pts
   */
  function calculateAlertPriority(alert) {
    let statusWeight = 0;
    if (alert.status === 'new' || alert.status === 'investigating') {
      statusWeight = 10000;
    } else if (alert.status === 'acknowledged') {
      statusWeight = 6000;
    } else if (alert.status === 'resolved') {
      statusWeight = 0;
    }

    const severityWeights = {
      critical: 4000,
      high: 2500,
      medium: 1200,
      low: 400
    };
    const severityWeight = severityWeights[alert.severity] || 500;
    const volumeWeight = Math.min(3000, Math.round((alert.estimatedLoss || 0) * 1.2));
    const durationWeight = Math.min(1000, (alert.durationMinutes || 1) * 10);
    const activeBonus = alert.active ? 500 : 0;

    return statusWeight + severityWeight + volumeWeight + durationWeight + activeBonus;
  }

  function rankAndSortAlerts() {
    state.alerts.forEach(alert => {
      alert.priorityScore = calculateAlertPriority(alert);
    });

    state.alerts.sort((a, b) => b.priorityScore - a.priorityScore);

    state.alerts.forEach((alert, idx) => {
      alert.priorityRank = idx + 1;
    });
  }

  // =========================================================================
  // 3. PERSISTENCE LAYER (localStorage)
  // =========================================================================

  function loadPersistedData() {
    try {
      // Load Thresholds
      const savedThresholds = localStorage.getItem(STORAGE_KEYS.THRESHOLDS);
      if (savedThresholds) {
        state.thresholds = Object.assign({}, DEFAULT_THRESHOLDS, JSON.parse(savedThresholds));
      } else {
        saveThresholds();
      }

      // Load Settings
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        state.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(savedSettings));
        if (state.settings.currency !== 'INR') {   // older saves used a USD tariff
          state.settings.currency = 'INR';
          state.settings.tariffRate = DEFAULT_SETTINGS.tariffRate;
          saveSettings();
        }
      } else {
        saveSettings();
      }

      // Load Alerts
      const savedAlerts = localStorage.getItem(STORAGE_KEYS.ALERTS);
      if (savedAlerts) {
        const parsed = JSON.parse(savedAlerts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.alerts = parsed;
        } else {
          state.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
          saveAlerts();
        }
      } else {
        state.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
        saveAlerts();
      }
    } catch (err) {
      console.warn('[HydroSense] Error parsing localStorage data, initializing fresh demo data:', err);
      state.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
      state.thresholds = Object.assign({}, DEFAULT_THRESHOLDS);
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
    }

    rankAndSortAlerts();
  }

  function saveAlerts() {
    try {
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(state.alerts));
      if (window.HydroAPI) HydroAPI.pushAlerts(state.alerts);
      updateSidebarAlertCounter();
    } catch (err) {
      console.error('[HydroSense] Failed to persist alerts:', err);
    }
  }

  function saveThresholds() {
    try {
      localStorage.setItem(STORAGE_KEYS.THRESHOLDS, JSON.stringify(state.thresholds));
      if (window.HydroAPI) HydroAPI.pushSettings(state.thresholds, state.settings);
    } catch (err) {
      console.error('[HydroSense] Failed to persist thresholds:', err);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      if (window.HydroAPI) HydroAPI.pushSettings(state.thresholds, state.settings);
    } catch (err) {
      console.error('[HydroSense] Failed to persist settings:', err);
    }
  }

  // =========================================================================
  // 4. UNIT CONVERSIONS & FORMATTERS
  // =========================================================================

  function formatFlowRate(litresPerMinute, showUnit = true) {
    const val = Number(litresPerMinute) || 0;
    let converted = val;
    let unitLabel = 'L/min';

    if (state.settings.unit === 'm3h') {
      converted = val * 0.06; // 1 L/min = 0.06 m³/h
      unitLabel = 'm³/h';
    } else if (state.settings.unit === 'gpm') {
      converted = val * 0.264172; // 1 L/min = 0.264 GPM
      unitLabel = 'GPM';
    }

    const precision = converted >= 10 ? 1 : 2;
    const formattedNum = converted.toFixed(precision);
    return showUnit ? `${formattedNum} ${unitLabel}` : formattedNum;
  }

  function formatVolume(litres, showUnit = true) {
    const val = Math.round(Number(litres) || 0);
    const formatted = val.toLocaleString();
    return showUnit ? `${formatted} Litres` : formatted;
  }

  function formatCurrency(litres) {
    const kL = (Number(litres) || 0) / 1000;
    const cost = kL * (state.settings.tariffRate || DEFAULT_SETTINGS.tariffRate);
    return `\u20B9${cost.toFixed(2)}`;
  }

  function getUnitLabel() {
    if (state.settings.unit === 'm3h') return 'm³/h';
    if (state.settings.unit === 'gpm') return 'GPM';
    return 'L/min';
  }

  // =========================================================================
  // 5. SIMULATION TELEMETRY ENGINE
  // =========================================================================

  /**
   * Generates a deterministic water flow packet for a given zone and time,
   * injecting anomalies if a scenario is active.
   */
  function generateZoneFlowPacket(zoneId, hourIndex, minuteIndex) {
    const baseHourRate = DIURNAL_BASELINES[zoneId][hourIndex % 24];
    
    // Add realistic fluctuation (+/- 5-10% Gaussian-like jitter)
    const microJitter = (Math.sin((minuteIndex * 7) + (hourIndex * 13)) * 0.15) * baseHourRate;
    let currentRate = Math.max(0.1, baseHourRate + microJitter);
    let isAnomalous = false;
    let excessRate = 0;

    // Check active anomaly scenarios
    if (state.activeScenario === 'night_leak' && zoneId === 'hostel_a') {
      // Overnight cistern flapper leak: adds +12.5 L/min continuous flat flow
      const leakRate = 12.5 + (Math.sin(minuteIndex * 2) * 0.4);
      currentRate += leakRate;
      excessRate = leakRate;
      isAnomalous = true;
    } else if (state.activeScenario === 'kitchen_burst' && zoneId === 'kitchen') {
      // Kitchen pre-rinse hose locked open: +42.0 L/min continuous breach
      const burstRate = 42.0 + (Math.sin(minuteIndex * 3) * 1.2);
      currentRate += burstRate;
      excessRate = burstRate;
      isAnomalous = true;
    } else if (state.activeScenario === 'short_spike' && zoneId === 'hostel_b') {
      // 2-3 minute shower burst in Block B that clears automatically
      currentRate += 48.0;
      excessRate = 48.0;
      isAnomalous = false; // short spike is not sustained enough yet
    }

    return {
      zoneId: zoneId,
      zoneName: ZONES[zoneId].name,
      timestamp: formatSimTime(hourIndex, minuteIndex),
      rate: Number(currentRate.toFixed(2)),
      expectedBaseline: baseHourRate,
      excessRate: Number(excessRate.toFixed(2)),
      isAnomalous: isAnomalous
    };
  }

  function formatSimTime(h, m) {
    const hh = String(h % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /**
   * Main simulation tick: advances virtual clock, collects readings,
   * evaluates anomaly detection rules, and updates UI components.
   */
  function runSimulationTick() {
    // Advance virtual clock: 1 minute per tick for visible scenario progression
    state.simTimeMinute += 1;
    if (state.simTimeMinute >= 60) {
      state.simTimeMinute = 0;
      state.simTimeHour = (state.simTimeHour + 1) % 24;
    }

    // Auto-countdown for short_spike scenario
    if (state.activeScenario === 'short_spike') {
      if (state.scenarioTicksRemaining > 0) {
        state.scenarioTicksRemaining -= 1;
      } else {
        // Spike has naturally finished and cleared!
        state.activeScenario = 'none';
        showToast('Short shower spike ended naturally after 3 mins — Demonstrating zero false alert generated', 'info');
      }
    }

    const currentHour = state.simTimeHour;
    const currentMin = state.simTimeMinute;
    const timeStr = formatSimTime(currentHour, currentMin);

    // Update timestamp in sidebar
    const timeDisplay = document.getElementById('sim-timestamp');
    if (timeDisplay) {
      timeDisplay.textContent = `Sim Time: ${timeStr} (Day 1)`;
    }

    // Generate telemetry for all 4 zones
    const zoneReadings = {};
    let aggregatedFlow = 0;
    let currentExcessSum = 0;
    let confirmedExcessSum = 0; // excess from genuine anomalies only (excludes normal demand spikes)
    let expectedSum = 0;

    Object.keys(ZONES).forEach(zoneId => {
      const packet = generateZoneFlowPacket(zoneId, currentHour, currentMin);
      zoneReadings[zoneId] = packet;
      aggregatedFlow += packet.rate;
      expectedSum += packet.expectedBaseline;
      if (packet.excessRate > 0) {
        currentExcessSum += packet.excessRate;
        if (packet.isAnomalous) confirmedExcessSum += packet.excessRate;
      }
    });

    if (window.HydroAPI) HydroAPI.queueTelemetry(zoneReadings, timeStr);

    // Update cumulative session loss: excess rate (L/min) x 1 simulated minute = Litres.
    // Only genuine anomalies count; short shower spikes are normal demand, not waste.
    if (confirmedExcessSum > 0) {
      state.sessionCumulativeLoss += confirmedExcessSum * 1.0;
    }

    // Update Sliding Telemetry Buffer for Live Monitor (limit to 30 data points)
    const activeZone = state.liveSelectedZone;
    const activeRate = (activeZone === 'all') ? aggregatedFlow : zoneReadings[activeZone].rate;
    const activeExcess = (activeZone === 'all') ? currentExcessSum : zoneReadings[activeZone].excessRate;
    const activeExpected = (activeZone === 'all') ? expectedSum : zoneReadings[activeZone].expectedBaseline;

    state.liveTelemetryBuffer.push({
      time: timeStr,
      rate: activeRate,
      excess: activeExcess,
      expected: activeExpected
    });

    if (state.liveTelemetryBuffer.length > 30) {
      state.liveTelemetryBuffer.shift();
    }

    // Evaluate Rule-based Detection Engine
    evaluateDetectionRules(zoneReadings, currentHour, currentMin);

    // Update Live Monitor UI if visible or in background
    updateLiveMonitorDisplay(zoneReadings, activeZone, activeRate, activeExcess, activeExpected);

    // Update Live Chart
    if (state.charts.liveFlow) {
      updateLiveChart();
    }

    // Refresh Overview stats periodically
    updateOverviewStats();
  }

  // =========================================================================
  // 6. EXPLAINABLE RULE-BASED ANOMALY DETECTION ENGINE (DURATION-CHECKED)
  // =========================================================================

  /**
   * Evaluates telemetry against heuristic inspection rules.
   * Tracks consecutive duration to distinguish short spikes from sustained flows.
   * Ensures explainability, transparent conditions, and deduplication.
   */
  // A reading only counts as abnormal when it is above the user's threshold AND clearly above
  // what is normal for that zone at that hour (normal jitter is up to +15%, so 25% is the margin).
  // This stops routine demand (e.g. kitchen at dinner, morning showers at 05:00) from raising false alerts.
  const NORMAL_DEMAND_MARGIN = 1.25;
  function isAboveNormalDemand(packet) {
    return packet.rate > packet.expectedBaseline * NORMAL_DEMAND_MARGIN;
  }

  function evaluateDetectionRules(readings, hour, minute) {
    const isNightWindow = isTimeInNightWindow(hour, minute);
    let liveTransientInfo = {
      type: 'normal',
      message: 'All 4 zones telemetry within baseline limits. No suspicious excursions.',
      timerText: 'Threshold Filter: Sustained Duration Required'
    };

    Object.keys(readings).forEach(zoneId => {
      const packet = readings[zoneId];
      const zoneConfig = ZONES[zoneId];
      const excursions = state.activeExcursions[zoneId];

      // -------------------------------------------------------------------
      // Rule 1: Sustained Flow During Inactive / Overnight Period
      // -------------------------------------------------------------------
      if (isNightWindow) {
        const isNightExcursion = packet.rate > state.thresholds.nightBaselineThreshold && isAboveNormalDemand(packet);
        const nightRef = Math.max(zoneConfig.nominalNightBaseline, packet.expectedBaseline);
        const ex = excursions.night;

        if (isNightExcursion) {
          if (!ex.inExcursion) {
            ex.inExcursion = true;
            ex.consecutiveMinutes = 1;
            ex.startTime = packet.timestamp;
            ex.peakRate = packet.rate;
            ex.totalExcess = Math.max(0, packet.rate - nightRef);
            ex.alertId = null;
          } else {
            ex.consecutiveMinutes += 1;
            ex.peakRate = Math.max(ex.peakRate, packet.rate);
            ex.totalExcess += Math.max(0, packet.rate - nightRef);
          }

          // Check if sustained duration threshold has been reached
          if (ex.consecutiveMinutes >= state.thresholds.nightDurationTrigger) {
            // PROMOTED TO SUSTAINED ANOMALY ALERT!
            const avgExcess = Number((ex.totalExcess / ex.consecutiveMinutes).toFixed(2));
            const estLoss = Math.round(avgExcess * ex.consecutiveMinutes);

            handleAnomalyEvent({
              existingAlertId: ex.alertId,
              ruleId: 'rule_night_flow',
              ruleName: 'Sustained Nighttime Flow',
              zoneId: zoneId,
              zoneName: zoneConfig.name,
              severity: (ex.peakRate > 10.0 || ex.consecutiveMinutes >= 60) ? 'critical' : 'high',
              durationMinutes: ex.consecutiveMinutes,
              excessRate: avgExcess,
              estimatedLoss: estLoss,
              observedValues: {
                currentFlow: packet.rate,
                baseline: zoneConfig.nominalNightBaseline,
                excessRate: avgExcess,
                peakFlow: ex.peakRate,
                threshold: state.thresholds.nightBaselineThreshold,
                durationMinutes: ex.consecutiveMinutes,
                unit: getUnitLabel()
              },
              observedPattern: `Continuous flow of ${formatFlowRate(packet.rate)} at ${packet.timestamp} (sustained for ${ex.consecutiveMinutes} min, peak ${formatFlowRate(ex.peakRate)}) during scheduled night minimum.`,
              reason: `${zoneConfig.name} night baseline is expected to be under ${zoneConfig.nominalNightBaseline} L/min. Telemetry has continuously exceeded the ${state.thresholds.nightBaselineThreshold} L/min threshold for ${ex.consecutiveMinutes} consecutive minutes (exceeds ${state.thresholds.nightDurationTrigger} min requirement).`,
              suggestedAction: `Check toilet cistern flapper valves, auto-flush urinal banks, and service risers in ${zoneConfig.name}.`,
              onAlertCreated: (id) => { ex.alertId = id; }
            });

            liveTransientInfo = {
              type: 'sustained',
              message: `Alert Active in ${zoneConfig.name}: Sustained night flow (${ex.consecutiveMinutes}m elapsed, +${formatFlowRate(avgExcess)} excess).`,
              timerText: `Trigger Threshold Met (>${state.thresholds.nightDurationTrigger}m)`
            };
          } else {
            // SHORT TRANSIENT SPIKE IN PROGRESS (Below duration trigger)
            liveTransientInfo = {
              type: 'spike',
              message: `Monitoring Transient Night Flow in ${zoneConfig.name}: ${ex.consecutiveMinutes}m / ${state.thresholds.nightDurationTrigger}m required before alert.`,
              timerText: `Spike Filter: ${ex.consecutiveMinutes}m of ${state.thresholds.nightDurationTrigger}m`
            };
          }
        } else {
          // Flow returned to normal or is below threshold
          if (ex.inExcursion) {
            if (ex.consecutiveMinutes < state.thresholds.nightDurationTrigger) {
              // SHORT SPIKE SAFELY CLEARED WITHOUT FALSE ALARM!
              liveTransientInfo = {
                type: 'normal',
                message: `Transient night spike in ${zoneConfig.name} (${ex.consecutiveMinutes}m) resolved naturally below ${state.thresholds.nightDurationTrigger}m trigger — Zero false alarm created.`,
                timerText: 'Filtered as Non-Sustained'
              };
            } else if (ex.alertId) {
              // Sustained leak ended
              const activeAlert = state.alerts.find(a => a.id === ex.alertId);
              if (activeAlert) activeAlert.active = false;
            }
            state.activeExcursions[zoneId].night = createEmptyExcursion();
          }
        }
      } else {
        // Daytime: if night excursion was still marked, close it
        if (excursions.night.inExcursion) {
          state.activeExcursions[zoneId].night = createEmptyExcursion();
        }
      }

      // -------------------------------------------------------------------
      // Rule 2: Continuous Daytime High-Flow Runaway Ceiling
      // -------------------------------------------------------------------
      const isHighFlowExcursion = packet.rate > state.thresholds.highFlowCeiling && isAboveNormalDemand(packet);
      const exHigh = excursions.high;

      if (isHighFlowExcursion) {
        if (!exHigh.inExcursion) {
          exHigh.inExcursion = true;
          exHigh.consecutiveMinutes = 1;
          exHigh.startTime = packet.timestamp;
          exHigh.peakRate = packet.rate;
          exHigh.totalExcess = Math.max(0, packet.rate - packet.expectedBaseline);
          exHigh.alertId = null;
        } else {
          exHigh.consecutiveMinutes += 1;
          exHigh.peakRate = Math.max(exHigh.peakRate, packet.rate);
          exHigh.totalExcess += Math.max(0, packet.rate - packet.expectedBaseline);
        }

        if (exHigh.consecutiveMinutes >= state.thresholds.highFlowDurationTrigger) {
          // PROMOTED TO RUNAWAY HIGH FLOW ALERT!
          const avgExcess = Number((exHigh.totalExcess / exHigh.consecutiveMinutes).toFixed(2));
          const estLoss = Math.round(avgExcess * exHigh.consecutiveMinutes);

          handleAnomalyEvent({
            existingAlertId: exHigh.alertId,
            ruleId: 'rule_runaway_ceiling',
            ruleName: 'Continuous Ceiling Breach',
            zoneId: zoneId,
            zoneName: zoneConfig.name,
            severity: 'critical',
            durationMinutes: exHigh.consecutiveMinutes,
            excessRate: avgExcess,
            estimatedLoss: estLoss,
            observedValues: {
              currentFlow: packet.rate,
              baseline: packet.expectedBaseline,
              excessRate: avgExcess,
              peakFlow: exHigh.peakRate,
              threshold: state.thresholds.highFlowCeiling,
              durationMinutes: exHigh.consecutiveMinutes,
              unit: getUnitLabel()
            },
            observedPattern: `Flow peaked at ${formatFlowRate(exHigh.peakRate)}, breaching the ${state.thresholds.highFlowCeiling} L/min ceiling continuously for ${exHigh.consecutiveMinutes} min.`,
            reason: `Flow in ${zoneConfig.name} breached peak operational ceiling (${state.thresholds.highFlowCeiling} L/min) continuously for ${exHigh.consecutiveMinutes} minutes without cyclic drop. Indicates an unmonitored open supply line or burst pipe.`,
            suggestedAction: `Inspect main supply lines and washdown stations in ${zoneConfig.name} immediately.`,
            onAlertCreated: (id) => { exHigh.alertId = id; }
          });

          liveTransientInfo = {
            type: 'sustained',
            message: `Critical Runaway Flow in ${zoneConfig.name}: Breached ${state.thresholds.highFlowCeiling} L/min for ${exHigh.consecutiveMinutes}m.`,
            timerText: `Sustained Breach (>${state.thresholds.highFlowDurationTrigger}m)`
          };
        } else {
          // SHORT PEAK DEMAND (e.g., student shower burst)
          liveTransientInfo = {
            type: 'spike',
            message: `High Flow Burst in ${zoneConfig.name} (${formatFlowRate(packet.rate)}): ${exHigh.consecutiveMinutes}m / ${state.thresholds.highFlowDurationTrigger}m required before alert.`,
            timerText: `Spike Filter: ${exHigh.consecutiveMinutes}m of ${state.thresholds.highFlowDurationTrigger}m`
          };
        }
      } else {
        if (exHigh.inExcursion) {
          if (exHigh.consecutiveMinutes < state.thresholds.highFlowDurationTrigger) {
            liveTransientInfo = {
              type: 'normal',
              message: `High demand peak in ${zoneConfig.name} (${exHigh.consecutiveMinutes}m) returned to baseline without alert — Normal operational demand verified.`,
              timerText: 'Filtered as Non-Sustained'
            };
          } else if (exHigh.alertId) {
            const activeAlert = state.alerts.find(a => a.id === exHigh.alertId);
            if (activeAlert) activeAlert.active = false;
          }
          state.activeExcursions[zoneId].high = createEmptyExcursion();
        }
      }
    });

    // Update transient status bar in Live Monitor
    updateTransientStatusBar(liveTransientInfo);
  }

  function updateTransientStatusBar(info) {
    const bar = document.getElementById('live-transient-status-bar');
    const tag = document.getElementById('live-transient-tag');
    const msg = document.getElementById('live-transient-message');
    const timer = document.getElementById('live-transient-timer');

    if (!bar || !tag || !msg || !timer) return;

    bar.className = 'transient-status-bar';
    if (info.type === 'spike') {
      bar.classList.add('spike-active');
      tag.className = 'transient-tag spike';
      tag.textContent = 'SPIKE';
    } else if (info.type === 'sustained') {
      bar.classList.add('alert-active');
      tag.className = 'transient-tag sustained';
      tag.textContent = 'LEAK CONFIRMED';
    } else {
      tag.className = 'transient-tag normal';
      tag.textContent = 'NORMAL';
    }

    msg.textContent = info.message;
    timer.textContent = info.timerText;
  }

  function isTimeInNightWindow(h, m) {
    // Compare in minutes-of-day so a window like 23:00-05:30 honours the :30
    const [startH, startM = 0] = state.thresholds.nightStart.split(':').map(Number);
    const [endH, endM = 0] = state.thresholds.nightEnd.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    const cur = h * 60 + m;

    if (start > end) {
      // Over midnight window: e.g. 23:00 to 05:30
      return cur >= start || cur < end;
    }
    return cur >= start && cur < end;
  }

  /**
   * Generates a unique, incrementing alert ID.
   */
  function getNextAlertId() {
    let maxId = 1042;
    state.alerts.forEach(a => {
      const num = parseInt(String(a.id).replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxId) {
        maxId = num;
      }
    });
    return maxId + 1;
  }

  /**
   * Manages alert lifecycle and deduplication.
   * If an unresolved alert already exists for the ongoing event, updates its duration and loss,
   * avoiding creating dozens of redundant alert cards!
   */
  function handleAnomalyEvent(eventData) {
    let existing = null;
    if (eventData.existingAlertId) {
      existing = state.alerts.find(a => a.id === eventData.existingAlertId);
    }
    // An alert the operator already resolved must not be reactivated or mutated by the ongoing event
    if (existing && existing.status === 'resolved') {
      return;
    }
    if (!existing) {
      existing = state.alerts.find(a => 
        a.zoneId === eventData.zoneId && 
        a.ruleId === eventData.ruleId && 
        a.status !== 'resolved'
      );
    }

    if (existing) {
      // Ongoing event: update existing alert
      // Duration only grows for an ongoing event (no double counting / shrinking), and
      // loss = excess rate (L/min) x duration (min) = Litres, so units stay consistent.
      existing.durationMinutes = Math.max(existing.durationMinutes || 0, eventData.durationMinutes);
      existing.excessRate = eventData.excessRate;
      existing.estimatedLoss = Math.round(existing.excessRate * existing.durationMinutes);
      existing.observedValues = eventData.observedValues;
      existing.observedPattern = eventData.observedPattern;
      existing.active = true;
      if (eventData.onAlertCreated) {
        eventData.onAlertCreated(existing.id);
      }
    } else {
      // Brand new event: generate unique ID
      const newIdNum = getNextAlertId();
      const newAlert = {
        id: `ALT-${newIdNum}`,
        zoneId: eventData.zoneId,
        zoneName: eventData.zoneName,
        ruleId: eventData.ruleId,
        ruleName: eventData.ruleName,
        severity: eventData.severity,
        timestamp: `${formatSimTime(state.simTimeHour, state.simTimeMinute)} (Simulated)`,
        detectedAt: formatSimTime(state.simTimeHour, state.simTimeMinute),
        detectedDate: 'Today',
        durationMinutes: eventData.durationMinutes,
        excessRate: eventData.excessRate,
        estimatedLoss: eventData.estimatedLoss,
        observedValues: eventData.observedValues,
        observedPattern: eventData.observedPattern,
        reason: eventData.reason,
        suggestedAction: eventData.suggestedAction,
        status: 'new',
        notes: '',
        active: true,
        isSimulated: true
      };

      state.alerts.unshift(newAlert);
      if (eventData.onAlertCreated) {
        eventData.onAlertCreated(newAlert.id);
      }
      showToast(`New ${newAlert.severity.toUpperCase()} Alert: ${newAlert.id} in ${newAlert.zoneName}`, newAlert.severity);
    }

    rankAndSortAlerts();
    saveAlerts();
    renderAlertsTable();
    renderOverviewAlertsQueue();
  }

  // =========================================================================
  // 7. UI VIEW NAVIGATION & CONTROLS
  // =========================================================================

  function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        switchView(targetView);
      });
    });

    // Mobile sidebar hamburger
    const mobileBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileBtn && sidebar) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });

      // Close sidebar when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !mobileBtn.contains(e.target) && sidebar.classList.contains('mobile-open')) {
          sidebar.classList.remove('mobile-open');
        }
      });
    }

    // View All Alerts shortcut from Overview
    const viewAllAlertsBtn = document.getElementById('overview-view-all-alerts-btn');
    if (viewAllAlertsBtn) {
      viewAllAlertsBtn.addEventListener('click', () => {
        switchView('alerts');
      });
    }
  }

  function switchView(viewName) {
    if (!viewName) return;
    state.currentView = viewName;

    // Automatically close mobile sidebar when navigating on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
    }

    // Update tab buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
      const match = btn.getAttribute('data-view') === viewName;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    // Update Header Titles
    const titleEl = document.getElementById('page-title');
    const descEl = document.getElementById('page-description');

    const headers = {
      overview: {
        title: 'Overview Dashboard',
        desc: 'Monitoring 4 hostel zones for suspicious water loss and flow anomalies.'
      },
      live: {
        title: 'Live Flow Telemetry Monitor',
        desc: 'Real-time telemetry stream updating every 2.5 seconds with threshold trigger overlays.'
      },
      alerts: {
        title: 'Alerts & Investigation Queue',
        desc: 'Prioritized flow anomalies with explainable diagnostic rules and audit tracking.'
      },
      insights: {
        title: 'Water Efficiency & Loss Insights',
        desc: 'Deep comparative analytics, peak load profiles, and verifiable loss calculations.'
      },
      settings: {
        title: 'Detection Rules & System Settings',
        desc: 'Configure heuristic trigger thresholds, economic tariffs, and demonstration state.'
      }
    };

    if (headers[viewName]) {
      if (titleEl) titleEl.textContent = headers[viewName].title;
      if (descEl) descEl.textContent = headers[viewName].desc;
    }

    // Trigger fresh data updates and chart resize for newly visible view
    if (viewName === 'overview') {
      updateOverviewStats();
      if (state.chartJsAvailable) {
        setTimeout(() => {
          if (state.charts.overviewFlow) state.charts.overviewFlow.resize();
          if (state.charts.overviewBreakdown) state.charts.overviewBreakdown.resize();
        }, 50);
      }
    } else if (viewName === 'live') {
      if (state.chartJsAvailable && state.charts.liveFlow) {
        setTimeout(() => state.charts.liveFlow.resize(), 50);
      }
    } else if (viewName === 'alerts') {
      renderAlertsTable();
    } else if (viewName === 'insights') {
      renderInsightsView();
      if (state.chartJsAvailable) {
        setTimeout(() => {
          if (state.charts.insightsTrajectory) state.charts.insightsTrajectory.resize();
          if (state.charts.insightsLossBar) state.charts.insightsLossBar.resize();
        }, 50);
      }
    }
  }

  // =========================================================================
  // 8. SIMULATION CONTROLS & SCENARIO TRIGGERS
  // =========================================================================

  function initSimulationControls() {
    // Global simulation Play/Pause toggle
    const toggleBtn = document.getElementById('global-sim-toggle-btn');
    const toggleLabel = document.getElementById('global-sim-toggle-label');
    const playPauseIcon = document.getElementById('sim-play-pause-icon');
    const liveStreamToggleIcon = document.getElementById('live-stream-toggle-icon');
    const simPulse = document.getElementById('sim-pulse-dot');
    const simStateText = document.getElementById('sim-state-text');
    const simLiveToggleBtn = document.getElementById('live-stream-toggle-btn');
    const simLiveToggleLabel = document.getElementById('live-stream-toggle-label');
    const liveTelemetryBadge = document.getElementById('live-telemetry-badge');

    function setSimulationRunning(running) {
      state.isSimulating = running;
      if (running) {
        startSimulationTimer();
        if (toggleLabel) toggleLabel.textContent = 'Pause';
        if (simLiveToggleLabel) simLiveToggleLabel.textContent = 'Pause Stream';
        if (simPulse) simPulse.classList.add('active');
        if (simStateText) simStateText.textContent = 'Simulating';
        if (liveTelemetryBadge) {
          liveTelemetryBadge.innerHTML = '<span class="pulse-dot"></span> Telemetry Active';
        }
        
        // Pause icon (two bars)
        const pauseSvg = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        if (playPauseIcon) playPauseIcon.innerHTML = pauseSvg;
        if (liveStreamToggleIcon) liveStreamToggleIcon.innerHTML = pauseSvg;
      } else {
        stopSimulationTimer();
        if (toggleLabel) toggleLabel.textContent = 'Resume';
        if (simLiveToggleLabel) simLiveToggleLabel.textContent = 'Resume Stream';
        if (simPulse) simPulse.classList.remove('active');
        if (simStateText) simStateText.textContent = 'Paused';
        if (liveTelemetryBadge) {
          liveTelemetryBadge.innerHTML = '<span style="background:#94a3b8;display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;"></span> Telemetry Paused';
        }
        
        // Play icon (triangle)
        const playSvg = '<polygon points="5 3 19 12 5 21"></polygon>';
        if (playPauseIcon) playPauseIcon.innerHTML = playSvg;
        if (liveStreamToggleIcon) liveStreamToggleIcon.innerHTML = playSvg;
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        setSimulationRunning(!state.isSimulating);
      });
    }

    if (simLiveToggleBtn) {
      simLiveToggleBtn.addEventListener('click', () => {
        setSimulationRunning(!state.isSimulating);
      });
    }

    // Quick Test Leak Button (Top bar)
    const testLeakBtn = document.getElementById('global-trigger-scenario-btn');
    if (testLeakBtn) {
      testLeakBtn.addEventListener('click', () => {
        injectScenario('night_leak');
      });
    }

    // Live Monitor Scenario Buttons
    const liveScenarioBtn = document.getElementById('live-generate-scenario-btn');
    if (liveScenarioBtn) {
      liveScenarioBtn.addEventListener('click', () => {
        injectScenario('night_leak');
      });
    }

    const liveHighBtn = document.getElementById('live-test-high-btn');
    if (liveHighBtn) {
      liveHighBtn.addEventListener('click', () => {
        injectScenario('kitchen_burst');
      });
    }

    const liveSpikeBtn = document.getElementById('live-test-spike-btn');
    if (liveSpikeBtn) {
      liveSpikeBtn.addEventListener('click', () => {
        injectScenario('short_spike');
      });
    }

    const liveRestoreBtn = document.getElementById('live-restore-normal-btn');
    if (liveRestoreBtn) {
      liveRestoreBtn.addEventListener('click', () => {
        restoreNormalDemo();
      });
    }

    // Overview empty state trigger
    const overviewEmptyBtn = document.getElementById('overview-empty-trigger-scenario-btn');
    if (overviewEmptyBtn) {
      overviewEmptyBtn.addEventListener('click', () => {
        injectScenario('night_leak');
      });
    }

    // Alerts view inject incident
    const alertsTriggerBtn = document.getElementById('alerts-trigger-scenario-btn');
    if (alertsTriggerBtn) {
      alertsTriggerBtn.addEventListener('click', () => {
        injectScenario('night_leak');
      });
    }

    // Zone picker in Live Monitor
    const liveZoneSelect = document.getElementById('live-zone-select');
    if (liveZoneSelect) {
      liveZoneSelect.addEventListener('change', (e) => {
        state.liveSelectedZone = e.target.value;
        const chartTitle = document.getElementById('live-chart-title');
        if (chartTitle) {
          const name = state.liveSelectedZone === 'all' ? 'All Zones Aggregated' : ZONES[state.liveSelectedZone].name;
          chartTitle.textContent = `Real-Time Flow Telemetry (${name})`;
        }
        
        // Smoothly backfill buffer with 15 historical points for the newly selected zone
        state.liveTelemetryBuffer = [];
        for (let m = 14; m >= 0; m--) {
          let histMin = state.simTimeMinute - m;
          let histHour = state.simTimeHour;
          while (histMin < 0) {
            histMin += 60;
            histHour = (histHour - 1 + 24) % 24;
          }
          let rate = 0;
          let excess = 0;
          let expected = 0;
          if (state.liveSelectedZone === 'all') {
            Object.keys(ZONES).forEach(zid => {
              const p = generateZoneFlowPacket(zid, histHour, histMin);
              rate += p.rate;
              excess += p.excessRate;
              expected += p.expectedBaseline;
            });
          } else {
            const p = generateZoneFlowPacket(state.liveSelectedZone, histHour, histMin);
            rate = p.rate;
            excess = p.excessRate;
            expected = p.expectedBaseline;
          }
          state.liveTelemetryBuffer.push({
            time: formatSimTime(histHour, histMin),
            rate: Number(rate.toFixed(2)),
            excess: Number(excess.toFixed(2)),
            expected: Number(expected.toFixed(2))
          });
        }
        
        // Immediately run a tick so the display switches without waiting
        runSimulationTick();
      });
    }

    // Period selector in Topbar
    const periodSelector = document.getElementById('period-selector');
    if (periodSelector) {
      periodSelector.value = state.settings.selectedPeriod;
      periodSelector.addEventListener('change', (e) => {
        state.settings.selectedPeriod = e.target.value;
        saveSettings();
        updateOverviewStats();
        if (state.charts.overviewBreakdown) {
          updateOverviewCharts();
        }
      });
    }
  }

  function startSimulationTimer() {
    stopSimulationTimer();
    state.simTimer = setInterval(runSimulationTick, state.settings.simSpeed || 2500);
  }

  function stopSimulationTimer() {
    if (state.simTimer) {
      clearInterval(state.simTimer);
      state.simTimer = null;
    }
  }

  function injectScenario(scenarioType) {
    state.activeScenario = scenarioType;

    if (scenarioType === 'night_leak') {
      state.simTimeHour = 2; // Jump into night window (02:30 AM)
      state.simTimeMinute = 30;
      state.liveSelectedZone = 'hostel_a';
      const zoneSelect = document.getElementById('live-zone-select');
      if (zoneSelect) zoneSelect.value = 'hostel_a';

      // Prime the night excursion consecutive counter so the detection engine verifies and triggers promptly
      // Fresh excursion so a re-test after resolving an alert raises a new incident
      state.activeExcursions.hostel_a.night = createEmptyExcursion();
      const exNight = state.activeExcursions.hostel_a.night;
      exNight.inExcursion = true;
      exNight.consecutiveMinutes = Math.max(1, state.thresholds.nightDurationTrigger - 1);
      exNight.peakRate = 13.7;
      exNight.totalExcess = 12.5 * exNight.consecutiveMinutes;

      showToast('Injected scenario: Sustained toilet cistern leak in Hostel Block A (+12.5 L/min at 02:30 AM)', 'warning');
    } else if (scenarioType === 'kitchen_burst') {
      state.simTimeHour = 12; // Daytime meal prep window
      state.simTimeMinute = 15;
      state.liveSelectedZone = 'kitchen';
      const zoneSelect = document.getElementById('live-zone-select');
      if (zoneSelect) zoneSelect.value = 'kitchen';

      // Prime the high flow excursion counter so the detection engine confirms continuous ceiling breach promptly
      state.activeExcursions.kitchen.high = createEmptyExcursion();
      const exHigh = state.activeExcursions.kitchen.high;
      exHigh.inExcursion = true;
      exHigh.consecutiveMinutes = Math.max(1, state.thresholds.highFlowDurationTrigger - 1);
      exHigh.peakRate = 66.0;
      exHigh.totalExcess = 42.0 * exHigh.consecutiveMinutes;

      showToast('Injected scenario: Sustained runaway pre-rinse hose in Kitchen (+42 L/min breaching ceiling)', 'critical');
    } else if (scenarioType === 'short_spike') {
      state.simTimeHour = 7; // Morning shower hour
      state.simTimeMinute = 40;
      state.scenarioTicksRemaining = 3; // Auto-clears after 3 samples
      state.liveSelectedZone = 'hostel_b';
      const zoneSelect = document.getElementById('live-zone-select');
      if (zoneSelect) zoneSelect.value = 'hostel_b';
      // Reset excursion so this short 3-minute burst tests the transient spike filter cleanly
      state.activeExcursions.hostel_b.high = createEmptyExcursion();
      showToast('Injected scenario: Temporary 2-min shower surge in Hostel Block B (+48 L/min, auto-clears to demonstrate spike filter)', 'info');
    }

    // Update zone title in live chart
    const chartTitle = document.getElementById('live-chart-title');
    if (chartTitle) {
      const name = state.liveSelectedZone === 'all' ? 'All Zones Aggregated' : ZONES[state.liveSelectedZone].name;
      chartTitle.textContent = `Real-Time Flow Telemetry (${name})`;
    }

    // Force immediate tick to run through the detection engine
    runSimulationTick();
  }

  function restoreNormalDemo() {
    state.activeScenario = 'none';
    state.scenarioTicksRemaining = 0;
    // Reset all zone excursions so any in-progress excursions clear
    Object.keys(state.activeExcursions).forEach(zid => {
      state.activeExcursions[zid].night = createEmptyExcursion();
      state.activeExcursions[zid].high = createEmptyExcursion();
    });
    showToast('Restored nominal baseline flow across all zones', 'info');
    runSimulationTick();
  }

  // =========================================================================
  // 9. OVERVIEW DASHBOARD RENDERING
  // =========================================================================

  function updateOverviewStats() {
    // 1. Calculate Period Totals based on diurnal baselines + active leaks
    const period = state.settings.selectedPeriod;
    let multiplier = 1.0;
    let periodDesc = 'Current 24h Telemetry';

    if (period === 'yesterday') {
      multiplier = 0.96;
      periodDesc = 'Previous Day Audited Flow';
    } else if (period === 'week') {
      multiplier = 6.85;
      periodDesc = '7-Day Cumulative Aggregate';
    }

    // Nominal 24h volume across all 4 zones
    let totalNominal24h = 0;
    Object.keys(DIURNAL_BASELINES).forEach(zone => {
      const sumHourFlow = DIURNAL_BASELINES[zone].reduce((a, b) => a + b, 0);
      totalNominal24h += sumHourFlow * 60; // litres
    });

    // 2. Calculate Unresolved Alerts & Potential Loss
    const unresolvedAlerts = state.alerts.filter(a => a.status !== 'resolved');
    const criticalCount = unresolvedAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = unresolvedAlerts.filter(a => a.severity === 'high' || a.severity === 'medium').length;

    // Sum potential loss strictly for unresolved alerts (no double counting!)
    const totalPotentialLoss = unresolvedAlerts.reduce((sum, a) => sum + (a.estimatedLoss || 0), 0);
    // Estimated consumption = baseline + estimated excess (excess only belongs to today's 24h)
    const periodTotalConsumption = Math.round(totalNominal24h * multiplier + (period === 'today' ? totalPotentialLoss : 0));
    const todayObserved = totalNominal24h + totalPotentialLoss;
    const lossPercentage = todayObserved > 0
      ? ((totalPotentialLoss / todayObserved) * 100).toFixed(1)
      : '0.0';

    // Update DOM
    const consumptionEl = document.getElementById('overview-total-consumption');
    const consumptionMeta = document.getElementById('overview-consumption-meta');
    const activeAlertsEl = document.getElementById('overview-active-alerts');
    const alertsBreakdownEl = document.getElementById('overview-alerts-breakdown');
    const lossEl = document.getElementById('overview-potential-loss');
    const lossPctEl = document.getElementById('overview-loss-percentage');

    if (consumptionEl) consumptionEl.textContent = formatVolume(periodTotalConsumption);
    if (consumptionMeta) consumptionMeta.textContent = periodDesc;
    if (activeAlertsEl) activeAlertsEl.textContent = unresolvedAlerts.length;
    if (alertsBreakdownEl) alertsBreakdownEl.textContent = `${criticalCount} Critical • ${warningCount} Warning`;
    if (lossEl) lossEl.textContent = formatVolume(totalPotentialLoss);
    if (lossPctEl) lossPctEl.textContent = `${lossPercentage}% of today's est. flow`;

    // Render Overview Alerts Queue
    renderOverviewAlertsQueue();
  }

  function renderOverviewAlertsQueue() {
    const tbody = document.getElementById('overview-alerts-tbody');
    const emptyState = document.getElementById('overview-alerts-empty');
    const totalCountEl = document.getElementById('overview-alerts-total-count');

    if (!tbody) return;

    rankAndSortAlerts();

    const unresolvedAlerts = state.alerts.filter(a => a.status !== 'resolved').slice(0, 4);

    if (totalCountEl) {
      totalCountEl.textContent = state.alerts.filter(a => a.status !== 'resolved').length;
    }

    if (unresolvedAlerts.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = unresolvedAlerts.map(alert => {
      const pClass = alert.priorityRank === 1 ? 'p-urgent' : (alert.priorityRank <= 3 ? 'p-high' : 'p-medium');
      return `
        <tr data-alert-id="${alert.id}">
          <td><span class="badge-priority ${pClass}" title="Priority Score: ${alert.priorityScore}">#${alert.priorityRank}</span></td>
          <td><span class="badge-severity ${alert.severity}">${alert.severity}</span></td>
          <td><strong>${alert.zoneName}</strong></td>
          <td>
            <div style="font-weight: 600;">${alert.ruleName}</div>
            <div style="font-size: 0.72rem; color: #64748b;">${alert.observedPattern.substring(0, 48)}...</div>
          </td>
          <td class="text-rose font-mono"><strong>${formatVolume(alert.estimatedLoss)}</strong></td>
          <td>${alert.detectedAt}</td>
          <td><span class="badge-status ${alert.status}">${alert.status}</span></td>
          <td class="text-right">
            <button class="btn btn-sm btn-outline view-alert-btn" data-alert-id="${alert.id}">Inspect</button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to rows and inspect buttons
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const alertId = row.getAttribute('data-alert-id');
        openAlertDetailModal(alertId);
      });
    });
  }

  // =========================================================================
  // 10. LIVE MONITOR DISPLAY & REAL-TIME CHART
  // =========================================================================

  function updateLiveMonitorDisplay(zoneReadings, activeZone, activeRate, activeExcess, activeExpected) {
    const currentFlowEl = document.getElementById('live-current-flow');
    const statusPill = document.getElementById('live-status-indicator');
    const statusText = document.getElementById('live-status-text');
    const excessEl = document.getElementById('live-excess-flow');
    const excessSub = document.getElementById('live-excess-sub');
    const sessionLossEl = document.getElementById('live-session-loss');
    const expectedEl = document.getElementById('live-expected-baseline');
    const fallbackFlow = document.getElementById('fallback-flow-val');

    if (currentFlowEl) {
      currentFlowEl.innerHTML = `${formatFlowRate(activeRate, false)} <span class="unit-label">${getUnitLabel()}</span>`;
    }
    if (fallbackFlow) {
      fallbackFlow.textContent = formatFlowRate(activeRate);
    }
    if (excessEl) {
      excessEl.innerHTML = `${formatFlowRate(activeExcess, false)} <span class="unit-label">${getUnitLabel()}</span>`;
    }
    if (sessionLossEl) {
      sessionLossEl.innerHTML = `${formatVolume(state.sessionCumulativeLoss, false)} <span class="unit-label">Litres</span>`;
    }
    if (expectedEl) {
      expectedEl.textContent = `Expected: ${formatFlowRate(activeExpected)}`;
    }

    // Status Indicator
    const isAlerting = activeExcess > 2.0;
    if (statusPill && statusText) {
      if (isAlerting) {
        statusPill.className = 'live-status-pill alert';
        statusText.textContent = 'Anomaly Detected';
        if (excessSub) excessSub.textContent = `+${formatFlowRate(activeExcess)} above baseline!`;
      } else {
        statusPill.className = 'live-status-pill normal';
        statusText.textContent = 'Normal Operation';
        if (excessSub) excessSub.textContent = 'Within expected baseline tolerance';
      }
    }

    // Update Zone Profile Cards
    Object.keys(ZONES).forEach(zId => {
      const flowCard = document.getElementById(`card-flow-${zId}`);
      const badgeCard = document.getElementById(`zone-badge-${zId}`);
      if (flowCard && zoneReadings[zId]) {
        flowCard.textContent = formatFlowRate(zoneReadings[zId].rate);
      }
      if (badgeCard && zoneReadings[zId]) {
        if (zoneReadings[zId].excessRate > 2.0) {
          badgeCard.className = 'badge badge-severity critical';
          badgeCard.textContent = 'Excess Flow';
        } else {
          badgeCard.className = 'badge badge-status resolved';
          badgeCard.textContent = 'Nominal';
        }
      }
    });
  }

  // =========================================================================
  // 11. ALERTS & INVESTIGATIONS VIEW
  // =========================================================================

  function initAlertsView() {
    // Search input
    const searchInput = document.getElementById('alert-search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase().trim();
        if (clearSearchBtn) {
          clearSearchBtn.classList.toggle('hidden', state.filters.search === '');
        }
        renderAlertsTable();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.filters.search = '';
        clearSearchBtn.classList.add('hidden');
        renderAlertsTable();
      });
    }

    // Severity Filter
    const severitySelect = document.getElementById('filter-severity');
    if (severitySelect) {
      severitySelect.addEventListener('change', (e) => {
        state.filters.severity = e.target.value;
        renderAlertsTable();
      });
    }

    // Zone Filter
    const zoneSelect = document.getElementById('filter-zone');
    if (zoneSelect) {
      zoneSelect.addEventListener('change', (e) => {
        state.filters.zone = e.target.value;
        renderAlertsTable();
      });
    }

    // Status Filter
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        renderAlertsTable();
      });
    }

    // Reset Filters button
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const emptyResetBtn = document.getElementById('alerts-empty-reset-btn');

    function resetFilters() {
      state.filters = { search: '', severity: 'all', zone: 'all', status: 'all' };
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
      if (severitySelect) severitySelect.value = 'all';
      if (zoneSelect) zoneSelect.value = 'all';
      if (statusSelect) statusSelect.value = 'all';
      renderAlertsTable();
    }

    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
    if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetFilters);
  }

  function renderAlertsTable() {
    const tbody = document.getElementById('alerts-table-tbody');
    const emptyState = document.getElementById('alerts-filter-empty');
    const summaryText = document.getElementById('filter-summary-text');

    if (!tbody) return;

    rankAndSortAlerts();

    // Filter alerts based on active filters
    const filtered = state.alerts.filter(alert => {
      // Search text match
      if (state.filters.search) {
        const query = state.filters.search;
        const text = `${alert.id} ${alert.zoneName} ${alert.ruleName} ${alert.observedPattern} ${alert.reason} ${alert.status} ${alert.severity}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      // Severity match
      if (state.filters.severity !== 'all' && alert.severity !== state.filters.severity) {
        return false;
      }

      // Zone match (matches name or id)
      if (state.filters.zone !== 'all' && alert.zoneName !== state.filters.zone && alert.zoneId !== state.filters.zone) {
        return false;
      }

      // Status match
      if (state.filters.status === 'unresolved') {
        if (alert.status === 'resolved') return false;
      } else if (state.filters.status !== 'all' && alert.status !== state.filters.status) {
        return false;
      }

      return true;
    });

    if (summaryText) {
      summaryText.textContent = `Showing ${filtered.length} of ${state.alerts.length} alerts (Sorted by Priority)`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
        const h4 = emptyState.querySelector('h4');
        const p = emptyState.querySelector('p');
        if (state.alerts.length === 0) {
          if (h4) h4.textContent = 'No Alerts Recorded';
          if (p) p.textContent = 'All clear! Use "Inject Test Incident" above or in Live Monitor to generate simulated anomalies.';
        } else {
          if (h4) h4.textContent = 'No Matching Alerts Found';
          if (p) p.textContent = 'No incidents match your current filter criteria. Click "Reset Filter Options" to clear filters.';
        }
      }
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = filtered.map(alert => {
      const pClass = alert.status === 'resolved' ? 'p-resolved' : (alert.priorityRank === 1 ? 'p-urgent' : (alert.priorityRank <= 3 ? 'p-high' : 'p-medium'));
      const obsRate = alert.observedValues ? alert.observedValues.currentFlow : (alert.excessRate + 1.2);
      return `
        <tr data-alert-id="${alert.id}">
          <td><span class="badge-priority ${pClass}" title="Priority Score: ${alert.priorityScore}">#${alert.priorityRank}</span></td>
          <td><strong>${alert.id}</strong></td>
          <td><span class="badge-severity ${alert.severity}">${alert.severity}</span></td>
          <td>${alert.zoneName}</td>
          <td><strong>${alert.ruleName}</strong></td>
          <td>
            <div class="observed-metric-cell">
              <span class="observed-rate-text">${formatFlowRate(obsRate)}</span>
              <span class="observed-sub-text">+${formatFlowRate(alert.excessRate)} delta</span>
            </div>
          </td>
          <td class="text-rose font-mono"><strong>${formatVolume(alert.estimatedLoss)}</strong></td>
          <td>${alert.detectedAt}</td>
          <td><span class="badge-status ${alert.status}">${alert.status}</span></td>
          <td class="text-right">
            <button class="btn btn-sm btn-outline view-alert-action-btn" data-alert-id="${alert.id}">Inspect</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const alertId = row.getAttribute('data-alert-id');
        openAlertDetailModal(alertId);
      });
    });
  }

  // =========================================================================
  // 12. ALERT DETAIL & INVESTIGATION MODAL WORKFLOW
  // =========================================================================

  let activeModalAlertId = null;

  function initAlertModal() {
    const modal = document.getElementById('alert-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const footerCloseBtn = document.getElementById('modal-footer-close');

    function closeModal() {
      if (modal) modal.close();
      activeModalAlertId = null;
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeModal);

    // Close on backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          closeModal();
        }
      });
    }

    // Workflow transition buttons
    const btnAck = document.getElementById('modal-btn-ack');
    const btnInvestigate = document.getElementById('modal-btn-investigate');
    const btnResolve = document.getElementById('modal-btn-resolve');
    const btnReopen = document.getElementById('modal-btn-reopen');
    const btnSaveNotes = document.getElementById('modal-save-notes-btn');

    if (btnAck) {
      btnAck.addEventListener('click', () => updateActiveAlertStatus('acknowledged'));
    }
    if (btnInvestigate) {
      btnInvestigate.addEventListener('click', () => updateActiveAlertStatus('investigating'));
    }
    if (btnResolve) {
      btnResolve.addEventListener('click', () => updateActiveAlertStatus('resolved'));
    }
    if (btnReopen) {
      btnReopen.addEventListener('click', () => updateActiveAlertStatus('investigating'));
    }

    if (btnSaveNotes) {
      btnSaveNotes.addEventListener('click', () => {
        const notesInput = document.getElementById('modal-notes-input');
        if (!activeModalAlertId || !notesInput) return;
        const alert = state.alerts.find(a => a.id === activeModalAlertId);
        if (alert) {
          alert.notes = notesInput.value.trim();
          saveAlerts();
          showToast(`Saved inspection notes for ${alert.id}`, 'info');
        }
      });
    }
  }

  function openAlertDetailModal(alertId) {
    const alert = state.alerts.find(a => a.id === alertId);
    if (!alert) return;

    activeModalAlertId = alert.id;
    const modal = document.getElementById('alert-modal');

    // Populate modal fields
    document.getElementById('modal-alert-id').textContent = `Alert ${alert.id}`;
    document.getElementById('modal-zone-tag').textContent = alert.zoneName;
    
    const severityBadge = document.getElementById('modal-severity-badge');
    if (severityBadge) {
      severityBadge.className = `badge badge-severity ${alert.severity}`;
      severityBadge.textContent = alert.severity.toUpperCase();
    }

    const priorityBadge = document.getElementById('modal-priority-badge');
    if (priorityBadge) {
      const pClass = alert.status === 'resolved' ? 'p-resolved' : (alert.priorityRank === 1 ? 'p-urgent' : (alert.priorityRank <= 3 ? 'p-high' : 'p-medium'));
      priorityBadge.className = `badge-priority ${pClass}`;
      priorityBadge.textContent = `#${alert.priorityRank} Priority`;
    }

    const priorityExplanation = document.getElementById('modal-priority-explanation');
    if (priorityExplanation) {
      const statusScore = (alert.status === 'new' || alert.status === 'investigating') ? 10000 : (alert.status === 'acknowledged' ? 6000 : 0);
      priorityExplanation.textContent = `Ranked #${alert.priorityRank} with Priority Score ${alert.priorityScore.toLocaleString()} pts. Formula: Status [${statusScore}] + Severity [${alert.severity.toUpperCase()}] + Excess Volume [${formatVolume(alert.estimatedLoss)}] + Duration [${alert.durationMinutes}m].`;
    }

    // Observed values breakdown
    const obsCurrent = document.getElementById('modal-obs-current');
    const obsBaseline = document.getElementById('modal-obs-baseline');
    const obsExcess = document.getElementById('modal-obs-excess');
    
    if (obsCurrent) {
      const val = alert.observedValues ? alert.observedValues.currentFlow : (alert.excessRate + 1.2);
      obsCurrent.textContent = formatFlowRate(val);
    }
    if (obsBaseline) {
      const val = alert.observedValues ? alert.observedValues.baseline : (ZONES[alert.zoneId] ? ZONES[alert.zoneId].nominalNightBaseline : 1.0);
      obsBaseline.textContent = formatFlowRate(val);
    }
    if (obsExcess) {
      obsExcess.textContent = `+${formatFlowRate(alert.excessRate)}`;
    }

    document.getElementById('modal-observed-pattern').textContent = alert.observedPattern;
    document.getElementById('modal-detection-reason').textContent = alert.reason;
    document.getElementById('modal-detection-type').textContent = alert.ruleName;
    document.getElementById('modal-time-detected').textContent = `${alert.detectedAt} (${alert.detectedDate})`;
    document.getElementById('modal-duration').textContent = `${alert.durationMinutes} minutes`;
    document.getElementById('modal-est-loss').textContent = `${formatVolume(alert.estimatedLoss)} (est.) \u2248 ${Number(alert.excessRate || 0).toFixed(1)} L/min \u00D7 ${alert.durationMinutes || 0} min`;
    document.getElementById('modal-suggested-action').textContent = alert.suggestedAction;
    document.getElementById('modal-current-status').textContent = alert.status.toUpperCase();
    
    const notesInput = document.getElementById('modal-notes-input');
    if (notesInput) {
      notesInput.value = alert.notes || '';
    }

    // Update button states depending on current status
    const btnAck = document.getElementById('modal-btn-ack');
    const btnInvestigate = document.getElementById('modal-btn-investigate');
    const btnResolve = document.getElementById('modal-btn-resolve');
    const btnReopen = document.getElementById('modal-btn-reopen');

    if (btnAck) btnAck.disabled = alert.status !== 'new';
    if (btnInvestigate) btnInvestigate.disabled = alert.status === 'investigating';
    if (btnResolve) btnResolve.disabled = alert.status === 'resolved';
    if (btnReopen) btnReopen.disabled = alert.status !== 'resolved';

    if (modal) {
      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
    }
  }

  function updateActiveAlertStatus(newStatus) {
    if (!activeModalAlertId) return;
    const alert = state.alerts.find(a => a.id === activeModalAlertId);
    if (!alert) return;

    alert.status = newStatus;
    if (newStatus === 'resolved') {
      alert.active = false;
      alert.resolvedAt = formatSimTime(state.simTimeHour, state.simTimeMinute);
    } else {
      alert.active = true;
      delete alert.resolvedAt;
    }

    rankAndSortAlerts();
    saveAlerts();
    renderAlertsTable();
    updateOverviewStats();
    if (state.currentView === 'insights') {
      renderInsightsView();
    }
    openAlertDetailModal(alert.id); // refresh modal state
    showToast(`Updated ${alert.id} status to: ${newStatus.toUpperCase()}`, 'info');
  }

  function updateSidebarAlertCounter() {
    const counter = document.getElementById('nav-alert-counter');
    if (!counter) return;

    const unresolved = state.alerts.filter(a => a.status !== 'resolved').length;
    counter.textContent = unresolved;
    counter.classList.toggle('zero', unresolved === 0);
  }

  // =========================================================================
  // 13. WATER INSIGHTS VIEW CALCULATIONS & AUDIT
  // =========================================================================

  function renderInsightsView() {
    // 1. Calculate Period Totals and verified losses
    let totalWaterMetered = 0;
    const zoneLossMap = {};

    Object.keys(DIURNAL_BASELINES).forEach(zoneId => {
      const dailySum = DIURNAL_BASELINES[zoneId].reduce((a, b) => a + b, 0) * 60;
      totalWaterMetered += dailySum;
      zoneLossMap[zoneId] = 0;
    });

    state.alerts.forEach(alert => {
      if (zoneLossMap[alert.zoneId] !== undefined) {
        zoneLossMap[alert.zoneId] += (alert.estimatedLoss || 0);
      }
    });

    const totalAvoidableLoss = Object.values(zoneLossMap).reduce((a, b) => a + b, 0);
    const totalObserved = totalWaterMetered + totalAvoidableLoss; // baseline + estimated excess
    const lossPercentage = totalObserved > 0 ? ((totalAvoidableLoss / totalObserved) * 100).toFixed(1) : '0.0';

    // Update Insight stat cards
    const totalWaterEl = document.getElementById('insights-total-water');
    const totalLossEl = document.getElementById('insights-total-loss');
    const lossPctEl = document.getElementById('insights-loss-pct');
    const financialLossEl = document.getElementById('insights-financial-loss');
    const incidentCountEl = document.getElementById('insights-incident-count');
    const resolvedRatioEl = document.getElementById('insights-resolved-ratio');

    if (totalWaterEl) totalWaterEl.textContent = formatVolume(totalObserved);
    if (totalLossEl) totalLossEl.textContent = formatVolume(totalAvoidableLoss);
    if (lossPctEl) lossPctEl.textContent = `${lossPercentage}% of est. consumption`;
    if (financialLossEl) financialLossEl.textContent = `≈ ${formatCurrency(totalAvoidableLoss)}`;
    const costMetaEl = document.getElementById('insights-cost-rate-meta');
    if (costMetaEl) costMetaEl.textContent = `Estimate at \u20B9${Number(state.settings.tariffRate || DEFAULT_SETTINGS.tariffRate).toFixed(2)}/kL • simulated data`;
    
    const resolvedCount = state.alerts.filter(a => a.status === 'resolved').length;
    if (incidentCountEl) incidentCountEl.textContent = `${state.alerts.length} Events`;
    if (resolvedRatioEl) resolvedRatioEl.textContent = `${resolvedCount} resolved / ${state.alerts.length} logged`;

    // Dynamic Natural Language Insight Cards
    // Find zone with highest loss
    let worstZoneId = 'hostel_a';
    let maxLoss = -1;
    Object.keys(zoneLossMap).forEach(zid => {
      if (zoneLossMap[zid] > maxLoss) {
        maxLoss = zoneLossMap[zid];
        worstZoneId = zid;
      }
    });

    const primaryTitle = document.getElementById('insight-primary-title');
    const primaryDesc = document.getElementById('insight-primary-desc');
    const lossHighlight = document.getElementById('insight-loss-highlight');

    if (primaryTitle && primaryDesc && lossHighlight) {
      const worstName = ZONES[worstZoneId].name;
      primaryTitle.textContent = `Top leak: ${worstName}`;
      primaryDesc.textContent = `${((maxLoss / Math.max(1, totalAvoidableLoss)) * 100).toFixed(0)}% of all detected waste, mostly overnight. Check flapper seals and risers first.`;
      lossHighlight.textContent = `Est. Loss: ${formatVolume(maxLoss)}`;
    }

    // Populate Zone Audit Table
    const tbody = document.getElementById('insights-zone-tbody');
    if (tbody) {
      tbody.innerHTML = Object.keys(ZONES).map(zid => {
        const zone = ZONES[zid];
        const nominalDay = DIURNAL_BASELINES[zid].reduce((a, b) => a + b, 0) * 60;
        const loss = zoneLossMap[zid] || 0;
        const ratio = ((loss / (nominalDay + loss)) * 100).toFixed(1);
        const peak = Math.max(...DIURNAL_BASELINES[zid]);
        const health = ratio > 15 ? '<span class="badge-severity critical">High Waste</span>' : (ratio > 5 ? '<span class="badge-severity high">Needs Service</span>' : '<span class="badge-status resolved">Healthy</span>');

        return `
          <tr>
            <td><strong>${zone.name}</strong><br><span style="font-size: 0.72rem; color: #64748b;">${zone.type}</span></td>
            <td>${formatVolume(nominalDay + loss)}</td>
            <td class="text-rose font-mono"><strong>${formatVolume(loss)}</strong></td>
            <td><strong>${ratio}%</strong></td>
            <td>${zone.nominalNightBaseline} L/min</td>
            <td>${formatFlowRate(peak)}</td>
            <td>${health}</td>
          </tr>
        `;
      }).join('');
    }

    // Update Insights Charts if available
    updateInsightsCharts(zoneLossMap);
  }

  // =========================================================================
  // 14. SETTINGS & THRESHOLD CONTROLS
  // =========================================================================

  function initSettingsView() {
    // Threshold Form
    const nightThresholdInput = document.getElementById('setting-night-threshold');
    const nightDurationInput = document.getElementById('setting-night-duration');
    const ceilingThresholdInput = document.getElementById('setting-ceiling-threshold');
    const ceilingDurationInput = document.getElementById('setting-ceiling-duration');
    const nightStartInput = document.getElementById('setting-night-start');
    const nightEndInput = document.getElementById('setting-night-end');

    const dispNightThreshold = document.getElementById('display-night-threshold');
    const dispNightDuration = document.getElementById('display-night-duration');
    const dispCeilingThreshold = document.getElementById('display-ceiling-threshold');
    const dispCeilingDuration = document.getElementById('display-ceiling-duration');

    // Populate initial inputs
    if (nightThresholdInput) {
      nightThresholdInput.value = state.thresholds.nightBaselineThreshold;
      if (dispNightThreshold) dispNightThreshold.textContent = `${state.thresholds.nightBaselineThreshold} L/min`;
      nightThresholdInput.addEventListener('input', (e) => {
        if (dispNightThreshold) dispNightThreshold.textContent = `${e.target.value} L/min`;
      });
    }

    if (nightDurationInput) {
      nightDurationInput.value = state.thresholds.nightDurationTrigger;
      if (dispNightDuration) dispNightDuration.textContent = `${state.thresholds.nightDurationTrigger} mins`;
      nightDurationInput.addEventListener('input', (e) => {
        if (dispNightDuration) dispNightDuration.textContent = `${e.target.value} mins`;
      });
    }

    if (ceilingThresholdInput) {
      ceilingThresholdInput.value = state.thresholds.highFlowCeiling;
      if (dispCeilingThreshold) dispCeilingThreshold.textContent = `${state.thresholds.highFlowCeiling} L/min`;
      ceilingThresholdInput.addEventListener('input', (e) => {
        if (dispCeilingThreshold) dispCeilingThreshold.textContent = `${e.target.value} L/min`;
      });
    }

    if (ceilingDurationInput) {
      ceilingDurationInput.value = state.thresholds.highFlowDurationTrigger || 20;
      if (dispCeilingDuration) dispCeilingDuration.textContent = `${ceilingDurationInput.value} mins`;
      ceilingDurationInput.addEventListener('input', (e) => {
        if (dispCeilingDuration) dispCeilingDuration.textContent = `${e.target.value} mins`;
      });
    }

    if (nightStartInput) nightStartInput.value = state.thresholds.nightStart;
    if (nightEndInput) nightEndInput.value = state.thresholds.nightEnd;

    // Thresholds Save Button
    const thresholdForm = document.getElementById('settings-thresholds-form');
    if (thresholdForm) {
      thresholdForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nightThresh = Number(nightThresholdInput.value);
        const nightDur = Number(nightDurationInput.value);
        const ceilingThresh = Number(ceilingThresholdInput.value);
        const ceilingDur = ceilingDurationInput ? Number(ceilingDurationInput.value) : 20;

        if (isNaN(nightThresh) || nightThresh <= 0) {
          showToast('Validation Error: Nighttime baseline threshold must be > 0 L/min', 'critical');
          return;
        }
        if (isNaN(nightDur) || nightDur < 1) {
          showToast('Validation Error: Nighttime duration trigger must be at least 1 minute', 'critical');
          return;
        }
        if (isNaN(ceilingThresh) || ceilingThresh <= nightThresh) {
          showToast('Validation Error: High-flow runaway ceiling must exceed nighttime baseline threshold', 'critical');
          return;
        }
        if (!nightStartInput.value || !nightEndInput.value) {
          showToast('Validation Error: Night window start and end times are required', 'critical');
          return;
        }
        if (isNaN(ceilingDur) || ceilingDur < 1) {
          showToast('Validation Error: High-flow duration trigger must be at least 1 minute', 'critical');
          return;
        }

        state.thresholds.nightBaselineThreshold = nightThresh;
        state.thresholds.nightDurationTrigger = nightDur;
        state.thresholds.highFlowCeiling = ceilingThresh;
        state.thresholds.highFlowDurationTrigger = ceilingDur;
        state.thresholds.nightStart = nightStartInput.value;
        state.thresholds.nightEnd = nightEndInput.value;

        saveThresholds();
        runSimulationTick(); // Immediately re-evaluate active telemetry with new thresholds
        showToast('Detection thresholds updated & active telemetry re-evaluated', 'info');
      });
    }

    // Reset Thresholds to Defaults
    const defaultThresholdsBtn = document.getElementById('default-thresholds-btn');
    if (defaultThresholdsBtn) {
      defaultThresholdsBtn.addEventListener('click', () => {
        state.thresholds = Object.assign({}, DEFAULT_THRESHOLDS);
        saveThresholds();
        if (nightThresholdInput) nightThresholdInput.value = state.thresholds.nightBaselineThreshold;
        if (nightDurationInput) nightDurationInput.value = state.thresholds.nightDurationTrigger;
        if (ceilingThresholdInput) ceilingThresholdInput.value = state.thresholds.highFlowCeiling;
        if (ceilingDurationInput) ceilingDurationInput.value = state.thresholds.highFlowDurationTrigger;
        if (dispNightThreshold) dispNightThreshold.textContent = `${state.thresholds.nightBaselineThreshold} L/min`;
        if (dispNightDuration) dispNightDuration.textContent = `${state.thresholds.nightDurationTrigger} mins`;
        if (dispCeilingThreshold) dispCeilingThreshold.textContent = `${state.thresholds.highFlowCeiling} L/min`;
        if (dispCeilingDuration) dispCeilingDuration.textContent = `${state.thresholds.highFlowDurationTrigger} mins`;
        runSimulationTick();
        showToast('Restored default heuristic detection thresholds', 'info');
      });
    }

    // Units & Tariff Form
    const unitSelect = document.getElementById('setting-unit-select');
    const tariffInput = document.getElementById('setting-tariff-rate');
    const simSpeedSelect = document.getElementById('setting-sim-speed');
    const unitsForm = document.getElementById('settings-units-form');

    if (unitSelect) unitSelect.value = state.settings.unit;
    if (tariffInput) tariffInput.value = state.settings.tariffRate;
    if (simSpeedSelect) simSpeedSelect.value = state.settings.simSpeed;

    if (unitsForm) {
      unitsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tariff = Number(tariffInput.value);
        if (isNaN(tariff) || tariff <= 0) {
          showToast('Validation Error: Water tariff rate must be a positive number', 'critical');
          return;
        }

        state.settings.unit = unitSelect.value;
        state.settings.tariffRate = tariff;
        state.settings.simSpeed = Number(simSpeedSelect.value);

        saveSettings();
        if (state.isSimulating) {
          startSimulationTimer(); // restart timer with new interval only if currently simulating
        }
        
        const speedLabel = document.getElementById('live-speed-display');
        if (speedLabel) speedLabel.textContent = `${(state.settings.simSpeed / 1000).toFixed(1)}s Ticks`;

        updateOverviewStats();
        renderAlertsTable();
        if (state.charts.liveFlow) updateLiveChart();
        if (state.charts.overviewFlow) updateOverviewFlowChart();
        showToast('Display units & tariff settings saved', 'info');
      });
    }

    // Reset Demo Data Button
    const resetDemoBtn = document.getElementById('btn-reset-demo-data');
    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', () => {
        showConfirmDialog(
          'Reset Demonstration Data',
          'This will restore default deterministic baseline readings and re-seed the sample alert queue. Proceed?',
          () => {
            state.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
            state.activeScenario = 'night_leak';
            state.sessionCumulativeLoss = 0.0;
            state.simTimeHour = 2;
            state.simTimeMinute = 45;
            // Reset excursions
            Object.keys(state.activeExcursions).forEach(zid => {
              state.activeExcursions[zid].night = createEmptyExcursion();
              state.activeExcursions[zid].high = createEmptyExcursion();
            });
            // Re-seed sliding buffer
            state.liveTelemetryBuffer = [];
            for (let m = 0; m < 15; m++) {
              const packet = generateZoneFlowPacket('hostel_a', 2, 30 + m);
              state.liveTelemetryBuffer.push({
                time: formatSimTime(2, 30 + m),
                rate: packet.rate,
                excess: packet.excessRate,
                expected: packet.expectedBaseline
              });
            }
            rankAndSortAlerts();
            saveAlerts();
            if (window.HydroAPI) HydroAPI.resetAlerts(state.alerts);
            renderAlertsTable();
            updateOverviewStats();
            if (state.currentView === 'insights') {
              renderInsightsView();
            }
            runSimulationTick();
            showToast('Demo data reset to factory baseline', 'info');
          }
        );
      });
    }

    // Clear Local Storage Button
    const clearStorageBtn = document.getElementById('btn-clear-local-storage');
    if (clearStorageBtn) {
      clearStorageBtn.addEventListener('click', () => {
        showConfirmDialog(
          'Clear Browser Storage Cache',
          'This will permanently delete all custom thresholds, saved preferences, and investigation notes from localStorage. Proceed?',
          () => {
            localStorage.removeItem(STORAGE_KEYS.ALERTS);
            localStorage.removeItem(STORAGE_KEYS.THRESHOLDS);
            localStorage.removeItem(STORAGE_KEYS.SETTINGS);
            state.thresholds = Object.assign({}, DEFAULT_THRESHOLDS);
            state.settings = Object.assign({}, DEFAULT_SETTINGS);
            state.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
            rankAndSortAlerts();
            saveAlerts();
            saveThresholds();
            saveSettings();
            location.reload();
          }
        );
      });
    }
  }

  // Confirmation Dialog Helper
  function showConfirmDialog(title, message, onConfirm) {
    const dialog = document.getElementById('confirm-dialog');
    const titleEl = document.getElementById('confirm-dialog-title');
    const msgEl = document.getElementById('confirm-dialog-message');
    const confirmBtn = document.getElementById('confirm-dialog-confirm');
    const cancelBtn = document.getElementById('confirm-dialog-cancel');
    const closeBtn = document.getElementById('confirm-dialog-close');

    if (!dialog) return;

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    function cleanup() {
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      dialog.oncancel = null;
      if (dialog.open) {
        dialog.close();
      }
    }

    confirmBtn.onclick = () => {
      cleanup();
      if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = cleanup;
    closeBtn.onclick = cleanup;
    dialog.oncancel = cleanup;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // Toast Notification Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'warning' ? 'toast-warning' : (type === 'critical' ? 'toast-critical' : '')}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // =========================================================================
  // 15. CHART.JS INITIALIZATION & RENDERING
  // =========================================================================

  function initCharts() {
    if (typeof window.Chart === 'undefined') {
      console.warn('[HydroSense] Chart.js CDN unavailable. Falling back to metric tables.');
      state.chartJsAvailable = false;
      const banner = document.getElementById('chart-fallback-banner');
      if (banner) banner.classList.remove('hidden');

      // Unhide fallbacks
      document.querySelectorAll('.chart-fallback').forEach(el => el.classList.remove('hidden'));
      return;
    }

    state.chartJsAvailable = true;

    // Common Chart Defaults
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#475569';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0a1128';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.elements.line.borderWidth = 2.5;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.point.hoverRadius = 4;
    Chart.defaults.borderColor = '#e8edf4';

    initOverviewCharts();
    initLiveChart();
  }

  function initOverviewCharts() {
    // 1. Multi-zone 24h Flow Trajectory Chart
    const flowCanvas = document.getElementById('overviewFlowChart');
    if (flowCanvas) {
      const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

      state.charts.overviewFlow = new Chart(flowCanvas, {
        type: 'line',
        data: {
          labels: hours,
          datasets: [
            {
              label: 'Hostel Block A',
              data: DIURNAL_BASELINES.hostel_a,
              borderColor: ZONES.hostel_a.color,
              backgroundColor: ZONES.hostel_a.bgColor,
              tension: 0.35,
              fill: false,
              borderWidth: 2
            },
            {
              label: 'Hostel Block B',
              data: DIURNAL_BASELINES.hostel_b,
              borderColor: ZONES.hostel_b.color,
              tension: 0.35,
              fill: false,
              borderWidth: 2
            },
            {
              label: 'Hostel Kitchen',
              data: DIURNAL_BASELINES.kitchen,
              borderColor: ZONES.kitchen.color,
              tension: 0.35,
              fill: false,
              borderWidth: 2
            },
            {
              label: 'Common Washrooms',
              data: DIURNAL_BASELINES.washrooms,
              borderColor: ZONES.washrooms.color,
              tension: 0.35,
              fill: false,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 12,
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatFlowRate(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Flow Rate (L/min)',
                font: { size: 11 }
              }
            }
          }
        }
      });
    }

    // 2. Zone Consumption Breakdown (Donut)
    const breakdownCanvas = document.getElementById('overviewBreakdownChart');
    if (breakdownCanvas) {
      const zoneVolumes = Object.keys(DIURNAL_BASELINES).map(zid => 
        DIURNAL_BASELINES[zid].reduce((a, b) => a + b, 0) * 60
      );

      state.charts.overviewBreakdown = new Chart(breakdownCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Block A', 'Block B', 'Kitchen', 'Washrooms'],
          datasets: [{
            data: zoneVolumes,
            backgroundColor: [
              ZONES.hostel_a.color,
              ZONES.hostel_b.color,
              ZONES.kitchen.color,
              ZONES.washrooms.color
            ],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: { size: 11 }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${formatVolume(ctx.parsed)}`
              }
            }
          },
          cutout: '68%'
        }
      });
    }
  }

  function updateOverviewCharts() {
    if (!state.charts.overviewBreakdown) return;
    const mult = state.settings.selectedPeriod === 'week' ? 7 : (state.settings.selectedPeriod === 'yesterday' ? 0.95 : 1);
    
    state.charts.overviewBreakdown.data.datasets[0].data = Object.keys(DIURNAL_BASELINES).map(zid => 
      Math.round(DIURNAL_BASELINES[zid].reduce((a, b) => a + b, 0) * 60 * mult)
    );
    state.charts.overviewBreakdown.update('none');
  }

  function updateOverviewFlowChart() {
    if (!state.charts.overviewFlow) return;
    state.charts.overviewFlow.options.scales.y.title.text = `Flow Rate (${getUnitLabel()})`;
    const mult = state.settings.unit === 'm3h' ? 0.06 : (state.settings.unit === 'gpm' ? 0.264172 : 1);
    const zoneKeys = ['hostel_a', 'hostel_b', 'kitchen', 'washrooms'];
    state.charts.overviewFlow.data.datasets.forEach((ds, idx) => {
      const zid = zoneKeys[idx];
      if (zid && DIURNAL_BASELINES[zid]) {
        ds.data = DIURNAL_BASELINES[zid].map(val => Number((val * mult).toFixed(2)));
      }
    });
    state.charts.overviewFlow.update();
  }

  function initLiveChart() {
    const liveCanvas = document.getElementById('liveFlowChart');
    if (!liveCanvas) return;

    state.charts.liveFlow = new Chart(liveCanvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Observed Telemetry',
            data: [],
            borderColor: '#0d9488',
            backgroundColor: 'rgba(20, 184, 166, 0.14)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 2.5,
            pointBackgroundColor: '#0d9488'
          },
          {
            label: 'Expected Baseline',
            data: [],
            borderColor: '#94a3b8',
            borderDash: [4, 4],
            fill: false,
            tension: 0.2,
            borderWidth: 1.5,
            pointRadius: 0
          },
          {
            label: 'Anomaly Trigger Ceiling',
            data: [],
            borderColor: '#ef4444',
            borderDash: [6, 4],
            fill: false,
            borderWidth: 1.5,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // disabled for smooth 2.5s streaming updates
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: `Rate (${getUnitLabel()})`,
              font: { size: 11 }
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  function updateLiveChart() {
    if (!state.charts.liveFlow || state.liveTelemetryBuffer.length === 0) return;

    const mult = state.settings.unit === 'm3h' ? 0.06 : (state.settings.unit === 'gpm' ? 0.264172 : 1);
    const labels = state.liveTelemetryBuffer.map(b => b.time);
    const rates = state.liveTelemetryBuffer.map(b => Number((b.rate * mult).toFixed(2)));
    const expected = state.liveTelemetryBuffer.map(b => Number((b.expected * mult).toFixed(2)));
    
    // Dynamic ceiling line for visual context: adapts to current active zone & time
    const isNight = isTimeInNightWindow(state.simTimeHour, state.simTimeMinute);
    let rawCeiling = isNight 
      ? state.thresholds.nightBaselineThreshold 
      : state.thresholds.highFlowCeiling;
      
    if (state.liveSelectedZone === 'all') {
      rawCeiling = isNight ? rawCeiling * 3.5 : rawCeiling * 2.2;
    }

    const ceilingVal = Number((rawCeiling * mult).toFixed(2));
    const ceilingArray = state.liveTelemetryBuffer.map(() => ceilingVal);

    if (state.charts.liveFlow.options.scales && state.charts.liveFlow.options.scales.y) {
      state.charts.liveFlow.options.scales.y.title.text = `Rate (${getUnitLabel()})`;
    }
    state.charts.liveFlow.data.labels = labels;
    state.charts.liveFlow.data.datasets[0].data = rates;
    state.charts.liveFlow.data.datasets[1].data = expected;
    state.charts.liveFlow.data.datasets[2].data = ceilingArray;

    state.charts.liveFlow.update('none');
  }

  function updateInsightsCharts(zoneLossMap) {
    if (!state.chartJsAvailable) return;

    const mult = state.settings.unit === 'm3h' ? 0.06 : (state.settings.unit === 'gpm' ? 0.264172 : 1);
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const nominalAgg = hours.map((_, h) => 
      Object.keys(DIURNAL_BASELINES).reduce((sum, z) => sum + DIURNAL_BASELINES[z][h], 0)
    );
    const nightLeaks = state.alerts.filter(a => a.ruleId === 'rule_night_flow' && a.status !== 'resolved');
    const leakDelta = nightLeaks.reduce((sum, a) => sum + (a.excessRate || 0), 0);
    const observedAgg = nominalAgg.map((v, h) => (h >= 1 && h <= 5) ? v + leakDelta : v);

    // 1. Trajectory comparison chart
    const trajCanvas = document.getElementById('insightsTrajectoryChart');
    if (trajCanvas && !state.charts.insightsTrajectory) {
      state.charts.insightsTrajectory = new Chart(trajCanvas, {
        type: 'line',
        data: {
          labels: hours,
          datasets: [
            {
              label: 'Observed Telemetry (With Leaks)',
              data: observedAgg.map(v => Number((v * mult).toFixed(2))),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              fill: '+1',
              tension: 0.35,
              borderWidth: 2
            },
            {
              label: 'Target Baseline (Zero Waste)',
              data: nominalAgg.map(v => Number((v * mult).toFixed(2))),
              borderColor: '#10b981',
              borderDash: [5, 5],
              fill: false,
              tension: 0.35,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatFlowRate(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: `Combined Flow (${getUnitLabel()})` }
            }
          }
        }
      });
    } else if (state.charts.insightsTrajectory) {
      state.charts.insightsTrajectory.data.datasets[0].data = observedAgg.map(v => Number((v * mult).toFixed(2)));
      state.charts.insightsTrajectory.data.datasets[1].data = nominalAgg.map(v => Number((v * mult).toFixed(2)));
      if (state.charts.insightsTrajectory.options.scales && state.charts.insightsTrajectory.options.scales.y) {
        state.charts.insightsTrajectory.options.scales.y.title.text = `Combined Flow (${getUnitLabel()})`;
      }
      state.charts.insightsTrajectory.update();
    }

    // 2. Water Loss Bar Chart
    const lossCanvas = document.getElementById('insightsLossBarChart');
    if (lossCanvas && !state.charts.insightsLossBar) {
      state.charts.insightsLossBar = new Chart(lossCanvas, {
        type: 'bar',
        data: {
          labels: ['Hostel Block A', 'Hostel Block B', 'Kitchen', 'Washrooms'],
          datasets: [{
            label: 'Estimated Loss (Litres)',
            data: [
              zoneLossMap.hostel_a || 0,
              zoneLossMap.hostel_b || 0,
              zoneLossMap.kitchen || 0,
              zoneLossMap.washrooms || 0
            ],
            backgroundColor: [
              'rgba(15, 118, 110, 0.9)',
              'rgba(30, 58, 138, 0.9)',
              'rgba(45, 212, 191, 0.9)',
              'rgba(14, 165, 233, 0.9)'
            ],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Est. Loss: ${formatVolume(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Litres Wasted' }
            }
          }
        }
      });
    } else if (state.charts.insightsLossBar) {
      state.charts.insightsLossBar.data.datasets[0].data = [
        zoneLossMap.hostel_a || 0,
        zoneLossMap.hostel_b || 0,
        zoneLossMap.kitchen || 0,
        zoneLossMap.washrooms || 0
      ];
      state.charts.insightsLossBar.update();
    }
  }

  // =========================================================================
  // 16. INITIALIZATION SEQUENCE
  // =========================================================================

  function initApp() {
    loadPersistedData();
    initNavigation();
    initSimulationControls();
    initAlertsView();
    initAlertModal();
    initSettingsView();
    
    // Seed initial sliding buffer for live chart
    for (let m = 0; m < 15; m++) {
      const packet = generateZoneFlowPacket('hostel_a', 2, 30 + m);
      state.liveTelemetryBuffer.push({
        time: formatSimTime(2, 30 + m),
        rate: packet.rate,
        excess: packet.excessRate,
        expected: packet.expectedBaseline
      });
    }

    initCharts();
    updateOverviewStats();
    renderAlertsTable();
    updateSidebarAlertCounter();

    // Start background simulation loop
    startSimulationTimer();

    console.info('[HydroSense Sentinel] Application initialized successfully with 4 zones and deterministic telemetry.');
  }

  // Boot on DOM ready
  function boot() {
    // Wait for login + server sync (api.js); falls back to local mode if no backend.
    (window.HydroAPI ? HydroAPI.ready() : Promise.resolve()).then(initApp);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
