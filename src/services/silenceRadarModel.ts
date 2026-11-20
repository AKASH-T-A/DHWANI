import type {
  DarkZone,
  DisasterScenarioId,
  EmergencyReport,
  Incident,
  SensorReading,
} from '../types/dhwani';

export interface BaselineFactorContribution {
  id: string;
  label: string;
  category: 'reporting-deficit' | 'river-gauge' | 'rainfall' | 'network' | 'population' | 'verification';
  points: number; // positive increases verification priority; negative lowers it
  valueDisplay: string;
  rationale: string;
}

export interface NearbySharedIncident {
  incident: Incident;
  distanceKm: number;
  matchType: 'direct-village' | 'same-taluk' | 'nearby-corridor';
}

export interface SilenceUncertaintyAssessment {
  marginPoints: number; // +/- risk index uncertainty
  level: 'High' | 'Moderate' | 'Low';
  confidenceInFlag: number; // 0 to 1
  expectedReportsInterval90: [number, number];
  epistemicSummary: string;
  drivers: string[];
}

export interface VillageBaselineInput {
  id: string;
  villageName: string;
  taluk: string;
  lat: number;
  lng: number;
  population: number;
  historicalBaseline: number; // reports per 30m during prior comparable floods
  expectedReportingRate: number; // 0.05 to 1.0 (baseline connectivity/access rate)
  actualReports: number; // live incoming reports
  connectivityPercent: number; // 0 to 100
  connectivityStatus: 'Healthy' | 'Intermittent' | 'Severely Degraded' | 'Blackout Suspected';
  nearbyGaugeName: string;
  nearbyGaugeLevelM: number;
  gaugeDangerLevelM: number;
  rainfallMmHr: number;
  roadStatus: string;
  minutesSilent: number;
  lastCommunicationAt: string;
  isBenchmarkVillage: boolean;
  verificationOutcome:
    | 'Unverified'
    | 'Verified Safe (Outage Only)'
    | 'Emergency Confirmed (Escalated)'
    | 'Unreachable — Escalated';
  acknowledgedActionsCount: number;
  totalActionsCount: number;
  darkZoneRef?: DarkZone;
}

export interface VillageSilenceEvaluation {
  input: VillageBaselineInput;
  // Core baseline outputs
  expectedReportsHealthyNetwork: number;
  expectedReportsGivenNetwork: number;
  expectedReportingRateEffective: number; // 0..1
  reportingDeficitRatio: number; // 0..1
  poissonTailProbability: number; // P(X <= actual | lambda = expectedHealthy)
  hazardPressureScore: number; // 0..100
  networkDegradationScore: number; // 0..100
  silenceRiskScore: number; // 0..100 (capped & guarded)
  priorityBand: 'Critical Verification Priority' | 'High Verification Priority' | 'Moderate Watch' | 'Low / No Silence Anomaly';
  isFlagged: boolean;
  zeroReportsGuardrailTriggered: boolean;
  flagHeadline: string;
  factors: BaselineFactorContribution[];
  uncertainty: SilenceUncertaintyAssessment;
  alternativeBenignExplanations: string[];
  connectedIncidents: NearbySharedIncident[];
  directIncomingReportsCount: number;
}

/**
 * Haversine distance in kilometers between two coordinates.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/**
 * Cumulative Poisson probability P(X <= k | lambda) computed cleanly without overflow.
 * Measures how statistically unusual seeing <= k reports is when lambda reports are expected.
 */
export function poissonCdf(k: number, lambda: number): number {
  if (lambda <= 0) return 1;
  if (k < 0) return 0;
  const safeLambda = Math.min(lambda, 80);
  const maxK = Math.min(Math.floor(k), 60);
  let term = Math.exp(-safeLambda);
  let sum = term;
  for (let i = 1; i <= maxK; i++) {
    term = (term * safeLambda) / i;
    sum += term;
  }
  return Number(Math.min(1, Math.max(0, sum)).toFixed(4));
}

