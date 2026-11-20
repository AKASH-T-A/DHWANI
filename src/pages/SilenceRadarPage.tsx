import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Info,
  PhoneCall,
  Plane,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  Sliders,
  UserCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SilenceRadarMap } from '../components/InteractiveMap';
import {
  buildBasinSilenceModel,
  evaluateVillageBaseline,
  type VillageBaselineInput,
} from '../services/silenceRadarModel';
import { useDhwani } from '../store/DhwaniContext';
import type { DarkZoneActionRecord } from '../types/dhwani';

const ACTION_BUTTONS: {
  type: DarkZoneActionRecord['actionType'];
  label: string;
  defaultNote: string;
  Icon: typeof PhoneCall;
}[] = [
  {
    type: 'IVR Callback',
    label: 'Initiate IVR Callback',
    defaultNote: 'Automated missed-call IVR wellness check queued to Gram Panchayat contacts (simulated).',
    Icon: PhoneCall,
  },
  {
    type: 'SMS Verification Request',
    label: 'Send SMS Request',
    defaultNote: 'Low-bandwidth Kannada 1/2 safety check SMS broadcast queued (simulated).',
    Icon: Send,
  },
  {
    type: 'Local Volunteer Contact',
    label: 'Contact Local Volunteer',
    defaultNote: 'Dispatched VHF / offline PWA ping to nearest registered village volunteer (simulated).',
    Icon: UserCheck,
  },
  {
    type: 'Field Verification Request',
    label: 'Request Field Verification',
    defaultNote: 'Logged scouting verification order for nearest revenue / police patrol (simulated).',
    Icon: Compass,
  },
  {
    type: 'Drone Assessment Request',
    label: 'Request Drone Assessment',
    defaultNote: 'Submitted weather-contingent aerial reconnaissance request for floodline assessment (simulated).',
    Icon: Plane,
  },
];

