import { useEffect, useMemo, useState } from 'react';
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
import {
  CheckCircle2,
  Compass,
  GitMerge,
  MapPin,
  ShieldAlert,
  Sliders,
  Split,
} from 'lucide-react';
import {
  ConfidenceIndicator,
  LanguageBadge,
  VerificationLabel,
} from '../components/CommonWidgets';
import { NeedScoreBreakdown } from '../components/NeedScoreBreakdown';
import { matchLandmarkCoordinates } from '../services/localAiFallback';
import { useDhwani } from '../store/DhwaniContext';

export function IncidentIntelligencePage() {
  const {
    incidents,
    reports,
    scenarioMeta,
    selectedIncidentId,
    setSelectedIncidentId,
    systemStatus,
    canApproveOrDispatch,
    canEditTriage,
    approveIncidentPriority,
    overrideIncidentScore,
    updateIncidentVerification,
    updateIncidentLocation,
    updateIncidentReportingRate,
    mergeIncidents,
    splitIncidentReport,
    requestAdditionalEvidence,
    setActiveModule,
  } = useDhwani();

  const incident =
    incidents.find((i) => i.id === selectedIncidentId) ?? incidents[0];

  // Interactive Reporting-Bias Simulator controls (synced with selected incident)
  const [simRawReports, setSimRawReports] = useState(incident?.needEstimate.rawReportCount ?? 5);
  const [simReportingRate, setSimReportingRate] = useState(
    Math.max(5, Math.round((incident?.needEstimate.expectedReportingRate ?? 0.1) * 100))
  );

  // Interactive Vague Landmark Phrase Resolver
  const [landmarkQuery, setLandmarkQuery] = useState(incident?.location.landmark ?? '');
  const [resolvedPreview, setResolvedPreview] = useState<{
    name: string;
    taluk: string;
    lat: number;
    lng: number;
    radius: number;
    precision: 'approximate' | 'uncertain';
    confidence: number;
  } | null>(null);

  useEffect(() => {
    if (!incident) return;
    setSimRawReports(Math.max(1, incident.needEstimate.rawReportCount));
    setSimReportingRate(Math.max(5, Math.min(100, Math.round(incident.needEstimate.expectedReportingRate * 100))));
    setLandmarkQuery(incident.location.landmark);
    setResolvedPreview(null);
  }, [incident?.id]);

  // Coordinator Override controls
  const [overrideScore, setOverrideScore] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [evidenceNote, setEvidenceNote] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string>('');

  const biasComparisonChartData = useMemo(() => {
    return incidents.map((inc) => ({
      name: inc.location.placeName.split(' ')[0],
      fullPlace: inc.location.placeName,
      rawReports: inc.needEstimate.rawReportCount,
      biasAdjustedNeed: Math.round(inc.needEstimate.biasCorrectedNeedIndex),
      finalScore: inc.needEstimate.finalNeedScore,
    }));
  }, [incidents]);

  if (!incident) {
    return (
      <div className="p-8 text-center text-sm text-[#8B9BB4] bg-[#0F1623] border border-[#1E2B40] rounded-lg">
        No incidents available in the current scenario.
      </div>
    );
  }

  const linkedReports = reports.filter((r) => r.incidentId === incident.id);
  const simulatedAdjustedNeed = Math.round((simRawReports / Math.max(5, simReportingRate)) * 100);

  const handleResolvePhrase = (phraseOverride?: string) => {
    const q = (phraseOverride ?? landmarkQuery).trim();
    if (!q) return;
    if (phraseOverride) setLandmarkQuery(phraseOverride);
    const match = matchLandmarkCoordinates(q);
    const precision = match.radius <= 600 ? 'approximate' : 'uncertain';
    const confidence = match.radius <= 350 ? 0.78 : match.radius <= 600 ? 0.68 : 0.52;
    setResolvedPreview({
      name: match.name,
      taluk: match.taluk,
      lat: match.lat,
      lng: match.lng,
      radius: match.radius,
      precision,
      confidence,
    });
  };

  const handleApplyResolvedLocation = () => {
    if (!resolvedPreview || !canEditTriage) return;
    updateIncidentLocation(incident.id, {
      placeName: resolvedPreview.name,
      landmark: landmarkQuery.trim() || resolvedPreview.name,
      taluk: resolvedPreview.taluk,
      lat: resolvedPreview.lat,
      lng: resolvedPreview.lng,
      precision: resolvedPreview.precision,
      uncertaintyRadiusMeters: resolvedPreview.radius,
      confidence: resolvedPreview.confidence,
      candidateMatches: [
        {
          name: resolvedPreview.name,
          matchScore: resolvedPreview.confidence,
          distanceHint: `Resolved landmark zone (±${resolvedPreview.radius}m)`,
        },
        ...incident.location.candidateMatches.filter((c) => c.name !== resolvedPreview.name).slice(0, 2),
      ],
    });
    setActionMessage(
      `Location estimate updated for ${incident.id}: ${resolvedPreview.name} (±${resolvedPreview.radius}m, never fabricated as GPS).`
    );
    setResolvedPreview(null);
  };

  const handleOverrideSubmit = () => {
    const val = parseInt(overrideScore, 10);
    if (!Number.isFinite(val) || !overrideReason.trim()) return;
    overrideIncidentScore(incident.id, val, overrideReason.trim());
    setOverrideScore('');
    setOverrideReason('');
    setActionMessage(`Coordinator override logged for ${incident.id} (New score: ${val}/100).`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Incident Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF7]">
            Incident Intelligence, Geo-Resolution & Need Estimator
          </h1>
          <p className="mt-1 text-xs text-[#8B9BB4]">
            Explainable Glass-Box prioritization, landmark uncertainty resolution, and reporting-bias correction. Human coordinators retain final operational authority.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-[#8B9BB4]">Inspect Incident:</label>
          <select
            value={incident.id}
            onChange={(e) => {
              setSelectedIncidentId(e.target.value);
              setActionMessage('');
            }}
            className="px-3 py-2 text-xs bg-[#0F1623] border border-[#243652] rounded-md text-[#E6EDF7] font-mono max-w-[300px]"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id} ({inc.needEstimate.finalNeedScore}/100) — {inc.location.placeName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flagged for Human Review Banner (< threshold confidence) */}
      {incident.flaggedForHumanReview && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Flagged for Human Review:</strong> AI extraction confidence (
              {Math.round(incident.confidence * 100)}%) is below the{' '}
              {Math.round(systemStatus.humanReviewThreshold * 100)}% threshold. Verify details or run Active Triage before dispatch.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('active-triage')}
            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium cursor-pointer"
          >
            Open Active Triage
          </button>
        </div>
      )}

      {/* Row 1: Multilingual Breakdown + Landmark Geo-Resolver */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Multilingual Intelligence Card */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
            <div>
              <div className="text-xs font-mono text-[#8B9BB4]">
                {incident.id} · {incident.receivedAt} · {incident.source}
              </div>
              <h2 className="mt-0.5 text-base font-semibold text-[#E6EDF7]">{incident.title}</h2>
            </div>
            <VerificationLabel status={incident.verificationStatus} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#6B7E9B] font-mono">Original Message</span>
                <LanguageBadge language={incident.language} />
              </div>
              <p className="text-xs text-[#E6EDF7] leading-relaxed">{incident.originalMessage}</p>
            </div>
            <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
              <div className="text-[11px] font-mono text-cyan-400 mb-1">English Interpretation</div>
              <p className="text-xs text-[#E6EDF7] leading-relaxed">{incident.processedMessage}</p>
            </div>
          </div>

          {/* Per-field Confidence */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            {(
              [
                ['Language', incident.fieldConfidence.language],
                ['Hazard', incident.fieldConfidence.hazard],
                ['Location', incident.fieldConfidence.location],
                ['Population', incident.fieldConfidence.population],
                ['Vulnerability', incident.fieldConfidence.vulnerability],
              ] as [string, number][]
            ).map(([lbl, val]) => (
              <div key={lbl} className="p-2 rounded bg-[#0B121F] border border-[#182336]">
                <div className="text-[11px] text-[#6B7E9B]">{lbl}</div>
                <div className="mt-1">
                  <ConfidenceIndicator confidence={val} compact />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-[#8B9BB4] font-medium">Affected & Vulnerable Persons</div>
              <div className="mt-1 text-[#E6EDF7] font-mono tabular-nums">
                Affected: {incident.affectedPeople !== null ? `${incident.affectedPeople} people` : 'Unknown'}
              </div>
              <div className="mt-0.5 text-amber-300">
                Vulnerable: {incident.vulnerableGroups.length > 0 ? incident.vulnerableGroups.join(', ') : 'None noted'}
              </div>
            </div>
            <div>
              <div className="text-[#8B9BB4] font-medium">Missing Information</div>
              {incident.missingInformation.length === 0 ? (
                <div className="mt-1 text-emerald-400">All critical triage fields resolved.</div>
              ) : (
                <ul className="mt-1 list-disc pl-4 text-[#CBD5E1] space-y-0.5">
                  {incident.missingInformation.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Landmark Location Resolver */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#182336]">
            <div>
              <h2 className="text-base font-semibold text-[#E6EDF7] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                Location Resolver & Uncertainty Zone
              </h2>
              <p className="text-xs text-[#8B9BB4] mt-0.5">
                Never fabricates GPS when only a landmark is mentioned. Resolves vague phrases to bounded uncertainty polygons.
              </p>
            </div>
            <span
              className={`text-xs font-mono font-medium capitalize ${
                incident.location.precision === 'verified'
                  ? 'text-emerald-400'
                  : incident.location.precision === 'approximate'
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}
            >
              {incident.location.precision} location
            </span>
          </div>

          {/* Precision Tier Scale (Verified vs Approximate vs Uncertain) */}
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
            {(
              [
                ['verified', 'Verified GPS', '≤25m pin'],
                ['approximate', 'Approx. Landmark', '100–600m zone'],
                ['uncertain', 'Uncertain Area', '>600m radius'],
              ] as const
            ).map(([tier, label, range]) => {
              const active = incident.location.precision === tier;
              return (
                <div
                  key={tier}
                  className={`px-2.5 py-1.5 rounded border ${
                    active
                      ? tier === 'verified'
                        ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-300'
                        : tier === 'approximate'
                          ? 'bg-amber-500/15 border-amber-500/45 text-amber-300'
                          : 'bg-red-500/15 border-red-500/45 text-red-300'
                      : 'bg-[#090E17] border-[#182336] text-[#6B7E9B]'
                  }`}
                >
                  <div className="font-semibold">{label}</div>
                  <div className="text-[10px] opacity-80">{range}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
              <div className="text-[#6B7E9B] text-[11px]">GPS Coordinates</div>
              <div className="mt-0.5 font-mono text-[#E6EDF7]">
                {incident.location.gpsAvailable ? 'Available' : 'Not Available'}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
              <div className="text-[#6B7E9B] text-[11px]">Uncertainty Radius</div>
              <div className="mt-0.5 font-mono text-amber-300 tabular-nums">
                ±{incident.location.uncertaintyRadiusMeters} m
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
              <div className="text-[#6B7E9B] text-[11px]">Location Confidence</div>
              <div className="mt-0.5 font-mono text-cyan-300 tabular-nums">
                {Math.round(incident.location.confidence * 100)}%
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
              <div className="text-[#6B7E9B] text-[11px]">Taluk / Area Type</div>
              <div className="mt-0.5 text-[#E6EDF7] truncate">
                {incident.location.taluk} · {incident.areaType}
              </div>
            </div>
          </div>

          {/* Interactive Vague Landmark Phrase Resolver */}
          <div className="p-3 rounded bg-[#0B121F] border border-[#1E2B40] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#E6EDF7] inline-flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                Test / Refine Vague Landmark Phrase
              </span>
              <button
                type="button"
                onClick={() => handleResolvePhrase('Behind the temple near the old bridge.')}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Try: “Behind the temple near the old bridge.”
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={landmarkQuery}
                onChange={(e) => setLandmarkQuery(e.target.value)}
                placeholder="Enter vague landmark (e.g. Behind temple near old bridge)..."
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
              <button
                type="button"
                onClick={() => handleResolvePhrase()}
                className="px-3 py-1.5 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Resolve Landmark
              </button>
            </div>

            {resolvedPreview && (
              <div className="p-2.5 rounded bg-[#090E17] border border-cyan-500/35 text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-cyan-300 font-medium">
                    Candidate: {resolvedPreview.name} ({resolvedPreview.taluk} Taluk)
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9BB4] tabular-nums">
                    Zone: ±{resolvedPreview.radius}m ({resolvedPreview.precision}) · Match{' '}
                    {Math.round(resolvedPreview.confidence * 100)}% · Simulated gazetteer centroid
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canEditTriage}
                  onClick={handleApplyResolvedLocation}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  Apply to Incident
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-[#8B9BB4] mb-1.5">
              Extracted Landmark Phrase: <span className="text-[#E6EDF7]">“{incident.location.landmark}”</span>
            </div>
            <div className="space-y-1.5">
              {incident.location.candidateMatches.map((cm) => (
                <div
                  key={cm.name}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-[#090E17] border border-[#182336] text-xs"
                >
                  <div>
                    <div className="text-[#E6EDF7] font-medium">{cm.name}</div>
                    <div className="text-[11px] text-[#6B7E9B]">{cm.distanceHint}</div>
                  </div>
                  <span className="font-mono text-cyan-400 tabular-nums">
                    {Math.round(cm.matchScore * 100)}% match
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs bg-[#0B121F] border border-[#182336] rounded p-3">
            <span className="text-[#8B9BB4] font-medium">Still required to tighten zone: </span>
            <span className="text-[#CBD5E1]">
              {incident.location.requiredForResolution.join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Glass-Box Score Breakdown + Human-in-the-Loop Coordinator Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7">
          <NeedScoreBreakdown
            needEstimate={incident.needEstimate}
            overriddenScore={incident.coordinatorDecision.overriddenScore}
            overrideReason={incident.coordinatorDecision.overrideReason}
            confidence={incident.confidence}
            humanReviewThreshold={systemStatus.humanReviewThreshold}
            missingInformation={incident.missingInformation}
          />
        </div>

        {/* Human-in-the-Loop Controls */}
        <div className="xl:col-span-5 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-[#182336]">
            <h3 className="text-base font-semibold text-[#E6EDF7]">
              Human-in-the-Loop Coordinator Controls
            </h3>
            <p className="text-xs text-[#8B9BB4] mt-0.5">
              AI recommendations are advisory. Every action creates an immutable audit log entry.
            </p>
          </div>

          {!canApproveOrDispatch && (
            <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              Current role has limited permissions. Switch to District Emergency Coordinator in Settings to approve, split, merge, or override priorities.
            </div>
          )}

          {actionMessage && (
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              {actionMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canApproveOrDispatch}
              onClick={() => {
                approveIncidentPriority(incident.id);
                setActionMessage(`Priority approved for ${incident.id} and logged.`);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {incident.coordinatorDecision.approved ? 'Priority Approved' : 'Approve Priority'}
            </button>

            <button
              type="button"
              disabled={!canApproveOrDispatch}
              onClick={() => {
                updateIncidentVerification(incident.id, 'Verified by coordinator', 'Verified via control room review');
                setActionMessage(`${incident.id} marked Verified by Coordinator.`);
              }}
              className="px-3 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-[#E6EDF7] text-xs font-medium cursor-pointer disabled:opacity-40"
            >
              Mark as Verified
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('rescue-coordination')}
              className="px-3 py-2 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium cursor-pointer"
            >
              Assign Rescue Team →
            </button>
          </div>

          {/* Score Override Form */}
          <div className="pt-3 border-t border-[#182336] space-y-2">
            <div className="text-xs font-medium text-[#CBD5E1]">Override Need Score (Requires Reason)</div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={overrideScore}
                onChange={(e) => setOverrideScore(e.target.value)}
                placeholder="0-100"
                className="w-24 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] font-mono"
              />
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Mandatory operational override reason..."
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
              <button
                type="button"
                disabled={!canApproveOrDispatch || !overrideScore || !overrideReason.trim()}
                onClick={handleOverrideSubmit}
                className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Override
              </button>
            </div>
          </div>

          {/* Merge / Split / Request Evidence */}
          <div className="pt-3 border-t border-[#182336] space-y-2.5">
            <div className="flex gap-2">
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1]"
              >
                <option value="">Merge this incident into...</option>
                {incidents
                  .filter((i) => i.id !== incident.id)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.id} — {i.location.placeName}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!mergeTargetId || !canApproveOrDispatch}
                onClick={() => {
                  mergeIncidents(incident.id, mergeTargetId);
                  setMergeTargetId('');
                  setActionMessage('Incidents merged into unified record.');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-xs text-[#E6EDF7] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge
              </button>
            </div>

            {linkedReports.length > 1 && (
              <div className="flex items-center justify-between gap-2 text-xs bg-[#090E17] border border-[#182336] rounded px-3 py-2">
                <span className="text-[#8B9BB4] truncate">
                  Split secondary report ({linkedReports[linkedReports.length - 1].id}) into new incident
                </span>
                <button
                  type="button"
                  disabled={!canApproveOrDispatch}
                  onClick={() => {
                    splitIncidentReport(incident.id, linkedReports[linkedReports.length - 1].id);
                    setActionMessage('Report split into standalone incident.');
                  }}
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer shrink-0 disabled:opacity-40"
                >
                  <Split className="w-3.5 h-3.5" />
                  Split
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Request additional field evidence..."
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
              <button
                type="button"
                disabled={!evidenceNote.trim() || !canEditTriage}
                onClick={() => {
                  requestAdditionalEvidence(incident.id, evidenceNote.trim());
                  setEvidenceNote('');
                  setActionMessage('Additional evidence request added to missing details.');
                }}
                className="px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-xs text-[#CBD5E1] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Request Evidence
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: NEED ESTIMATOR — CORE INNOVATION */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#182336]">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              CORE INNOVATION · SIMPLIFIED PROTOTYPE FORMULA (FUTURE BACKEND: PyMC BAYESIAN MODEL)
            </div>
            <h2 className="mt-1 text-base font-semibold text-[#E6EDF7] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Need Estimator — Reporting-Bias Correction
            </h2>
            <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
              Traditional dashboards sort by raw message volume. DHWANI estimates actual need using{' '}
              <span className="font-mono text-[#E6EDF7]">Need Estimate = Reports / Expected Reporting Rate</span>{' '}
              accounting for connectivity, population, language access, literacy, and historical baselines.
            </p>
          </div>
        </div>

        {/* Selected Incident Contextual Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[11px] text-[#6B7E9B]">Population Context</div>
            <div className="mt-0.5 font-mono text-[#E6EDF7] font-semibold tabular-nums">
              {incident.needEstimate.populationContext.toLocaleString()}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[11px] text-[#6B7E9B]">Connectivity Score</div>
            <div className="mt-0.5 font-mono text-amber-300 font-semibold tabular-nums">
              {incident.needEstimate.connectivityScore}%
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[11px] text-[#6B7E9B]">Language Access</div>
            <div className="mt-0.5 font-mono text-cyan-300 font-semibold tabular-nums">
              {incident.needEstimate.languageAccessibility}%
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[11px] text-[#6B7E9B]">Literacy Access</div>
            <div className="mt-0.5 font-mono text-[#CBD5E1] font-semibold tabular-nums">
              {incident.needEstimate.literacyAccessScore}%
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[11px] text-[#6B7E9B]">Historical Baseline</div>
            <div className="mt-0.5 font-mono text-[#CBD5E1] font-semibold tabular-nums">
              {Math.round(incident.needEstimate.historicalBaselineRate * 100)}% rate
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#090E17] border border-cyan-500/35">
            <div className="text-[11px] text-cyan-400">Incident Need Index</div>
            <div className="mt-0.5 font-mono text-[#E6EDF7] font-semibold tabular-nums">
              {incident.needEstimate.rawReportCount} ÷ {Math.round(incident.needEstimate.expectedReportingRate * 100)}% ={' '}
              {incident.needEstimate.biasCorrectedNeedIndex}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Interactive Sliders + City vs Village Proof */}
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded bg-[#090E17] border border-[#1E2B40]">
                <div className="text-[#8B9BB4]">Connected City Example</div>
                <div className="mt-1 font-mono text-sm text-[#E6EDF7] tabular-nums">50 reports ÷ 100% rate</div>
                <div className="mt-1 font-mono text-cyan-400 font-semibold">Adjusted Need: 50</div>
              </div>
              <div className="p-3 rounded bg-[#090E17] border border-orange-500/35">
                <div className="text-amber-300">Remote Village Example</div>
                <div className="mt-1 font-mono text-sm text-[#E6EDF7] tabular-nums">5 reports ÷ 10% rate</div>
                <div className="mt-1 font-mono text-orange-400 font-semibold">Adjusted Need: 50</div>
              </div>
            </div>

            {/* Interactive Inspector synced to selected incident */}
            <div className="p-4 rounded bg-[#0B121F] border border-[#182336] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#E6EDF7]">
                  Sensitivity Explorer ({incident.id})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimRawReports(Math.max(1, incident.needEstimate.rawReportCount));
                    setSimReportingRate(
                      Math.max(5, Math.min(100, Math.round(incident.needEstimate.expectedReportingRate * 100)))
                    );
                  }}
                  className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Reset to Incident Baseline
                </button>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#94A3B8]">Raw Reports Received</span>
                  <span className="font-mono text-[#E6EDF7] tabular-nums">{simRawReports} reports</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={simRawReports}
                  onChange={(e) => setSimRawReports(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#94A3B8]">Expected Reporting Rate (Connectivity & Access)</span>
                  <span className="font-mono text-amber-400 tabular-nums">{simReportingRate}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={simReportingRate}
                  onChange={(e) => setSimReportingRate(Number(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div className="pt-2 border-t border-[#182336] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-[#8B9BB4]">Bias-Corrected Estimate: </span>
                  <span className="font-mono text-base font-semibold text-cyan-400 tabular-nums">
                    {simulatedAdjustedNeed}{' '}
                    <span className="text-xs text-[#6B7E9B]">(±{Math.round(simulatedAdjustedNeed * 0.18)})</span>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!canApproveOrDispatch}
                  onClick={() => {
                    updateIncidentReportingRate(incident.id, simReportingRate / 100);
                    setActionMessage(
                      `Recalibrated expected reporting rate for ${incident.id} to ${simReportingRate}% and updated bias-correction score.`
                    );
                  }}
                  className="px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  Apply Rate to Incident
                </button>
              </div>
            </div>
          </div>

          {/* Live Scenario Chart: Raw Reports vs Bias-Corrected Need */}
          <div className="lg:col-span-7">
            <div className="text-xs font-medium text-[#CBD5E1] mb-2">
              {scenarioMeta.name}: Raw Message Volume vs Bias-Corrected Need Score
            </div>
            <div className="h-[260px] w-full bg-[#090E17] border border-[#182336] rounded p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={biasComparisonChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                  <XAxis dataKey="name" tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1623',
                      border: '1px solid #243652',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#E6EDF7',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="rawReports" name="Raw Message Count" fill="#475569" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="finalScore" name="DHWANI Bias-Corrected Score" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