/**
 * Evaluates a single village's reporting-baseline model with full transparency,
 * uncertainty intervals, and a strict guardrail ensuring zero reports NEVER
 * automatically equals confirmed danger.
 */
export function evaluateVillageBaseline(
  input: VillageBaselineInput,
  connectedIncidents: NearbySharedIncident[],
  directIncomingReportsCount: number
): VillageSilenceEvaluation {
  const popScale = Math.max(0.45, Math.min(2.4, input.population / 2200));
  const rainfallExcess = Math.max(0, input.rainfallMmHr - 25);
  const rainfallMultiplier = 1 + Math.min(0.85, (rainfallExcess / 95) * 0.75);

  const gaugeRatio = input.gaugeDangerLevelM > 0 ? input.nearbyGaugeLevelM / input.gaugeDangerLevelM : 0;
  const gaugeExceedance = Math.max(0, input.nearbyGaugeLevelM - input.gaugeDangerLevelM);
  const gaugeAlertActive = gaugeRatio >= 1.0;
  const gaugeWarningActive = gaugeRatio >= 0.9;
  const gaugeMultiplier = gaugeAlertActive
    ? 1.25 + Math.min(0.65, (gaugeRatio - 1.0) * 3.5)
    : gaugeWarningActive
      ? 1.08
      : 0.78;

  // Expected reports if cellular network were operating normally under current rain/gauge pressure
  const rawExpectedHealthy =
    Math.max(2, input.historicalBaseline) *
    (0.65 + 0.35 * popScale) *
    (0.55 + 0.45 * input.expectedReportingRate) *
    rainfallMultiplier *
    gaugeMultiplier;
  const expectedReportsHealthyNetwork = Math.max(2, Math.round(rawExpectedHealthy));

  // Effective reporting rate conditioned on tower availability (with 15% SMS/VHF floor)
  const connectivityFactor = Math.max(0.15, Math.min(1, input.connectivityPercent / 100));
  const expectedReportingRateEffective = Number(
    Math.max(0.06, Math.min(0.98, input.expectedReportingRate * connectivityFactor)).toFixed(2)
  );
  const expectedReportsGivenNetwork = Number(
    Math.max(0.5, expectedReportsHealthyNetwork * connectivityFactor).toFixed(1)
  );

  // Reporting deficit comparing live incoming reports to healthy-network hazard baseline
  const reportingDeficitRatio = Number(
    Math.max(0, Math.min(1, 1 - input.actualReports / Math.max(1, expectedReportsHealthyNetwork))).toFixed(2)
  );
  const tailProb = poissonCdf(input.actualReports, expectedReportsHealthyNetwork);

  // Component scores (0..100 each)
  const rainScore = Math.min(50, Math.round((input.rainfallMmHr / 110) * 50));
  const gaugeScore = gaugeAlertActive
    ? Math.min(50, 34 + Math.round((gaugeRatio - 1.0) * 140))
    : gaugeWarningActive
      ? 22
      : Math.round(Math.max(0, gaugeRatio * 18));
  const hazardPressureScore = Math.min(100, rainScore + gaugeScore);

  const networkDrop = Math.max(0, 100 - input.connectivityPercent);
  const silenceDurationBoost = Math.min(28, Math.round((input.minutesSilent / 60) * 24));
  const networkDegradationScore = Math.min(100, Math.round(networkDrop * 0.78 + silenceDurationBoost));

  // Guardrail check: Zero reports WITHOUT hazard pressure or network outage is NOT a danger signal!
  const calmWeather = input.rainfallMmHr < 30 && !gaugeAlertActive && !gaugeWarningActive;
  const healthyNetwork = input.connectivityPercent >= 70;
  const zeroReportsGuardrailTriggered =
    input.actualReports === 0 && calmWeather && healthyNetwork;

  // Transparent additive factor model (sums cleanly to Silence Risk Index 0..100)
  const factors: BaselineFactorContribution[] = [];

  // 1. Reporting Deficit vs Expected Baseline (max 28 pts, scaled down if calm weather)
  const deficitPts = zeroReportsGuardrailTriggered
    ? 4
    : Math.round(reportingDeficitRatio * (calmWeather ? 12 : 28));
  factors.push({
    id: 'f-deficit',
    label: 'Reporting Deficit vs. Expected Baseline',
    category: 'reporting-deficit',
    points: deficitPts,
    valueDisplay: `${input.actualReports} actual / ${expectedReportsHealthyNetwork} expected`,
    rationale:
      input.actualReports === 0 && calmWeather
        ? 'Zero reports observed, but weather/gauge alerts are calm — deficit heavily down-weighted (Zero Reports ≠ Danger).'
        : `Observed ${input.actualReports} incoming report(s) vs ${expectedReportsHealthyNetwork} expected under active hazard load (Poisson tail P=${(tailProb * 100).toFixed(1)}%).`,
  });

  // 2. River Gauge / Hydrological Alert (max 26 pts)
  const gaugePts = Math.round((gaugeScore / 50) * 26);
  factors.push({
    id: 'f-gauge',
    label: `Gauge Telemetry (${input.nearbyGaugeName})`,
    category: 'river-gauge',
    points: gaugePts,
    valueDisplay: `${input.nearbyGaugeLevelM}m / ${input.gaugeDangerLevelM}m danger`,
    rationale: gaugeAlertActive
      ? `Exceeds danger mark by +${gaugeExceedance.toFixed(1)}m — elevates urgency to verify silent communities downstream.`
      : gaugeWarningActive
        ? `Approaching danger threshold (${Math.round(gaugeRatio * 100)}% of mark).`
        : 'Gauge currently below warning mark.',
  });

  // 3. Rainfall Intensity (max 16 pts)
  const rainPts = Math.round((rainScore / 50) * 16);
  factors.push({
    id: 'f-rain',
    label: 'Upstream Rainfall Intensity',
    category: 'rainfall',
    points: rainPts,
    valueDisplay: `${input.rainfallMmHr} mm/hr`,
    rationale:
      input.rainfallMmHr >= 65
        ? 'Heavy monsoon cloudburst band increases expected flood/landslide distress reports.'
        : input.rainfallMmHr >= 30
          ? 'Moderate-to-heavy rainfall contributing to basin runoff.'
          : 'Light rainfall; low weather-driven reporting pressure.',
  });

  // 4. Network & Cellular Availability Collapse (max 22 pts)
  const netPts = Math.round((networkDegradationScore / 100) * 22);
  factors.push({
    id: 'f-network',
    label: 'Cellular Tower & Network Availability',
    category: 'network',
    points: netPts,
    valueDisplay: `${input.connectivityPercent}% uptime · ${input.minutesSilent}m silent`,
    rationale:
      input.connectivityPercent <= 30
        ? `Severe tower degradation (${input.connectivityStatus}) can suppress legitimate calls from reaching the control room.`
        : input.connectivityPercent <= 65
          ? 'Intermittent mobile signal may delay citizen SMS/WhatsApp uploads.'
          : 'Healthy cellular coverage; silence is far less likely to be a communication blackout.',
  });

  // 5. Population Exposure & Access Isolation (max 10 pts)
  const roadCut = /submerged|flooded|blocked|washed out|cut off/i.test(input.roadStatus);
  const popPts = Math.min(
    10,
    Math.round((Math.min(input.population, 4500) / 4500) * 6) + (roadCut ? 4 : 0)
  );
  factors.push({
    id: 'f-pop',
    label: 'Population Context & Road Access',
    category: 'population',
    points: popPts,
    valueDisplay: `${input.population.toLocaleString()} residents`,
    rationale: roadCut
      ? `${input.population.toLocaleString()} residents with disrupted road corridor (${input.roadStatus}).`
      : `${input.population.toLocaleString()} residents with accessible primary roads.`,
  });

  // 6. Verification Outcome Adjustment (can reduce risk dramatically if verified safe!)
  let verificationAdjustment = 0;
  if (input.verificationOutcome === 'Verified Safe (Outage Only)') {
    verificationAdjustment = -55;
    factors.push({
      id: 'f-verify',
      label: 'Field Verification Outcome',
      category: 'verification',
      points: verificationAdjustment,
      valueDisplay: 'Verified Safe',
      rationale: 'Direct outreach confirmed residents are safe; silence attributed to telecom outage only.',
    });
  } else if (input.verificationOutcome === 'Emergency Confirmed (Escalated)') {
    verificationAdjustment = -15;
    factors.push({
      id: 'f-verify',
      label: 'Escalated to Live Incident Queue',
      category: 'verification',
      points: verificationAdjustment,
      valueDisplay: 'Incident Linked',
      rationale: 'Silence broken via verification — active emergency record is now tracked in the shared incident queue.',
    });
  } else if (input.acknowledgedActionsCount > 0) {
    verificationAdjustment = -10;
    factors.push({
      id: 'f-verify',
      label: 'Outreach Acknowledged',
      category: 'verification',
      points: verificationAdjustment,
      valueDisplay: `${input.acknowledgedActionsCount} ack`,
      rationale: 'Partial verification check-in received, reducing silence uncertainty.',
    });
  }

  let rawScore = factors.reduce((acc, f) => acc + f.points, 0);
  // Strict zero-report non-danger cap when weather is calm and network is healthy
  if (zeroReportsGuardrailTriggered) {
    rawScore = Math.min(rawScore, 22);
  }
  const silenceRiskScore = Math.max(5, Math.min(96, Math.round(rawScore)));

  // Priority band (NEVER calls an unverified silent village "Confirmed Danger")
  let priorityBand: VillageSilenceEvaluation['priorityBand'] = 'Low / No Silence Anomaly';
  if (input.verificationOutcome === 'Verified Safe (Outage Only)') {
    priorityBand = 'Low / No Silence Anomaly';
  } else if (silenceRiskScore >= 74 && reportingDeficitRatio >= 0.55) {
    priorityBand = 'Critical Verification Priority';
  } else if (silenceRiskScore >= 54 && reportingDeficitRatio >= 0.4) {
    priorityBand = 'High Verification Priority';
  } else if (silenceRiskScore >= 36 && reportingDeficitRatio >= 0.3) {
    priorityBand = 'Moderate Watch';
  }

  const isFlagged =
    priorityBand === 'Critical Verification Priority' ||
    priorityBand === 'High Verification Priority';

  // Calibrated Epistemic Uncertainty Model
  // Lower connectivity & longer silence => HIGHER uncertainty (we cannot observe ground truth!)
  const poissonStd = Math.sqrt(Math.max(1, expectedReportsHealthyNetwork));
  const ciLow = Math.max(0, Math.round(expectedReportsHealthyNetwork - 1.64 * poissonStd));
  const ciHigh = Math.round(expectedReportsHealthyNetwork + 1.64 * poissonStd);

  const networkOpacityPenalty = Math.round(((100 - input.connectivityPercent) / 100) * 14);
  const silenceOpacityPenalty = Math.min(8, Math.round(input.minutesSilent / 12));
  const smallPopPenalty = input.population < 1600 ? 4 : 1;
  const verificationReduction =
    input.verificationOutcome === 'Verified Safe (Outage Only)' ||
    input.verificationOutcome === 'Emergency Confirmed (Escalated)'
      ? 12
      : input.acknowledgedActionsCount > 0
        ? 5
        : 0;

  const marginPoints = Math.max(
    4,
    Math.min(26, 5 + networkOpacityPenalty + silenceOpacityPenalty + smallPopPenalty - verificationReduction)
  );
  const uncertaintyLevel: SilenceUncertaintyAssessment['level'] =
    marginPoints >= 16 ? 'High' : marginPoints >= 10 ? 'Moderate' : 'Low';
  const confidenceInFlag = Number(Math.max(0.32, Math.min(0.94, 1 - marginPoints / 34)).toFixed(2));

  const uncertaintyDrivers: string[] = [];
  if (input.connectivityPercent <= 35) {
    uncertaintyDrivers.push(
      `Telecom blackout opacity (${input.connectivityPercent}% tower uptime): cannot distinguish safe outage from active flooding without outreach.`
    );
  }
  if (input.minutesSilent >= 30) {
    uncertaintyDrivers.push(
      `Communication gap of ${input.minutesSilent} minutes widens posterior uncertainty interval (±${marginPoints} pts).`
    );
  }
  if (input.population < 1600) {
    uncertaintyDrivers.push(
      `Smaller village population (${input.population.toLocaleString()}) increases baseline Poisson reporting variance [${ciLow}–${ciHigh}].`
    );
  }
  if (connectedIncidents.length > 0) {
    uncertaintyDrivers.push(
      `${connectedIncidents.length} nearby shared incident(s) provide corridor context but do not directly confirm conditions inside ${input.villageName}.`
    );
  }
  if (uncertaintyDrivers.length === 0) {
    uncertaintyDrivers.push('Active incoming reports and/or completed verification keep epistemic uncertainty low.');
  }

  const alternativeBenignExplanations: string[] = [
    'Cellular tower power or backhaul outage in an unaffected/dry settlement.',
    'Pre-emptive community evacuation to higher ground or relief camps prior to peak rain.',
    'Overnight low phone activity or conserved device batteries during power cuts.',
  ];
  if (input.actualReports > 0) {
    alternativeBenignExplanations.unshift(
      'Localized nuisance flooding only, with most households unaffected and not calling emergency lines.'
    );
  }

  const flagHeadline =
    input.verificationOutcome === 'Verified Safe (Outage Only)'
      ? 'Verified Safe — Silence Caused by Telecom Outage Only'
      : input.verificationOutcome === 'Emergency Confirmed (Escalated)'
        ? 'Verified & Escalated — Linked to Active Incident Store'
        : zeroReportsGuardrailTriggered
          ? 'Quiet Baseline — Zero Reports with Calm Weather & Healthy Network (Not Danger)'
          : isFlagged
            ? `Unverified Silence Anomaly — ${input.actualReports} actual vs ${expectedReportsHealthyNetwork} expected (${input.connectivityPercent}% signal)`
            : input.isBenchmarkVillage
              ? `Active Reporting Baseline — ${input.actualReports} incoming report(s) received`
              : 'Monitoring — Below Dark Zone Escalation Threshold';

  return {
    input,
    expectedReportsHealthyNetwork,
    expectedReportsGivenNetwork,
    expectedReportingRateEffective,
    reportingDeficitRatio,
    poissonTailProbability: tailProb,
    hazardPressureScore,
    networkDegradationScore,
    silenceRiskScore,
    priorityBand,
    isFlagged,
    zeroReportsGuardrailTriggered,
    flagHeadline,
    factors,
    uncertainty: {
      marginPoints,
      level: uncertaintyLevel,
      confidenceInFlag,
      expectedReportsInterval90: [ciLow, ciHigh],
      epistemicSummary:
        uncertaintyLevel === 'High'
          ? `High epistemic uncertainty (±${marginPoints} pts): silence is an unverified risk signal, NEVER confirmed danger.`
          : uncertaintyLevel === 'Moderate'
            ? `Moderate uncertainty (±${marginPoints} pts): combine sensor context with local outreach before committing heavy rescue assets.`
            : `Lower uncertainty (±${marginPoints} pts): sufficient incoming telemetry or verification feedback available.`,
      drivers: uncertaintyDrivers,
    },
    alternativeBenignExplanations,
    connectedIncidents,
    directIncomingReportsCount,
  };
}