export function SilenceRadarPage() {
  const {
    incidents,
    reports,
    darkZones,
    rescueTeams,
    scenarioMeta,
    systemStatus,
    canEditTriage,
    triggerDarkZoneAction,
    resolveDarkZoneVerification,
    openIncidentDetail,
    setActiveModule,
  } = useDhwani();

  const [viewFilter, setViewFilter] = useState<'all' | 'flagged'>('all');
  const [talukFilter, setTalukFilter] = useState<string>('All');
  const [selectedVillageId, setSelectedVillageId] = useState<string>(darkZones[0]?.id ?? '');
  const [customNote, setCustomNote] = useState('');
  const [outcomeFeedback, setOutcomeFeedback] = useState<{ text: string; incidentId?: string } | null>(null);

  // Interactive "What-If" Baseline Sensitivity Lab state
  const [simEnabled, setSimEnabled] = useState(false);
  const [simActualReports, setSimActualReports] = useState(0);
  const [simExpectedRate, setSimExpectedRate] = useState(0.6);
  const [simConnectivity, setSimConnectivity] = useState(14);
  const [simRainfall, setSimRainfall] = useState(88);
  const [simGaugeLevel, setSimGaugeLevel] = useState(31.8);
  const [simPopulation, setSimPopulation] = useState(3420);

  // Live village reporting-baseline model connected to shared incidents, reports & sensors
  const allEvaluations = useMemo(
    () =>
      buildBasinSilenceModel({
        scenarioId: scenarioMeta.id,
        darkZones,
        incidents,
        reports,
        sensors: scenarioMeta.sensors,
      }),
    [scenarioMeta.id, scenarioMeta.sensors, darkZones, incidents, reports]
  );

  const uniqueTaluks = useMemo(
    () => Array.from(new Set(allEvaluations.map((e) => e.input.taluk))),
    [allEvaluations]
  );

  const filteredEvaluations = useMemo(() => {
    return allEvaluations.filter((ev) => {
      if (viewFilter === 'flagged' && ev.input.isBenchmarkVillage) return false;
      if (talukFilter !== 'All' && ev.input.taluk !== talukFilter) return false;
      return true;
    });
  }, [allEvaluations, viewFilter, talukFilter]);

  useEffect(() => {
    if (!allEvaluations.some((e) => e.input.id === selectedVillageId)) {
      setSelectedVillageId(allEvaluations[0]?.input.id ?? '');
    }
  }, [allEvaluations, selectedVillageId]);

  const baseSelected =
    allEvaluations.find((e) => e.input.id === selectedVillageId) ?? allEvaluations[0];

  // Reset sensitivity sliders whenever the selected village changes
  useEffect(() => {
    if (!baseSelected) return;
    setSimEnabled(false);
    setSimActualReports(baseSelected.input.actualReports);
    setSimExpectedRate(baseSelected.input.expectedReportingRate);
    setSimConnectivity(baseSelected.input.connectivityPercent);
    setSimRainfall(baseSelected.input.rainfallMmHr);
    setSimGaugeLevel(baseSelected.input.nearbyGaugeLevelM);
    setSimPopulation(baseSelected.input.population);
    setOutcomeFeedback(null);
  }, [baseSelected?.input.id]);

  // Compute active dossier evaluation (either live ground state or interactive What-If sensitivity preview)
  const activeEvaluation = useMemo(() => {
    if (!baseSelected) return null;
    if (!simEnabled) return baseSelected;
    const patchedInput: VillageBaselineInput = {
      ...baseSelected.input,
      actualReports: simActualReports,
      expectedReportingRate: simExpectedRate,
      connectivityPercent: simConnectivity,
      connectivityStatus:
        simConnectivity <= 20
          ? 'Blackout Suspected'
          : simConnectivity <= 45
            ? 'Severely Degraded'
            : simConnectivity <= 75
              ? 'Intermittent'
              : 'Healthy',
      rainfallMmHr: simRainfall,
      nearbyGaugeLevelM: simGaugeLevel,
      population: simPopulation,
    };
    return evaluateVillageBaseline(
      patchedInput,
      baseSelected.connectedIncidents,
      baseSelected.directIncomingReportsCount
    );
  }, [
    baseSelected,
    simEnabled,
    simActualReports,
    simExpectedRate,
    simConnectivity,
    simRainfall,
    simGaugeLevel,
    simPopulation,
  ]);

  const chartData = useMemo(
    () =>
      allEvaluations.map((ev) => ({
        id: ev.input.id,
        village: ev.input.villageName.split(' ')[0],
        fullName: ev.input.villageName,
        Expected: ev.expectedReportsHealthyNetwork,
        Actual: ev.input.actualReports,
        Connectivity: ev.input.connectivityPercent,
        Risk: ev.silenceRiskScore,
        isDarkZone: !ev.input.isBenchmarkVillage,
      })),
    [allEvaluations]
  );

  const flaggedCount = allEvaluations.filter((e) => e.isFlagged).length;
  const avgUncertainty =
    allEvaluations.length > 0
      ? Math.round(
          allEvaluations.reduce((s, e) => s + e.uncertainty.marginPoints, 0) / allEvaluations.length
        )
      : 0;
  const totalVerificationActions = darkZones.reduce((s, d) => s + d.actions.length, 0);

  const handleAction = (actionType: DarkZoneActionRecord['actionType'], defaultNote: string) => {
    if (!baseSelected?.input.darkZoneRef || !canEditTriage) return;
    triggerDarkZoneAction(
      baseSelected.input.darkZoneRef.id,
      actionType,
      customNote.trim() || defaultNote
    );
    setCustomNote('');
    setOutcomeFeedback({
      text: `Logged "${actionType}" (simulated) for ${baseSelected.input.villageName}.`,
    });
  };

  const handleOutcome = (outcome: 'confirmed_safe' | 'confirmed_emergency' | 'unreachable') => {
    if (!baseSelected?.input.darkZoneRef || !canEditTriage) return;
    const dzId = baseSelected.input.darkZoneRef.id;
    const createdId = resolveDarkZoneVerification(dzId, outcome, customNote.trim() || undefined);
    setCustomNote('');
    if (outcome === 'confirmed_safe') {
      setOutcomeFeedback({
        text: `${baseSelected.input.villageName} marked Verified Safe (Telecom Outage Only). Risk and uncertainty lowered.`,
      });
    } else if (outcome === 'confirmed_emergency' && createdId) {
      setOutcomeFeedback({
        text: `Emergency confirmed in ${baseSelected.input.villageName} and escalated to shared live incident ${createdId}.`,
        incidentId: createdId,
      });
    } else {
      setOutcomeFeedback({
        text: `${baseSelected.input.villageName} marked unreachable — field scouting / drone verification escalated.`,
      });
    }
  };

  const applyZeroReportCalmTest = () => {
    if (!baseSelected) return;
    setSimEnabled(true);
    setSimActualReports(0);
    setSimConnectivity(88);
    setSimRainfall(12);
    setSimGaugeLevel(Number((baseSelected.input.gaugeDangerLevelM * 0.65).toFixed(1)));
  };

  const resetWhatIf = () => {
    if (!baseSelected) return;
    setSimEnabled(false);
    setSimActualReports(baseSelected.input.actualReports);
    setSimExpectedRate(baseSelected.input.expectedReportingRate);
    setSimConnectivity(baseSelected.input.connectivityPercent);
    setSimRainfall(baseSelected.input.rainfallMmHr);
    setSimGaugeLevel(baseSelected.input.nearbyGaugeLevelM);
    setSimPopulation(baseSelected.input.population);
  };

  const selectedDz = baseSelected?.input.darkZoneRef ?? null;

  return (
    <div className="space-y-6">
      {/* Header & Responsible AI Non-Proof Principle */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-red-400">
            SILENCE RADAR · VILLAGE REPORTING-BASELINE & DARK ZONE MODEL
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7]">
            Silence Radar — Potential Dark Zone Detection & Verification
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
            Models expected village reporting baselines using population context, historical flood rates, rainfall intensity, river gauge alerts, and cellular availability against live incoming reports from the shared incident store.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 max-w-md flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Zero Reports ≠ Confirmed Danger:</strong> Communication silence is an <em>unverified risk anomaly</em> with explicit uncertainty — never automatic proof that a village is flooded or affected.
          </span>
        </div>
      </div>

      {/* Basin Baseline Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-3.5">
          <div className="text-[#8B9BB4]">Monitored Basin Villages</div>
          <div className="mt-1 text-xl font-mono font-semibold text-[#E6EDF7] tabular-nums">
            {allEvaluations.length}{' '}
            <span className="text-xs font-normal text-[#6B7E9B]">
              ({darkZones.length} dark zones · {allEvaluations.length - darkZones.length} benchmarks)
            </span>
          </div>
        </div>
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-3.5">
          <div className="text-[#8B9BB4]">Flagged for Verification</div>
          <div className="mt-1 text-xl font-mono font-semibold text-red-400 tabular-nums">
            {flaggedCount}{' '}
            <span className="text-xs font-normal text-[#6B7E9B]">unverified anomalies</span>
          </div>
        </div>
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-3.5">
          <div className="text-[#8B9BB4]">Avg Epistemic Uncertainty</div>
          <div className="mt-1 text-xl font-mono font-semibold text-amber-400 tabular-nums">
            ±{avgUncertainty} pts{' '}
            <span className="text-xs font-normal text-[#6B7E9B]">across basin</span>
          </div>
        </div>
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-3.5">
          <div className="text-[#8B9BB4]">Shared Incidents / Actions</div>
          <div className="mt-1 text-xl font-mono font-semibold text-cyan-400 tabular-nums">
            {incidents.length} inc · {totalVerificationActions} checks
          </div>
        </div>
      </div>

      {/* Expected vs Actual Reporting Baseline Comparison Chart */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#182336]">
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Expected Reporting Baseline vs. Actual Live Incoming Reports ({scenarioMeta.name})
            </h2>
            <p className="text-xs text-[#8B9BB4]">
              Contrasts silent villages against actively reporting basin benchmarks. Click any bar group or village card below to inspect its baseline math and uncertainty.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value as 'all' | 'flagged')}
              className="px-2.5 py-1.5 bg-[#090E17] border border-[#243652] rounded text-[#E6EDF7] text-xs"
            >
              <option value="all">All Basin Villages ({allEvaluations.length})</option>
              <option value="flagged">Potential Dark Zones Only ({darkZones.length})</option>
            </select>
            <select
              value={talukFilter}
              onChange={(e) => setTalukFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#090E17] border border-[#243652] rounded text-[#E6EDF7] text-xs"
            >
              <option value="All">All Taluks</option>
              {uniqueTaluks.map((t) => (
                <option key={t} value={t}>
                  {t} Taluk
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: -12, bottom: 4 }}
              onClick={(state) => {
                const idx =
                  typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                const byIdx = idx >= 0 ? chartData[idx] : undefined;
                const byLabel = state?.activeLabel
                  ? chartData.find((row) => row.village === String(state.activeLabel))
                  : undefined;
                const target = byIdx ?? byLabel;
                if (target?.id) setSelectedVillageId(target.id);
              }}
            >
              <CartesianGrid stroke="#182336" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="village"
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                axisLine={{ stroke: '#1E2B40' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0B121F',
                  borderColor: '#243652',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#E6EDF7',
                }}
                formatter={(val: unknown, name: unknown) => [
                  name === 'Connectivity' ? `${val}% uptime` : `${val} reports`,
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#CBD5E1' }} />
              <Bar dataKey="Expected" name="Expected Baseline (30m)" fill="#38BDF8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Actual" name="Actual Incoming (Live)" fill="#10B981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Silence Radar Map + Ranked Village Selector List */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7">
          <SilenceRadarMap
            incidents={incidents}
            darkZones={darkZones}
            rescueTeams={rescueTeams}
            sensors={scenarioMeta.sensors}
            roadClosures={scenarioMeta.roadClosures}
            reliefCenters={scenarioMeta.reliefCenters}
            networkTier={systemStatus.networkTier}
            scenarioId={scenarioMeta.id}
            selectedDarkZoneId={selectedDz?.id}
            onSelectDarkZone={(id) => setSelectedVillageId(id)}
            heightClass="h-[460px]"
          />
        </div>

        {/* Village Baseline Selector List */}
        <div className="xl:col-span-5 space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#E6EDF7]">
            <span>Basin Village Baseline Queue ({filteredEvaluations.length})</span>
            <span className="font-mono text-[11px] font-normal text-[#8B9BB4]">
              Sorted by live verification risk
            </span>
          </div>

          {filteredEvaluations.map((ev) => {
            const active = baseSelected?.input.id === ev.input.id;
            const tone =
              ev.input.verificationOutcome === 'Verified Safe (Outage Only)'
                ? 'text-emerald-400'
                : ev.priorityBand === 'Critical Verification Priority'
                  ? 'text-red-400'
                  : ev.priorityBand === 'High Verification Priority'
                    ? 'text-amber-400'
                    : ev.input.isBenchmarkVillage
                      ? 'text-cyan-400'
                      : 'text-emerald-400';

            return (
              <button
                key={ev.input.id}
                type="button"
                onClick={() => setSelectedVillageId(ev.input.id)}
                className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#132238] border-cyan-500/60'
                    : 'bg-[#0F1623] border-[#1E2B40] hover:border-[#2F4568]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono text-[#8B9BB4]">
                      {ev.input.id} · {ev.input.taluk} · Pop. {ev.input.population.toLocaleString()}
                      {ev.input.isBenchmarkVillage ? ' · ACTIVE BENCHMARK' : ''}
                    </div>
                    <h3 className="mt-0.5 text-sm font-semibold text-[#E6EDF7]">{ev.input.villageName}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-mono font-semibold tabular-nums ${tone}`}>
                      {ev.silenceRiskScore}/100 (±{ev.uncertainty.marginPoints})
                    </div>
                    <div className="text-[10.5px] text-[#8B9BB4]">
                      {ev.input.verificationOutcome !== 'Unverified'
                        ? ev.input.verificationOutcome
                        : ev.input.isBenchmarkVillage
                          ? 'Active Baseline'
                          : ev.priorityBand.replace(' Verification Priority', '')}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                  <div className="p-2 rounded bg-[#090E17] border border-[#182336]">
                    <div className="text-[10px] text-[#6B7E9B] font-sans">Actual / Exp.</div>
                    <div className={`font-semibold mt-0.5 ${ev.isFlagged ? 'text-red-400' : 'text-emerald-400'}`}>
                      {ev.input.actualReports} / {ev.expectedReportsHealthyNetwork}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-[#090E17] border border-[#182336]">
                    <div className="text-[10px] text-[#6B7E9B] font-sans">Network</div>
                    <div className="text-amber-400 font-semibold mt-0.5">{ev.input.connectivityPercent}%</div>
                  </div>
                  <div className="p-2 rounded bg-[#090E17] border border-[#182336]">
                    <div className="text-[10px] text-[#6B7E9B] font-sans">Uncertainty</div>
                    <div className="text-[#E6EDF7] font-semibold mt-0.5">{ev.uncertainty.level}</div>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-[#94A3B8] line-clamp-2">
                  {ev.flagHeadline}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Deep Selected Village Dossier: Why Flagged, Uncertainty, Connected Incidents, What-If Lab & Verification */}
      {activeEvaluation && baseSelected && (
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-6">
          {/* Dossier Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#182336]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className={activeEvaluation.isFlagged ? 'text-red-400 font-semibold' : 'text-cyan-400 font-semibold'}>
                  {activeEvaluation.input.id} · {activeEvaluation.priorityBand.toUpperCase()}
                </span>
                <span className="text-[#475569]">·</span>
                <span className="text-[#94A3B8]">
                  {activeEvaluation.input.connectivityStatus} · Last Comm: {activeEvaluation.input.lastCommunicationAt}
                </span>
                {simEnabled && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300">
                    WHAT-IF SIMULATION PREVIEW
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-[#E6EDF7]">
                {activeEvaluation.input.villageName} — Reporting-Baseline & Verification Dossier
              </h2>
              <p className="text-xs text-[#CBD5E1] max-w-3xl leading-relaxed">
                {activeEvaluation.flagHeadline}
              </p>
            </div>

            <div className="text-right font-mono text-xs tabular-nums space-y-1">
              <div className="text-base font-semibold text-[#E6EDF7]">
                Silence Risk Index:{' '}
                <span className={activeEvaluation.isFlagged ? 'text-red-400' : 'text-emerald-400'}>
                  {activeEvaluation.silenceRiskScore}/100
                </span>{' '}
                <span className="text-amber-400 text-xs">(±{activeEvaluation.uncertainty.marginPoints})</span>
              </div>
              <div className="text-[#8B9BB4]">
                Poisson Tail P(X ≤ {activeEvaluation.input.actualReports} | λ={activeEvaluation.expectedReportsHealthyNetwork}):{' '}
                <span className="text-cyan-300">{(activeEvaluation.poissonTailProbability * 100).toFixed(2)}%</span>
              </div>
              <div className="text-amber-400">Road: {activeEvaluation.input.roadStatus}</div>
            </div>
          </div>

          {/* Zero-Report Non-Danger Guardrail Callout */}
          {activeEvaluation.zeroReportsGuardrailTriggered && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/35 text-xs text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>Zero-Reports Guardrail Active:</strong> Even though actual incoming reports = 0, rainfall ({activeEvaluation.input.rainfallMmHr} mm/hr) and river gauge ({activeEvaluation.input.nearbyGaugeLevelM}m vs {activeEvaluation.input.gaugeDangerLevelM}m danger) are calm and cellular coverage is healthy ({activeEvaluation.input.connectivityPercent}%). DHWANI explicitly suppresses danger escalation because zero reports alone is NEVER danger.
              </div>
            </div>
          )}

          {/* Core Model Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[#6B7E9B]">Expected vs Actual</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#E6EDF7] tabular-nums">
                {activeEvaluation.input.actualReports} / {activeEvaluation.expectedReportsHealthyNetwork}
              </div>
              <div className="mt-0.5 text-[11px] text-[#8B9BB4]">
                Net-adjusted exp: {activeEvaluation.expectedReportsGivenNetwork}
              </div>
            </div>
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[#6B7E9B]">Effective Reporting Rate</div>
              <div className="mt-1 font-mono text-base font-semibold text-cyan-400 tabular-nums">
                {Math.round(activeEvaluation.expectedReportingRateEffective * 100)}%
              </div>
              <div className="mt-0.5 text-[11px] text-[#8B9BB4]">
                Base {Math.round(activeEvaluation.input.expectedReportingRate * 100)}% × signal
              </div>
            </div>
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[#6B7E9B]">River Gauge Alert</div>
              <div className="mt-1 font-mono text-base font-semibold text-red-400 tabular-nums">
                {activeEvaluation.input.nearbyGaugeLevelM}m
              </div>
              <div className="mt-0.5 text-[11px] text-[#8B9BB4]">
                Danger: {activeEvaluation.input.gaugeDangerLevelM}m
              </div>
            </div>
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[#6B7E9B]">Rainfall & Network</div>
              <div className="mt-1 font-mono text-base font-semibold text-amber-400 tabular-nums">
                {activeEvaluation.input.rainfallMmHr}mm · {activeEvaluation.input.connectivityPercent}%
              </div>
              <div className="mt-0.5 text-[11px] text-[#8B9BB4]">
                Silent {activeEvaluation.input.minutesSilent} min
              </div>
            </div>
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[#6B7E9B]">Population Context</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#E6EDF7] tabular-nums">
                {activeEvaluation.input.population.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#8B9BB4]">
                Hist. baseline: {activeEvaluation.input.historicalBaseline}/30m
              </div>
            </div>
          </div>

          {/* Two-Column Deep Explanation: Why Flagged + Uncertainty & Non-Danger Explanations */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Left 7: Why This Village Is Flagged (Transparent Factor Contributions) */}
            <div className="xl:col-span-7 bg-[#090E17] border border-[#182336] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#182336]">
                <h3 className="text-xs font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Why This Village Is Flagged (Explainable Baseline Attribution)
                </h3>
                <span className="text-[11px] font-mono text-[#8B9BB4]">
                  Deficit {Math.round(activeEvaluation.reportingDeficitRatio * 100)}%
                </span>
              </div>

              <div className="space-y-2.5">
                {activeEvaluation.factors.map((f) => {
                  const pct = Math.min(100, Math.round((Math.abs(f.points) / 30) * 100));
                  const barColor =
                    f.points < 0
                      ? 'bg-emerald-500'
                      : f.category === 'reporting-deficit' || f.category === 'river-gauge'
                        ? 'bg-red-500'
                        : f.category === 'network'
                          ? 'bg-amber-500'
                          : 'bg-cyan-500';

                  return (
                    <div key={f.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#E6EDF7]">{f.label}</span>
                        <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                          <span className="text-[#8B9BB4]">{f.valueDisplay}</span>
                          <span className={f.points < 0 ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                            {f.points >= 0 ? `+${f.points}` : f.points} pts
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded bg-[#141E30] overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{f.rationale}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 5: Uncertainty Quantification + Alternative Benign Explanations */}
            <div className="xl:col-span-5 space-y-4">
              <div className="bg-[#090E17] border border-[#182336] rounded-lg p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#182336]">
                  <h3 className="font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Uncertainty & Epistemic Bounds
                  </h3>
                  <span
                    className={`font-mono font-semibold ${
                      activeEvaluation.uncertainty.level === 'High'
                        ? 'text-red-400'
                        : activeEvaluation.uncertainty.level === 'Moderate'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {activeEvaluation.uncertainty.level} (±{activeEvaluation.uncertainty.marginPoints} pts)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded bg-[#0F1623] border border-[#182336]">
                    <div className="text-[#6B7E9B] font-sans">90% Expected Range</div>
                    <div className="text-cyan-300 font-semibold mt-0.5">
                      {activeEvaluation.uncertainty.expectedReportsInterval90[0]} –{' '}
                      {activeEvaluation.uncertainty.expectedReportsInterval90[1]} rpts
                    </div>
                  </div>
                  <div className="p-2 rounded bg-[#0F1623] border border-[#182336]">
                    <div className="text-[#6B7E9B] font-sans">Flag Confidence</div>
                    <div className="text-[#E6EDF7] font-semibold mt-0.5">
                      {Math.round(activeEvaluation.uncertainty.confidenceInFlag * 100)}% calibrated
                    </div>
                  </div>
                </div>

                <p className="text-[11.5px] text-amber-200/90 leading-relaxed">
                  {activeEvaluation.uncertainty.epistemicSummary}
                </p>

                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-[#CBD5E1]">Uncertainty Drivers:</div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-[#94A3B8]">
                    {activeEvaluation.uncertainty.drivers.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-[#090E17] border border-[#182336] rounded-lg p-4 space-y-2 text-xs">
                <div className="font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  Alternative Non-Danger Explanations (Why Verification Is Mandatory)
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-[#94A3B8]">
                  {activeEvaluation.alternativeBenignExplanations.map((alt, idx) => (
                    <li key={idx}>{alt}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Connected Shared Incident Data + Interactive What-If Sensitivity Lab */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Connected Shared Incidents */}
            <div className="xl:col-span-6 bg-[#090E17] border border-[#182336] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#182336]">
                <div>
                  <h3 className="text-xs font-semibold text-[#E6EDF7]">
                    Connected Shared Incident Data ({activeEvaluation.connectedIncidents.length} in village / corridor)
                  </h3>
                  <p className="text-[11px] text-[#8B9BB4]">
                    Live cross-reference from the shared incident store. Adding reports in Live Feed immediately updates this village's actual count.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('live-feed')}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Submit New Report →
                </button>
              </div>

              {activeEvaluation.connectedIncidents.length === 0 ? (
                <div className="p-3 rounded bg-[#0F1623] border border-[#182336] text-xs text-[#6B7E9B]">
                  No shared incidents recorded within 14 km of {activeEvaluation.input.villageName} yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {activeEvaluation.connectedIncidents.map(({ incident: inc, distanceKm, matchType }) => (
                    <div
                      key={inc.id}
                      className="p-2.5 rounded bg-[#0F1623] border border-[#182336] hover:border-cyan-500/40 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-cyan-400 font-semibold">{inc.id}</span>
                          <span className="text-[#475569]">·</span>
                          <span className={matchType === 'direct-village' ? 'text-emerald-400' : 'text-[#8B9BB4]'}>
                            {matchType === 'direct-village'
                              ? 'Direct Village Match'
                              : `${distanceKm} km away (${inc.location.taluk})`}
                          </span>
                        </div>
                        <div className="text-[#E6EDF7] font-medium truncate mt-0.5">{inc.title}</div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {inc.hazard} · Need {inc.needEstimate.finalNeedScore}/100 · {inc.verificationStatus}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openIncidentDetail(inc.id, 'incident-intelligence')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-[11px] text-cyan-300 shrink-0 cursor-pointer"
                      >
                        Inspect
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive What-If Baseline Sensitivity Simulator */}
            <div className="xl:col-span-6 bg-[#090E17] border border-[#182336] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#182336]">
                <h3 className="text-xs font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Interactive Baseline Sensitivity Lab (What-If Explorer)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyZeroReportCalmTest}
                    className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-[11px] text-emerald-300 cursor-pointer"
                  >
                    Test: 0 Reports + Calm Weather
                  </button>
                  {simEnabled && (
                    <button
                      type="button"
                      onClick={resetWhatIf}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-[11px] text-[#CBD5E1] cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">Actual Incoming Reports</span>
                    <span className="text-[#E6EDF7]">{simActualReports}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    value={simActualReports}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimActualReports(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">Network Availability (%)</span>
                    <span className="text-amber-400">{simConnectivity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={simConnectivity}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimConnectivity(Number(e.target.value));
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">Rainfall Intensity (mm/hr)</span>
                    <span className="text-cyan-400">{simRainfall} mm/hr</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={140}
                    value={simRainfall}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimRainfall(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">
                      Gauge Level (Danger {baseSelected.input.gaugeDangerLevelM}m)
                    </span>
                    <span className="text-red-400">{simGaugeLevel}m</span>
                  </div>
                  <input
                    type="range"
                    min={Math.max(5, Math.round(baseSelected.input.gaugeDangerLevelM * 0.5))}
                    max={Math.round(baseSelected.input.gaugeDangerLevelM * 1.4)}
                    step={0.2}
                    value={simGaugeLevel}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimGaugeLevel(Number(e.target.value));
                    }}
                    className="w-full accent-red-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">Expected Reporting Rate</span>
                    <span className="text-[#E6EDF7]">{Math.round(simExpectedRate * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={95}
                    value={Math.round(simExpectedRate * 100)}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimExpectedRate(Number(e.target.value) / 100);
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#8B9BB4] font-sans">Village Population</span>
                    <span className="text-[#E6EDF7]">{simPopulation.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min={400}
                    max={12000}
                    step={100}
                    value={simPopulation}
                    onChange={(e) => {
                      setSimEnabled(true);
                      setSimPopulation(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </label>
              </div>
              <div className="text-[11px] text-[#6B7E9B]">
                Adjusting sliders previews model sensitivity live without modifying operational records.
              </div>
            </div>
          </div>

          {/* Verification Actions & Outcome Resolution (Dark Zones) */}
          {selectedDz ? (
            <div className="space-y-4 pt-3 border-t border-[#182336]">
              {!canEditTriage && (
                <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  Read-Only Observer role cannot initiate verification outreach or log outcomes. Switch role in Settings.
                </div>
              )}

              {outcomeFeedback && (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex flex-wrap items-center justify-between gap-2">
                  <span>{outcomeFeedback.text}</span>
                  {outcomeFeedback.incidentId && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openIncidentDetail(outcomeFeedback.incidentId!, 'incident-intelligence')}
                        className="underline text-cyan-300 cursor-pointer"
                      >
                        Open Incident Intelligence →
                      </button>
                      <button
                        type="button"
                        onClick={() => openIncidentDetail(outcomeFeedback.incidentId!, 'rescue-coordination')}
                        className="underline text-orange-300 cursor-pointer"
                      >
                        Assign Rescue Team →
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  Step 1: Initiate Verification Outreach (Simulated Workflows)
                </div>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Optional note for verification dispatch or field outcome..."
                  className="sm:w-96 px-3 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {ACTION_BUTTONS.map(({ type, label, defaultNote, Icon }) => (
                  <button
                    key={type}
                    type="button"
                    disabled={!canEditTriage}
                    onClick={() => handleAction(type, defaultNote)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#263B59] text-xs font-medium text-[#E6EDF7] cursor-pointer transition-colors disabled:opacity-40"
                  >
                    <Icon className="w-3.5 h-3.5 text-cyan-400" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Step 2: Closed-Loop Verification Outcome Controls */}
              <div className="p-3.5 rounded-lg bg-[#090E17] border border-[#1E2B40] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#E6EDF7]">
                    Step 2: Log Verification Outcome (Updates Shared Incident Store & Audit Trail)
                  </div>
                  {selectedDz.linkedIncidentId && (
                    <button
                      type="button"
                      onClick={() => openIncidentDetail(selectedDz.linkedIncidentId!, 'incident-intelligence')}
                      className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Linked Incident: {selectedDz.linkedIncidentId} →
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canEditTriage}
                    onClick={() => handleOutcome('confirmed_safe')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium cursor-pointer disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Verified Safe (Comms Outage Only)
                  </button>
                  <button
                    type="button"
                    disabled={!canEditTriage}
                    onClick={() => handleOutcome('confirmed_emergency')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Confirm Emergency & Escalate to Live Incident
                  </button>
                  <button
                    type="button"
                    disabled={!canEditTriage}
                    onClick={() => handleOutcome('unreachable')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-amber-300 text-xs font-medium cursor-pointer disabled:opacity-40"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Unreachable — Escalate Scouting
                  </button>
                </div>
              </div>

              {/* Workflow History Log */}
              <div>
                <div className="text-xs font-semibold text-[#CBD5E1] mb-2">
                  Verification Workflow Records for {selectedDz.villageName} ({selectedDz.actions.length})
                </div>
                {selectedDz.actions.length === 0 ? (
                  <div className="p-4 rounded bg-[#090E17] border border-[#182336] text-xs text-[#6B7E9B]">
                    No verification actions logged yet for {selectedDz.villageName}. Initiate outreach above before assuming danger.
                  </div>
                ) : (
                  <div className="divide-y divide-[#182336] border border-[#182336] rounded bg-[#090E17]">
                    {selectedDz.actions.map((act) => (
                      <div key={act.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-semibold text-cyan-300">{act.actionType}</span>
                          <span className="text-[#6B7E9B]"> · by {act.initiatedBy}</span>
                          <div className="text-[#94A3B8] mt-0.5">{act.notes}</div>
                        </div>
                        <div className="text-right font-mono text-[11px] shrink-0">
                          <div className="text-emerald-400">{act.status}</div>
                          <div className="text-[#6B7E9B]">{act.timestamp}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[#090E17] border border-[#182336] text-xs text-[#94A3B8]">
              <strong className="text-cyan-300">{baseSelected.input.villageName}</strong> is an actively reporting benchmark village included for regional baseline contrast. Select a Potential Dark Zone village above to dispatch verification outreach or resolve silence outcomes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
