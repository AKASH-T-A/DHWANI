import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  ImageIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
  Split,
} from 'lucide-react';
import { LanguageBadge, VerificationLabel } from '../components/CommonWidgets';
import { EvidenceGraph } from '../components/EvidenceGraph';
import { analyzeDuplicateSimilarity, type DuplicateSimilarityResponse } from '../services/dhwaniApi';
import { useDhwani } from '../store/DhwaniContext';
import type { VerificationStatus } from '../types/dhwani';

const VERIFICATION_STATUSES: VerificationStatus[] = [
  'Unverified',
  'Corroborated',
  'Conflicting evidence',
  'Potentially recycled image',
  'Verified by coordinator',
];

export function EvidenceVerificationPage() {
  const {
    incidents,
    reports,
    evidenceRecords,
    selectedIncidentId,
    setSelectedIncidentId,
    systemStatus,
    canApproveOrDispatch,
    updateIncidentVerification,
    mergeIncidents,
    splitIncidentReport,
  } = useDhwani();

  const incident = incidents.find((i) => i.id === selectedIncidentId) ?? incidents[0];
  const [mergeSource, setMergeSource] = useState('');
  const [statusFeedback, setStatusFeedback] = useState('');
  const [scanningSimilarity, setScanningSimilarity] = useState(false);
  const [similarityScan, setSimilarityScan] = useState<DuplicateSimilarityResponse | null>(null);

  useEffect(() => {
    setSimilarityScan(null);
  }, [incident?.id]);

  if (!incident) return null;

  const otherIncidents = incidents.filter((i) => i.id !== incident.id);

  const handleRunSimilarityScan = async () => {
    setScanningSimilarity(true);
    setStatusFeedback('');
    const res = await analyzeDuplicateSimilarity({
      candidateMessage: incident.originalMessage,
      candidateTranslated: incident.processedMessage,
      candidateHazard: incident.hazard,
      candidateLocation: `${incident.location.placeName}, ${incident.location.taluk}`,
      candidateLanguage: incident.language,
      candidateAffectedPeople: incident.affectedPeople,
      existingIncidents: otherIncidents.map((inc) => ({
        id: inc.id,
        title: inc.title,
        originalMessage: inc.originalMessage,
        translatedMessage: inc.processedMessage,
        hazard: inc.hazard,
        language: inc.language,
        placeName: inc.location.placeName,
        taluk: inc.location.taluk,
        affectedPeople: inc.affectedPeople,
        receivedAt: inc.receivedAt,
      })),
      networkTier: systemStatus.networkTier,
    });
    setSimilarityScan(res);
    setScanningSimilarity(false);
  };

  const linkedReports = reports.filter((r) => r.incidentId === incident.id);
  const linkedEvidence = evidenceRecords.filter((e) => e.incidentId === incident.id);
  const recycledReports = reports.filter((r) => r.imageAttachment?.flaggedAsPotentiallyRecycled);

  const forwardReports = linkedReports.filter((r) => r.forwardChainDepth > 0 || Boolean(r.forwardedFromId));
  const independentSources = linkedReports.filter((r) => !r.isDuplicate && !r.forwardedFromId);
  const hasRecycledImg = linkedReports.some((r) => r.imageAttachment?.flaggedAsPotentiallyRecycled);
  const hasConflict =
    incident.verificationStatus === 'Conflicting evidence' ||
    linkedEvidence.some((e) => e.type === 'conflicting_claim');
  const hasSensorCorrob = linkedEvidence.some((e) => e.type === 'sensor_corroboration');

  const sixMechanisms: {
    name: string;
    status: string;
    detail: string;
    tone: 'emerald' | 'amber' | 'red' | 'cyan';
  }[] = [
    {
      name: '1. Duplicate Message Detection',
      status: incident.duplicateCount > 0 ? `${incident.duplicateCount} Suppressed` : 'No Duplicates',
      detail:
        incident.duplicateCount > 0
          ? 'Semantic & proximity clustering merged repeated messages without inflating priority.'
          : 'Single unique report stream currently tracked in this cluster.',
      tone: incident.duplicateCount > 0 ? 'cyan' : 'emerald',
    },
    {
      name: '2. Forward-Chain Detection',
      status: forwardReports.length > 0 ? `${forwardReports.length} Chain(s) Down-Weighted` : 'Original Signals',
      detail:
        forwardReports.length > 0
          ? `Max forward depth ${Math.max(...forwardReports.map((f) => f.forwardChainDepth))} traced to origin.`
          : 'No forwarded messaging chains detected in this cluster.',
      tone: forwardReports.length > 0 ? 'amber' : 'emerald',
    },
    {
      name: '3. Recycled Image Check (pHash)',
      status: hasRecycledImg ? 'Archive Match Flagged' : 'Clear / None Attached',
      detail: hasRecycledImg
        ? 'Perceptual hash matched prior archive — requires human coordinator verification.'
        : 'No attached photo matched historical disaster image archives.',
      tone: hasRecycledImg ? 'red' : 'emerald',
    },
    {
      name: '4. Conflicting Info Detection',
      status: hasConflict ? 'Conflict Detected' : 'Consistent',
      detail: hasConflict
        ? 'Contradictory field details identified; Active Triage or coordinator review needed.'
        : 'Linked reports agree on hazard category and general location.',
      tone: hasConflict ? 'red' : 'emerald',
    },
    {
      name: '5. Sensor Corroboration',
      status: hasSensorCorrob ? 'Corroborated' : 'Pending Sensor Match',
      detail: hasSensorCorrob
        ? 'Cross-checked against nearby river gauge and rainfall telemetry.'
        : 'No direct nearby gauge corroboration linked to this incident yet.',
      tone: hasSensorCorrob ? 'emerald' : 'amber',
    },
    {
      name: '6. Independent Source Verification',
      status:
        independentSources.length >= 2
          ? `${independentSources.length} Independent Sources`
          : `${independentSources.length} Primary Source`,
      detail:
        independentSources.length >= 2
          ? 'Confirmed across multiple non-forwarded reporters or channels.'
          : 'Awaiting second independent witness or coordinator confirmation.',
      tone: independentSources.length >= 2 ? 'emerald' : 'amber',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            EVIDENCE GRAPH & RUMOUR DEFENCE
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7]">
            Duplicate Fusion, Forward-Chain & Perceptual Image Verification
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
            Merges duplicate messages using cross-lingual Gemini semantic similarity, geographic/time proximity, and forward chains so viral forwards do not drown out remote single-report emergencies.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-[#8B9BB4]">Inspect Cluster:</label>
          <select
            value={incident.id}
            onChange={(e) => {
              setSelectedIncidentId(e.target.value);
              setStatusFeedback('');
            }}
            className="px-3 py-2 text-xs bg-[#0F1623] border border-[#243652] rounded-md text-[#E6EDF7] font-mono max-w-[300px]"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id} · {inc.verificationStatus} ({inc.location.placeName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive Provenance Evidence Graph */}
      <EvidenceGraph
        incident={incident}
        reports={reports}
        evidenceRecords={evidenceRecords}
      />

      {/* AI Cross-Lingual Duplicate Similarity & Conflict Scan */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#182336]">
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              AI Cross-Lingual Duplicate & Conflict Similarity Scan ({incident.id})
            </h2>
            <p className="text-xs text-[#8B9BB4] mt-0.5">
              Compares {incident.id} against {otherIncidents.length} other active incident clusters across Kannada, Tulu, Malayalam, Konkani, Hindi, and English.
            </p>
          </div>
          <button
            type="button"
            disabled={scanningSimilarity || otherIncidents.length === 0}
            onClick={handleRunSimilarityScan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {scanningSimilarity ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {scanningSimilarity ? 'Scanning Active Clusters...' : 'Run AI Similarity Scan'}
          </button>
        </div>

        {!similarityScan ? (
          <div className="text-xs text-[#6B7E9B]">
            Run an on-demand server-side Gemini similarity scan (with automatic offline/local rule fallback) to detect overlapping reports, cross-lingual duplicates, or conflicting field claims.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span
                className={
                  similarityScan.provider === 'gemini-4-hydrogen' ? 'text-emerald-400' : 'text-amber-400'
                }
              >
                Engine: {similarityScan.provider} · Validated: {similarityScan.validated ? 'YES' : 'NO'}
              </span>
              <span
                className={
                  similarityScan.result.overallDuplicateRisk === 'High'
                    ? 'text-red-400 font-semibold'
                    : similarityScan.result.overallDuplicateRisk === 'Moderate'
                      ? 'text-amber-400 font-semibold'
                      : 'text-emerald-400 font-semibold'
                }
              >
                Duplicate Risk: {similarityScan.result.overallDuplicateRisk}
              </span>
            </div>

            {similarityScan.warning && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                {similarityScan.warning}
              </div>
            )}

            <div className="text-xs text-[#CBD5E1]">{similarityScan.result.analysisSummary}</div>

            {similarityScan.validationChecks.length > 0 && (
              <div className="text-[11px] font-mono text-[#6B7E9B]">
                Guardrails: {similarityScan.validationChecks.join(' · ')}
              </div>
            )}

            {similarityScan.result.matches.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {similarityScan.result.matches.map((m) => {
                  const matchedInc = incidents.find((i) => i.id === m.incidentId);
                  return (
                    <div
                      key={m.incidentId}
                      className={`p-3 rounded border text-xs space-y-2 ${
                        m.conflictingSignals.length > 0
                          ? 'bg-red-500/10 border-red-500/30'
                          : m.similarityScore >= 0.65
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-[#090E17] border-[#182336]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-cyan-400 font-semibold">{m.incidentId}</span>
                          <span className="text-[#E6EDF7]">{Math.round(m.similarityScore * 100)}% sim</span>
                          <span className="text-amber-300">{m.matchClassification}</span>
                        </div>
                        <span className="text-[11px] font-mono text-[#8B9BB4]">{m.recommendedAction}</span>
                      </div>
                      {matchedInc && (
                        <div className="text-[#E6EDF7] font-medium">
                          {matchedInc.title} ({matchedInc.language})
                        </div>
                      )}
                      <p className="text-[#94A3B8] leading-relaxed">{m.rationale}</p>
                      <div className="text-[11px] text-emerald-300/90">
                        Shared: {m.sharedSignals.join(' · ')}
                      </div>
                      {m.conflictingSignals.length > 0 && (
                        <div className="text-[11px] text-red-300">
                          Conflicts: {m.conflictingSignals.join(' · ')}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {matchedInc && (
                          <button
                            type="button"
                            disabled={!canApproveOrDispatch}
                            onClick={() => {
                              mergeIncidents(m.incidentId, incident.id);
                              setStatusFeedback(`Merged ${m.incidentId} into ${incident.id} per AI similarity match.`);
                              setSimilarityScan(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium cursor-pointer disabled:opacity-40"
                          >
                            <GitMerge className="w-3 h-3" />
                            Merge {m.incidentId} → {incident.id}
                          </button>
                        )}
                        {m.conflictingSignals.length > 0 && (
                          <button
                            type="button"
                            disabled={!canApproveOrDispatch}
                            onClick={() => {
                              updateIncidentVerification(
                                incident.id,
                                'Conflicting evidence',
                                `Flagged conflict with ${m.incidentId}: ${m.conflictingSignals.join('; ')}`
                              );
                              setStatusFeedback(`Flagged ${incident.id} as Conflicting evidence.`);
                            }}
                            className="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-[11px] font-medium cursor-pointer disabled:opacity-40"
                          >
                            Flag Conflict on {incident.id}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                No duplicate or conflicting clusters found for {incident.id}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6-Mechanism Rumour Defence Status Matrix */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
          <h2 className="text-sm font-semibold text-[#E6EDF7]">
            6-Mechanism Rumour Defence & Verification Status ({incident.id})
          </h2>
          <span className="text-[11px] font-mono text-[#8B9BB4]">
            Automated advisory signals — coordinators retain final verification authority
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sixMechanisms.map((m) => (
            <div key={m.name} className="p-3 rounded bg-[#090E17] border border-[#182336] text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#E6EDF7]">{m.name}</span>
                <span
                  className={`font-mono text-[11px] whitespace-nowrap ${
                    m.tone === 'emerald'
                      ? 'text-emerald-400'
                      : m.tone === 'cyan'
                        ? 'text-cyan-400'
                        : m.tone === 'amber'
                          ? 'text-amber-400'
                          : 'text-red-400'
                  }`}
                >
                  {m.status}
                </span>
              </div>
              <p className="text-[11.5px] text-[#8B9BB4] leading-relaxed">{m.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Evidence Reasoning + Coordinator Verification Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Linked Raw Reports & Forward-Chain / pHash Checks */}
        <div className="xl:col-span-7 bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Fused Reports & Forward Chains ({linkedReports.length} linked)
            </h2>
            <span className="text-xs font-mono text-[#8B9BB4]">
              PII Redaction: {systemStatus.piiRedactionEnabled ? 'ON (DPDP 2023)' : 'OFF'}
            </span>
          </div>

          <div className="divide-y divide-[#182336]">
            {linkedReports.map((rep) => (
              <div key={rep.id} className="p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span className="text-cyan-400 font-semibold">{rep.id}</span>
                    <span className="text-[#475569]">·</span>
                    <span className="text-[#CBD5E1]">{rep.sourceChannel}</span>
                    <span className="text-[#475569]">·</span>
                    <LanguageBadge language={rep.language} />
                    <span className="text-[#475569]">·</span>
                    <span className="text-[#8B9BB4]">{rep.receivedAt}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    {rep.forwardChainDepth > 0 && (
                      <span className="text-amber-400">Fwd depth {rep.forwardChainDepth}</span>
                    )}
                    <span className="text-[#8B9BB4]">
                      Sim {Math.round(rep.similarityScore * 100)}%
                    </span>
                    {linkedReports.length > 1 && (
                      <button
                        type="button"
                        disabled={!canApproveOrDispatch}
                        onClick={() => {
                          splitIncidentReport(incident.id, rep.id);
                          setStatusFeedback(`Split ${rep.id} into standalone incident.`);
                        }}
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer disabled:opacity-40"
                      >
                        <Split className="w-3 h-3" />
                        Split
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[#E6EDF7]">“{rep.originalMessage}”</div>
                <div className="text-[#94A3B8]">Translated: {rep.translatedMessage}</div>
                <div className="text-[11px] font-mono text-[#6B7E9B]">
                  Reporter: {systemStatus.piiRedactionEnabled ? `${rep.reporterAlias} (${rep.reporterPhoneMasked})` : `${rep.reporterAlias} (${rep.reporterPhoneRaw})`}
                  {rep.forwardedFromId ? ` · Forwarded from ${rep.forwardedFromId}` : ''}
                </div>

                {rep.imageAttachment && (
                  <div className="mt-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                    <ImageIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-amber-200 font-medium">
                        {rep.imageAttachment.flaggedAsPotentiallyRecycled
                          ? 'Potentially Recycled Image Flag (pHash Check)'
                          : 'Attached Photo Hashed'}
                      </div>
                      <div className="text-[#CBD5E1] mt-0.5">{rep.imageAttachment.caption}</div>
                      <div className="text-[11px] font-mono text-[#94A3B8] mt-0.5">
                        pHash: {rep.imageAttachment.pHash}
                        {rep.imageAttachment.hammingDistance !== undefined
                          ? ` · Hamming Distance: ${rep.imageAttachment.hammingDistance} (Archive ${rep.imageAttachment.matchedArchiveYear})`
                          : ''}
                      </div>
                      <div className="text-[11px] text-amber-300/90 mt-1">
                        Responsible AI Policy: An older or duplicated image is never automatically declared fake; human verification is required.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Verification Reasoning, Rumour Checks & Merge Controls */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#182336]">
              <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Reliability Assessment
              </h2>
              <VerificationLabel status={incident.verificationStatus} />
            </div>

            {statusFeedback && (
              <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {statusFeedback}
              </div>
            )}

            {/* Evidence Records */}
            <div className="space-y-2">
              {linkedEvidence.map((ev) => (
                <div key={ev.id} className="p-3 rounded bg-[#090E17] border border-[#182336] text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#E6EDF7]">{ev.label}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        ev.reliabilityDelta > 0
                          ? 'text-emerald-400'
                          : ev.reliabilityDelta < 0
                            ? 'text-red-400'
                            : 'text-[#8B9BB4]'
                      }`}
                    >
                      {ev.reliabilityDelta > 0 ? `+${ev.reliabilityDelta}` : ev.reliabilityDelta} rel
                    </span>
                  </div>
                  <p className="text-[#94A3B8] mt-1 leading-relaxed">{ev.detail}</p>
                </div>
              ))}
            </div>

            {/* Update Verification Status */}
            <div className="pt-3 border-t border-[#182336] space-y-2">
              <div className="text-xs font-medium text-[#CBD5E1]">Set Verification Status</div>
              <div className="flex flex-wrap gap-1.5">
                {VERIFICATION_STATUSES.map((st) => (
                  <button
                    key={st}
                    disabled={!canApproveOrDispatch}
                    onClick={() => {
                      updateIncidentVerification(incident.id, st);
                      setStatusFeedback(`Updated ${incident.id} status to "${st}".`);
                    }}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium border cursor-pointer transition-colors disabled:opacity-40 ${
                      incident.verificationStatus === st
                        ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-[#151F30] border-[#243652] text-[#CBD5E1] hover:bg-[#1E2E47]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Merge Another Incident into this Cluster */}
            <div className="pt-3 border-t border-[#182336] space-y-2">
              <div className="text-xs font-medium text-[#CBD5E1]">
                Merge Duplicate Incident into {incident.id}
              </div>
              <div className="flex gap-2">
                <select
                  value={mergeSource}
                  onChange={(e) => setMergeSource(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1]"
                >
                  <option value="">Select duplicate incident...</option>
                  {incidents
                    .filter((i) => i.id !== incident.id)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.id} — {i.title.slice(0, 38)}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!mergeSource || !canApproveOrDispatch}
                  onClick={() => {
                    mergeIncidents(mergeSource, incident.id);
                    setStatusFeedback(`Merged ${mergeSource} into ${incident.id}.`);
                    setMergeSource('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Merge
                </button>
              </div>
            </div>
          </div>

          {/* Perceptual Hashing Queue Summary */}
          <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-2.5">
            <div className="text-xs font-semibold text-[#E6EDF7] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Perceptual Image Hash (pHash) Watchlist ({recycledReports.length})
            </div>
            {recycledReports.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedIncidentId(r.incidentId)}
                className="p-2.5 rounded bg-[#090E17] border border-[#182336] hover:border-amber-500/40 cursor-pointer text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-amber-300">{r.incidentId} · {r.id}</span>
                  <span className="text-[#6B7E9B]">Archive {r.imageAttachment?.matchedArchiveYear}</span>
                </div>
                <div className="text-[#94A3B8] mt-1">{r.imageAttachment?.caption}</div>
              </div>
            ))}
            <div className="text-[11px] text-[#6B7E9B] flex items-center gap-1.5 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              Compatible with DCT perceptual hashing & HDBSCAN semantic clustering backend.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