/**
 * Links shared incident & report records to a village using name/taluk/radius matching.
 */
export function findConnectedIncidentsForVillage(
  villageName: string,
  taluk: string,
  lat: number,
  lng: number,
  incidents: Incident[],
  reports: EmergencyReport[]
): { connected: NearbySharedIncident[]; directReportsCount: number } {
  const firstToken = villageName.toLowerCase().split(/[\s/,-]+/)[0];
  const talukLower = taluk.toLowerCase();

  const connected: NearbySharedIncident[] = [];
  let directReportsCount = 0;

  for (const inc of incidents) {
    const dist = haversineKm(lat, lng, inc.location.lat, inc.location.lng);
    const placeLower = `${inc.location.placeName} ${inc.location.landmark} ${inc.title}`.toLowerCase();
    const isDirect =
      (firstToken.length >= 4 && placeLower.includes(firstToken)) || dist <= 3.5;
    const isSameTaluk = inc.location.taluk.toLowerCase() === talukLower;
    const isNearby = dist <= 14;

    if (isDirect) {
      connected.push({ incident: inc, distanceKm: dist, matchType: 'direct-village' });
      const incReports = reports.filter((r) => r.incidentId === inc.id && !r.isDuplicate).length;
      directReportsCount += Math.max(1, incReports);
    } else if (isSameTaluk || isNearby) {
      connected.push({
        incident: inc,
        distanceKm: dist,
        matchType: isSameTaluk ? 'same-taluk' : 'nearby-corridor',
      });
    }
  }

  connected.sort((a, b) => a.distanceKm - b.distanceKm);
  return { connected, directReportsCount };
}

/**
 * Builds the complete village reporting-baseline model for the active scenario,
 * combining all flagged Dark Zones + actively reporting benchmark villages
 * dynamically connected to the shared incidents, reports, and sensor state.
 */
export function buildBasinSilenceModel(params: {
  scenarioId: DisasterScenarioId;
  darkZones: DarkZone[];
  incidents: Incident[];
  reports: EmergencyReport[];
  sensors: SensorReading[];
}): VillageSilenceEvaluation[] {
  const { scenarioId, darkZones, incidents, reports, sensors } = params;
  const results: VillageSilenceEvaluation[] = [];

  // 1. Evaluate every Dark Zone village in live context
  for (const dz of darkZones) {
    const { connected, directReportsCount } = findConnectedIncidentsForVillage(
      dz.villageName,
      dz.taluk,
      dz.lat,
      dz.lng,
      incidents,
      reports
    );

    // Combine base scenario count with any newly arrived shared reports matching this village
    const liveActualReports = Math.max(dz.actualReports, directReportsCount);
    const ackCount = dz.actions.filter((a) => a.status === 'Acknowledged (simulated)').length;

    const input: VillageBaselineInput = {
      id: dz.id,
      villageName: dz.villageName,
      taluk: dz.taluk,
      lat: dz.lat,
      lng: dz.lng,
      population: dz.population,
      historicalBaseline: dz.historicalBaseline,
      expectedReportingRate: Math.max(0.25, Math.min(0.85, dz.expectedReports / Math.max(1, dz.historicalBaseline + 4))),
      actualReports: liveActualReports,
      connectivityPercent: dz.connectivityPercent,
      connectivityStatus: dz.connectivityStatus,
      nearbyGaugeName: dz.nearbyGaugeName,
      nearbyGaugeLevelM: dz.nearbyGaugeLevelM,
      gaugeDangerLevelM: dz.gaugeDangerLevelM,
      rainfallMmHr: dz.rainfallMmHr,
      roadStatus: dz.roadStatus,
      minutesSilent: dz.minutesSilent,
      lastCommunicationAt: dz.lastCommunicationAt,
      isBenchmarkVillage: false,
      verificationOutcome: dz.verificationOutcome ?? 'Unverified',
      acknowledgedActionsCount: ackCount,
      totalActionsCount: dz.actions.length,
      darkZoneRef: dz,
    };

    results.push(evaluateVillageBaseline(input, connected, directReportsCount));
  }

  // 2. Add actively reporting benchmark villages from the shared incident store for comparison
  const primaryGauge = sensors.find((s) => s.type === 'River Gauge') ?? sensors[0];
  const primaryRain = sensors.find((s) => s.type === 'Rainfall Station') ?? sensors[0];

  const benchmarkSeeds =
    scenarioId === 'kodagu-landslide'
      ? [
          {
            id: 'BM-KDG-01',
            villageName: 'Jodupala / Madikeri Ridge',
            taluk: 'Madikeri',
            lat: 12.4244,
            lng: 75.7382,
            population: 4800,
            historicalBaseline: 10,
            expectedReportingRate: 0.78,
            connectivityPercent: 74,
            roadStatus: 'NH-275 single-lane convoy only',
          },
          {
            id: 'BM-KDG-02',
            villageName: 'Bhagamandala Town',
            taluk: 'Madikeri',
            lat: 12.3879,
            lng: 75.5318,
            population: 3100,
            historicalBaseline: 8,
            expectedReportingRate: 0.72,
            connectivityPercent: 68,
            roadStatus: 'Napoklu link passable with caution',
          },
        ]
      : [
          {
            id: 'BM-NTV-01',
            villageName: 'Uppinangady Town Sector',
            taluk: 'Puttur',
            lat: 12.8384,
            lng: 75.2529,
            population: 6200,
            historicalBaseline: 12,
            expectedReportingRate: 0.84,
            connectivityPercent: 78,
            roadStatus: 'NH-75 approach waterlogged, passable to boats',
          },
          {
            id: 'BM-NTV-02',
            villageName: 'Mangaluru Jeppu Ward',
            taluk: 'Mangaluru',
            lat: 12.8511,
            lng: 74.8492,
            population: 14500,
            historicalBaseline: 14,
            expectedReportingRate: 0.94,
            connectivityPercent: 95,
            roadStatus: 'Urban arterial roads open',
          },
        ];

  for (const bm of benchmarkSeeds) {
    const { connected, directReportsCount } = findConnectedIncidentsForVillage(
      bm.villageName,
      bm.taluk,
      bm.lat,
      bm.lng,
      incidents,
      reports
    );

    const matchingIncidents = connected.filter((c) => c.matchType === 'direct-village');
    const summedRawReports = matchingIncidents.reduce(
      (sum, m) => sum + Math.max(1, m.incident.needEstimate.rawReportCount),
      0
    );
    const liveActual = Math.max(directReportsCount, summedRawReports);

    const input: VillageBaselineInput = {
      id: bm.id,
      villageName: bm.villageName,
      taluk: bm.taluk,
      lat: bm.lat,
      lng: bm.lng,
      population: bm.population,
      historicalBaseline: bm.historicalBaseline,
      expectedReportingRate: bm.expectedReportingRate,
      actualReports: liveActual,
      connectivityPercent: bm.connectivityPercent,
      connectivityStatus: bm.connectivityPercent >= 75 ? 'Healthy' : 'Intermittent',
      nearbyGaugeName: primaryGauge?.name ?? 'Regional Basin Gauge',
      nearbyGaugeLevelM: primaryGauge?.value ?? 28.0,
      gaugeDangerLevelM: primaryGauge?.dangerThreshold ?? 30.5,
      rainfallMmHr: primaryRain?.type === 'Rainfall Station' ? primaryRain.value : 54,
      roadStatus: bm.roadStatus,
      minutesSilent: liveActual > 0 ? 4 : 18,
      lastCommunicationAt: liveActual > 0 ? 'Active (<5 min ago)' : '18 min ago',
      isBenchmarkVillage: true,
      verificationOutcome: 'Unverified',
      acknowledgedActionsCount: 0,
      totalActionsCount: 0,
    };

    results.push(evaluateVillageBaseline(input, connected, directReportsCount));
  }

  return results;
}
