import { useEffect, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  FileJson,
  GitMerge,
  ImageIcon,
  Languages,
  Loader2,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { ConfidenceIndicator, LanguageBadge } from '../components/CommonWidgets';
import { IncidentTable } from '../components/IncidentTable';
import {
  analyzeDuplicateSimilarity,
  processEmergencyReport,
  type DuplicateSimilarityResponse,
  type ProcessReportResponse,
} from '../services/dhwaniApi';
import { matchLandmarkCoordinates, type DuplicateSimilarityMatch } from '../services/localAiFallback';
import { useDhwani } from '../store/DhwaniContext';
import type {
  EmergencyReport,
  EvidenceRecord,
  HazardCategory,
  Incident,
  SourceChannel,
  SupportedLanguage,
} from '../types/dhwani';

const ALL_CHANNELS: SourceChannel[] = [
  'SMS',
  'Missed-call IVR',
  'WhatsApp text',
  'WhatsApp voice note',
  'WhatsApp photo',
  'Telegram',
  'Emergency call transcript',
  'Social media',
  'Rainfall sensor',
  'River gauge sensor',
  'Volunteer PWA',
];

const INTERNET_ONLY_CHANNELS = new Set<SourceChannel>([
  'WhatsApp text',
  'WhatsApp voice note',
  'WhatsApp photo',
  'Telegram',
  'Social media',
]);

function computeDeterministicPHash(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

const SAMPLE_PRESETS: {
  label: string;
  language: SupportedLanguage;
  channel: SourceChannel;
  location: string;
  message: string;
}[] = [
  {
    label: 'Kannada — Uppinangady Rooftop',
    language: 'Kannada',
    channel: 'SMS',
    location: 'Behind Uppinangady temple',
    message: 'Uppinangady devasthana hinde neeru bandide, mane mele 4 jana, ajji ide.',
  },
  {
    label: 'Kannada — Water Entering Home',
    language: 'Kannada',
    channel: 'Missed-call IVR',
    location: 'Bantwal riverside',
    message: 'Neeru mane olage bartha ide, urgent sahaya bekku.',
  },
  {
    label: 'Tulu / Code-mixed — Bridge Blocked',
    language: 'Tulu',
    channel: 'WhatsApp voice note',
    location: 'Near old bridge Kokkada',
    message: 'Kokkada haleya sethuve pakka neer jasthi barpundu, road blocked, 6 jana stuck.',
  },
  {
    label: 'Malayalam — Medical & Landslide',
    language: 'Malayalam',
    channel: 'WhatsApp text',
    location: 'Subrahmanya road',
    message: 'Subrahmanya road landslide aayi, veedu pakka vellam, elderly patient medical help venam.',
  },
  {
    label: 'English — Vague Landmark',
    language: 'English',
    channel: 'Telegram',
    location: 'Behind the temple near the old bridge',
    message: 'Four people are stuck on the roof behind the temple near the old bridge, water rising fast.',
  },
];

export function LiveIncidentFeedPage() {
  const {
    incidents,
    scenarioMeta,
    systemStatus,
    canEditTriage,
    addIncidentFromIntake,
    attachReportToIncident,
    openIncidentDetail,
  } = useDhwani();

  const isOffline = systemStatus.networkTier !== 'TIER_2_CLOUD';

  const [messageText, setMessageText] = useState(SAMPLE_PRESETS[0].message);
  const [sourceChannel, setSourceChannel] = useState<SourceChannel>('SMS');
  const [languageHint, setLanguageHint] = useState<string>('Auto-detect');
  const [locationHint, setLocationHint] = useState('Behind Uppinangady temple');
  const [affectedHint, setAffectedHint] = useState('');
  const [hazardHint, setHazardHint] = useState<HazardCategory | 'Auto'>('Auto');
  const [vulnerableHint, setVulnerableHint] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [computedPHash, setComputedPHash] = useState<string>('');
  const [simulateArchiveMatch, setSimulateArchiveMatch] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [aiResponse, setAiResponse] = useState<ProcessReportResponse | null>(null);
  const [duplicateResponse, setDuplicateResponse] = useState<DuplicateSimilarityResponse | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState<{ id: string; mode: 'new' | 'merged' } | null>(null);

  useEffect(() => {
    if (isOffline && INTERNET_ONLY_CHANNELS.has(sourceChannel)) {
      setSourceChannel('SMS');
    }
  }, [isOffline, sourceChannel]);

  const handleImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFileName(file.name);
    if (!imageCaption.trim()) {
      setImageCaption(`Field photo (${file.name})`);
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      setImagePreviewUrl(dataUrl || null);
      setComputedPHash(computeDeterministicPHash(`${file.name}:${file.size}:${dataUrl.slice(0, 128)}`));
    };
    reader.readAsDataURL(file);
  };

  const clearImageAttachment = () => {
    setImagePreviewUrl(null);
    setImageFileName('');
    setComputedPHash('');
    setImageCaption('');
    setSimulateArchiveMatch(false);
  };

  const handleProcessReport = async () => {
    if (!messageText.trim()) return;
    setProcessing(true);
    setAddedSuccess(null);
    setDuplicateResponse(null);

    const res = await processEmergencyReport({
      message: messageText,
      sourceChannel,
      declaredLanguage: languageHint === 'Auto-detect' ? undefined : languageHint,
      locationHint: locationHint.trim() || undefined,
      scenarioContext: `${scenarioMeta.name} (${scenarioMeta.region})`,
      networkTier: systemStatus.networkTier,
    });
    setAiResponse(res);
    setProcessing(false);

    // Automatically run cross-lingual duplicate similarity analysis against active scenario incidents
    if (incidents.length > 0) {
      setCheckingDuplicates(true);
      const simRes = await analyzeDuplicateSimilarity({
        candidateMessage: messageText.trim(),
        candidateTranslated: res.result.englishTranslation,
        candidateHazard: hazardHint === 'Auto' ? res.result.hazardType : hazardHint,
        candidateLocation: res.result.locationDescription,
        candidateLanguage: res.result.detectedLanguage,
        candidateAffectedPeople: affectedHint ? parseInt(affectedHint, 10) : res.result.affectedPeople,
        existingIncidents: incidents.slice(0, 12).map((inc) => ({
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
      setDuplicateResponse(simRes);
      setCheckingDuplicates(false);
    }
  };

  const handleMergeIntoMatch = (match: DuplicateSimilarityMatch) => {
    if (!aiResponse || !canEditTriage) return;
    const r = aiResponse.result;
    const idNum = Math.floor(100 + Math.random() * 899);
    const repId = `REP-${idNum}`;
    const nowLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const hasPhoto = Boolean(imageCaption.trim() || imagePreviewUrl);
    const finalPHash = hasPhoto
      ? simulateArchiveMatch
        ? 'a7f3c9104d2b8e11'
        : computedPHash || computeDeterministicPHash(imageCaption.trim())
      : '';
    const isRecycledPhoto = hasPhoto && simulateArchiveMatch;
    const isConflict = match.matchClassification === 'Conflicting Report' || match.conflictingSignals.length > 0;
    const isForward = match.matchClassification === 'Likely Forward-Chain';

    const report: EmergencyReport = {
      id: repId,
      incidentId: match.incidentId,
      originalMessage: messageText.trim(),
      translatedMessage: r.englishTranslation,
      language: r.detectedLanguage,
      sourceChannel,
      reporterAlias: 'Manual Intake (Simulated)',
      reporterPhoneMasked: '+91-98XXX-XX042',
      reporterPhoneRaw: '+91-98440-11042',
      receivedAt: nowLabel,
      isDuplicate: true,
      forwardChainDepth: isForward ? 2 : 0,
      similarityScore: match.similarityScore,
      imageAttachment: hasPhoto
        ? {
            caption: imageCaption.trim() || imageFileName || 'Attached field image',
            pHash: finalPHash,
            hammingDistance: isRecycledPhoto ? 3 : 29,
            matchedArchiveYear: isRecycledPhoto ? 2019 : undefined,
            flaggedAsPotentiallyRecycled: isRecycledPhoto,
          }
        : undefined,
      isSimulatedDemoData: true,
    };

    const evidence: EvidenceRecord = {
      id: `EV-${idNum}`,
      incidentId: match.incidentId,
      type: isConflict ? 'conflicting_claim' : isForward ? 'forward_chain' : 'duplicate_merge',
      label: isConflict
        ? `Conflicting Intake Report (${repId} · ${Math.round(match.similarityScore * 100)}% sim)`
        : isForward
          ? `Forward-Chain Linked (${repId} · ${Math.round(match.similarityScore * 100)}% sim)`
          : `Cross-Lingual Duplicate Merged (${repId} · ${Math.round(match.similarityScore * 100)}% sim)`,
      detail: `${match.rationale} (Engine: ${duplicateResponse?.provider ?? aiResponse.provider})`,
      reliabilityDelta: isConflict ? -10 : isForward ? 0 : 8,
      sourceId: repId,
      timestamp: nowLabel,
    };

    attachReportToIncident(match.incidentId, report, evidence, {
      markConflict: isConflict,
      markForwardChain: isForward,
    });
    setAddedSuccess({ id: match.incidentId, mode: 'merged' });
  };

  const handleCommitIncident = () => {
    if (!aiResponse || !canEditTriage) return;
    const r = aiResponse.result;
    const idNum = Math.floor(100 + Math.random() * 899);
    const prefix = scenarioMeta.id === 'kodagu-landslide' ? 'INC-KDG' : 'INC-NTV';
    const incId = `${prefix}-${idNum}`;
    const repId = `REP-${idNum}`;
    const lm = matchLandmarkCoordinates(`${r.locationDescription} ${locationHint} ${messageText}`);
    const parsedAffected = affectedHint ? parseInt(affectedHint, 10) : r.affectedPeople;
    const finalHazard = hazardHint === 'Auto' ? r.hazardType : hazardHint;
    const finalVulnerable = vulnerableHint.trim()
      ? Array.from(new Set([...r.vulnerablePersons, ...vulnerableHint.split(',').map((s) => s.trim()).filter(Boolean)]))
      : r.vulnerablePersons;

    const hasPhoto = Boolean(imageCaption.trim() || imagePreviewUrl);
    const finalPHash = hasPhoto
      ? simulateArchiveMatch
        ? 'a7f3c9104d2b8e11'
        : computedPHash || computeDeterministicPHash(imageCaption.trim())
      : '';
    const isRecycledPhoto = hasPhoto && simulateArchiveMatch;

    const baseSeverityPts = r.urgencyLevel === 'Critical' ? 30 : r.urgencyLevel === 'High' ? 22 : 14;
    const vulnPts = finalVulnerable.length > 0 ? 18 : 0;
    const biasPts = lm.taluk === 'Mangaluru' ? 4 : 15;
    const sensorPts = 14;
    const corrobPts = isRecycledPhoto ? -6 : 6;
    const computedScore = Math.max(12, Math.min(96, baseSeverityPts + vulnPts + biasPts + sensorPts + corrobPts));

    const nowLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const newIncident: Incident = {
      id: incId,
      title: `${finalHazard} — ${r.locationDescription}`,
      summary: r.summary,
      originalMessage: messageText.trim(),
      processedMessage: r.englishTranslation,
      language: r.detectedLanguage,
      source: sourceChannel,
      receivedAt: nowLabel,
      hazard: finalHazard,
      severity: r.urgencyLevel,
      affectedPeople: Number.isFinite(parsedAffected as number) ? (parsedAffected as number) : null,
      vulnerableGroups: finalVulnerable,
      missingInformation: r.missingInformation,
      location: {
        placeName: r.locationDescription || lm.name,
        landmark: r.landmarks[0] || locationHint || 'Landmark unresolved',
        taluk: r.talukOrArea || lm.taluk,
        lat: r.extractedCoordinates?.lat ?? lm.lat,
        lng: r.extractedCoordinates?.lng ?? lm.lng,
        precision: r.locationPrecision,
        gpsAvailable: r.locationPrecision === 'verified' && Boolean(r.extractedCoordinates),
        uncertaintyRadiusMeters: r.uncertaintyRadiusMeters || lm.radius,
        confidence: r.fieldConfidence.location,
        candidateMatches: [
          {
            name: lm.name,
            matchScore: r.fieldConfidence.location,
            distanceHint: r.extractedCoordinates ? 'Explicit GPS extracted' : `±${r.uncertaintyRadiusMeters}m zone`,
          },
        ],
        requiredForResolution: r.missingInformation.slice(0, 2),
      },
      confidence: r.overallConfidence,
      fieldConfidence: r.fieldConfidence,
      verificationStatus: isRecycledPhoto ? 'Potentially recycled image' : 'Unverified',
      needEstimate: {
        rawReportCount: 1,
        expectedReportingRate: lm.taluk === 'Mangaluru' ? 0.92 : 0.22,
        populationContext: 2600,
        connectivityScore: lm.taluk === 'Mangaluru' ? 95 : 34,
        languageAccessibility: 68,
        literacyAccessScore: 76,
        historicalBaselineRate: 0.24,
        biasCorrectedNeedIndex: Number((1 / (lm.taluk === 'Mangaluru' ? 0.92 : 0.22)).toFixed(1)),
        uncertaintyMargin: 5.2,
        finalNeedScore: computedScore,
        counterfactualNote:
          'Score will refine once Active Triage resolves missing depth/location fields or a second independent report corroborates.',
        factors: [
          { id: `${incId}-f1`, label: `Extracted urgency (${r.urgencyLevel} ${finalHazard})`, points: baseSeverityPts, category: 'severity', detail: r.summary },
          ...(vulnPts > 0
            ? [{ id: `${incId}-f2`, label: `Vulnerable group (${finalVulnerable.join(', ')})`, points: vulnPts, category: 'vulnerability' as const, detail: 'Priority boost for vulnerable individuals.' }]
            : []),
          { id: `${incId}-f3`, label: 'Regional river/rain sensor context', points: sensorPts, category: 'hazard-sensor', detail: `Active monsoon warning in ${scenarioMeta.region}.` },
          { id: `${incId}-f4`, label: 'Reporting-rate bias correction', points: biasPts, category: 'bias-correction', detail: lm.taluk === 'Mangaluru' ? 'High urban connectivity.' : 'Low-connectivity rural area adjustment.' },
          {
            id: `${incId}-f5`,
            label: isRecycledPhoto ? 'Potentially recycled photo pHash match' : 'Single initial report (awaiting corroboration)',
            points: corrobPts,
            category: isRecycledPhoto ? 'rumour-penalty' : 'corroboration',
            detail: isRecycledPhoto
              ? `pHash ${finalPHash} matched 2019 archive (Hamming distance 3). Requires human review.`
              : `Received via ${sourceChannel}.`,
          },
        ],
      },
      reportIds: [repId],
      duplicateCount: 0,
      coordinatorDecision: { approved: false },
      recommendedResources:
        finalHazard === 'Flood' || finalHazard === 'People trapped'
          ? ['Rescue boat', 'Life jackets', 'First aid kit']
          : ['Field assessment unit', 'Medical kit'],
      areaType: lm.taluk === 'Mangaluru' ? 'Urban' : 'Remote village',
      flaggedForHumanReview: r.overallConfidence < systemStatus.humanReviewThreshold || isRecycledPhoto,
      isSimulatedDemoData: true,
    };

    const newReport: EmergencyReport = {
      id: repId,
      incidentId: incId,
      originalMessage: messageText.trim(),
      translatedMessage: r.englishTranslation,
      language: r.detectedLanguage,
      sourceChannel,
      reporterAlias: 'Manual Intake (Simulated)',
      reporterPhoneMasked: '+91-98XXX-XX042',
      reporterPhoneRaw: '+91-98440-11042',
      receivedAt: nowLabel,
      isDuplicate: false,
      forwardChainDepth: 0,
      similarityScore: 1.0,
      imageAttachment: hasPhoto
        ? {
            caption: imageCaption.trim() || imageFileName || 'Attached field image',
            pHash: finalPHash,
            hammingDistance: isRecycledPhoto ? 3 : 29,
            matchedArchiveYear: isRecycledPhoto ? 2019 : undefined,
            flaggedAsPotentiallyRecycled: isRecycledPhoto,
          }
        : undefined,
      isSimulatedDemoData: true,
    };

    const newEvidence: EvidenceRecord = {
      id: `EV-${idNum}`,
      incidentId: incId,
      type: isRecycledPhoto ? 'recycled_image_check' : 'independent_report',
      label: isRecycledPhoto
        ? `pHash Archive Match (${repId})`
        : `Primary Intake (${repId} · ${sourceChannel})`,
      detail: isRecycledPhoto
        ? `Simulated pHash ${finalPHash} within Hamming distance 3 of 2019 flood archive. Flagged for human verification.`
        : `Processed via ${aiResponse.provider} (validated). Confidence ${Math.round(r.overallConfidence * 100)}%.`,
      reliabilityDelta: isRecycledPhoto ? -14 : 15,
      sourceId: repId,
      timestamp: nowLabel,
    };

    addIncidentFromIntake(newIncident, newReport, newEvidence);
    setAddedSuccess({ id: incId, mode: 'new' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#E6EDF7]">
          Live Incident Intake & Multilingual AI Pipeline
        </h1>
        <p className="mt-1 text-xs text-[#8B9BB4]">
          Ingests emergency reports across 11 simulated input channels in Kannada, Tulu, Malayalam, Konkani, Hindi, English, and code-mixed text with server-side Gemini structured extraction, duplicate similarity analysis, and transparent rule-based fallback.
        </p>
      </div>

      {/* Intake & AI Extraction Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Manual / Simulated Intake Form */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
            <h2 className="text-sm font-semibold text-[#E6EDF7]">Submit Emergency Report (Simulated Intake)</h2>
            <span className="text-[11px] font-mono text-amber-400">DEMO CHANNEL SIMULATION</span>
          </div>

          {/* One-click Multilingual Presets */}
          <div>
            <div className="text-xs text-[#8B9BB4] mb-2">Load multilingual sample report:</div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setMessageText(p.message);
                    setSourceChannel(p.channel);
                    setLanguageHint(p.language);
                    setLocationHint(p.location);
                    setAiResponse(null);
                    setDuplicateResponse(null);
                    setAddedSuccess(null);
                  }}
                  className="px-2.5 py-1 rounded text-[11px] bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-[#CBD5E1] cursor-pointer transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8B9BB4] mb-1">Raw Emergency Message Text</label>
            <textarea
              rows={3}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Paste Kannada, Tulu, Malayalam, Konkani, Hindi, English, or code-mixed report..."
              className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] focus:outline-none focus:border-cyan-500/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">
                Source Channel (11 Supported){isOffline ? ' · Offline Mode Active' : ''}
              </label>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value as SourceChannel)}
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              >
                {ALL_CHANNELS.map((ch) => {
                  const disabledOffline = isOffline && INTERNET_ONLY_CHANNELS.has(ch);
                  return (
                    <option key={ch} value={ch} disabled={disabledOffline}>
                      {ch}
                      {disabledOffline ? ' (Requires Internet)' : ''}
                    </option>
                  );
                })}
              </select>
              {isOffline && (
                <div className="mt-1 text-[11px] font-mono text-amber-400">
                  Internet outage simulated — SMS, Missed-call IVR, Call transcript, Sensors & Offline PWA remain active.
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Language Hint</label>
              <select
                value={languageHint}
                onChange={(e) => setLanguageHint(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              >
                <option value="Auto-detect">Auto-detect</option>
                {(['Kannada', 'Tulu', 'Malayalam', 'Konkani', 'Hindi', 'English', 'Code-mixed'] as SupportedLanguage[]).map(
                  (l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Location / Landmark Hint</label>
              <input
                type="text"
                value={locationHint}
                onChange={(e) => setLocationHint(e.target.value)}
                placeholder="e.g. Behind temple"
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Affected People (Optional)</label>
              <input
                type="number"
                min={0}
                value={affectedHint}
                onChange={(e) => setAffectedHint(e.target.value)}
                placeholder="Auto-extract"
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Hazard Override</label>
              <select
                value={hazardHint}
                onChange={(e) => setHazardHint(e.target.value as HazardCategory | 'Auto')}
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              >
                <option value="Auto">Auto-classify</option>
                {(
                  [
                    'Flood',
                    'Landslide',
                    'Building collapse',
                    'Road blockage',
                    'People trapped',
                    'Medical emergency',
                    'Missing persons',
                    'Infrastructure damage',
                    'Other emergency',
                  ] as HazardCategory[]
                ).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Vulnerable Persons (Optional)</label>
              <input
                type="text"
                value={vulnerableHint}
                onChange={(e) => setVulnerableHint(e.target.value)}
                placeholder="e.g. Elderly woman, infants"
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Optional Photo Attachment & pHash</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <ImageIcon className="w-3.5 h-3.5 text-[#6B7E9B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    placeholder="Photo caption or upload file..."
                    className="w-full pl-8 pr-2.5 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
                  />
                </div>
                <label className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-xs text-[#CBD5E1] cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {(imagePreviewUrl || imageCaption.trim()) && (
            <div className="p-2.5 rounded bg-[#090E17] border border-[#1E2B40] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {imagePreviewUrl && (
                  <img
                    src={imagePreviewUrl}
                    alt="Attached field report preview"
                    className="w-10 h-10 rounded object-cover border border-[#243652] shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[#E6EDF7] font-medium truncate">
                    {imageFileName || imageCaption.trim()}
                  </div>
                  <div className="text-[11px] font-mono text-cyan-400">
                    pHash:{' '}
                    {simulateArchiveMatch
                      ? 'a7f3c9104d2b8e11 (Simulated 2019 Match)'
                      : computedPHash || computeDeterministicPHash(imageCaption.trim())}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={simulateArchiveMatch}
                    onChange={(e) => setSimulateArchiveMatch(e.target.checked)}
                    className="accent-amber-500 cursor-pointer"
                  />
                  Test 2019 Archive Match
                </label>
                <button
                  type="button"
                  aria-label="Remove attached photo"
                  onClick={clearImageAttachment}
                  className="text-[#8B9BB4] hover:text-red-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#182336]">
            <span className="text-[11px] font-mono text-[#6B7E9B]">
              Engine: {systemStatus.networkTier === 'TIER_2_CLOUD' ? 'Server-side Gemini (gemini-4-hydrogen) + Validation' : systemStatus.networkTier.replace(/_/g, ' ')}
            </span>
            <button
              type="button"
              onClick={handleProcessReport}
              disabled={processing || !messageText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 transition-colors"
            >
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
              {processing ? 'Analyzing Report...' : 'AI Process & Check Duplicates'}
            </button>
          </div>
        </div>

        {/* Right: Structured AI Output, Validation Guardrails & Duplicate Similarity */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5">
          {!aiResponse ? (
            <div className="py-12 text-center space-y-2">
              <Languages className="w-7 h-7 text-[#475569] mx-auto" />
              <div className="text-sm font-medium text-[#CBD5E1]">
                Ready to extract structured emergency intelligence
              </div>
              <p className="text-xs text-[#6B7E9B] max-w-md mx-auto">
                Click <span className="text-cyan-400 font-medium">AI Process & Check Duplicates</span> to detect language, translate side by side, extract hazards & vulnerable persons, estimate location uncertainty, detect missing details, and scan active incidents for duplicates.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
                <div className="flex flex-wrap items-center gap-2">
                  <LanguageBadge language={aiResponse.result.detectedLanguage} />
                  {aiResponse.result.detectedScriptsOrDialects?.length > 0 && (
                    <span className="text-[11px] text-[#8B9BB4] font-mono">
                      ({aiResponse.result.detectedScriptsOrDialects.join(', ')})
                    </span>
                  )}
                  <span className="text-[#475569]">·</span>
                  <span
                    className={`text-xs font-mono ${
                      aiResponse.provider === 'gemini-4-hydrogen' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {aiResponse.provider === 'gemini-4-hydrogen'
                      ? 'Gemini (gemini-4-hydrogen)'
                      : `Fallback (${aiResponse.provider})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJson((s) => !s)}
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  {showJson ? 'Hide JSON' : 'Inspect JSON'}
                </button>
              </div>

              {aiResponse.warning && (
                <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>{aiResponse.warning}</span>
                </div>
              )}

              {/* Validation & Anti-Fabrication Guardrails Strip */}
              {aiResponse.validationChecks.length > 0 && (
                <div className="p-2.5 rounded bg-emerald-500/5 border border-emerald-500/25 text-[11px] font-mono text-emerald-300/90 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Response Schema & Anti-Fabrication Guardrails Passed
                  </div>
                  <div className="text-[#94A3B8]">{aiResponse.validationChecks.join(' · ')}</div>
                </div>
              )}

              {/* Side-by-side Original & Translated */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
                  <div className="text-[11px] font-mono text-[#6B7E9B] mb-1">
                    Original ({aiResponse.result.detectedLanguage})
                  </div>
                  <p className="text-xs text-[#E6EDF7] leading-relaxed">{messageText}</p>
                </div>
                <div className="p-3 rounded bg-[#090E17] border border-[#182336]">
                  <div className="text-[11px] font-mono text-cyan-400 mb-1">
                    Translated Interpretation (English)
                  </div>
                  <p className="text-xs text-[#E6EDF7] leading-relaxed">
                    {aiResponse.result.englishTranslation}
                  </p>
                </div>
              </div>

              {/* Extracted Structured Fields + Per-Field Confidence */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
                  <div className="text-[#6B7E9B] text-[11px]">Primary & Secondary Hazard</div>
                  <div className="font-semibold text-[#E6EDF7] mt-0.5">{aiResponse.result.hazardType}</div>
                  {aiResponse.result.secondaryHazards?.length > 0 && (
                    <div className="text-[10.5px] text-amber-300 mt-0.5">
                      +{aiResponse.result.secondaryHazards.join(', ')}
                    </div>
                  )}
                  <div className="mt-1">
                    <ConfidenceIndicator confidence={aiResponse.result.fieldConfidence.hazard} compact />
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
                  <div className="text-[#6B7E9B] text-[11px]">Affected People</div>
                  <div className="font-semibold text-[#E6EDF7] mt-0.5 font-mono">
                    {aiResponse.result.affectedPeople ?? 'Not stated (null)'}
                  </div>
                  <div className="mt-1">
                    <ConfidenceIndicator confidence={aiResponse.result.fieldConfidence.population} compact />
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#0B121F] border border-[#182336]">
                  <div className="text-[#6B7E9B] text-[11px]">Location Uncertainty</div>
                  <div className="font-semibold text-[#E6EDF7] mt-0.5 capitalize">
                    {aiResponse.result.locationPrecision} (±{aiResponse.result.uncertaintyRadiusMeters}m)
                  </div>
                  <div className="mt-1">
                    <ConfidenceIndicator confidence={aiResponse.result.fieldConfidence.location} compact />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded bg-[#0B121F] border border-[#182336] space-y-1.5">
                  <div className="text-[#8B9BB4] font-medium">Vulnerable Persons & Landmarks</div>
                  {aiResponse.result.vulnerabilityDetails?.length > 0 ? (
                    <div className="space-y-1">
                      {aiResponse.result.vulnerabilityDetails.map((vd, idx) => (
                        <div key={idx} className="text-[11.5px] text-amber-300">
                          <span className="font-medium">{vd.group}</span>{' '}
                          <span className="text-[#94A3B8] font-mono">("{vd.evidencePhrase}")</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-amber-300">
                      Vulnerable:{' '}
                      {aiResponse.result.vulnerablePersons.length > 0
                        ? aiResponse.result.vulnerablePersons.join(', ')
                        : 'None stated in message'}
                    </div>
                  )}
                  <div className="text-[#CBD5E1] pt-1 border-t border-[#182336]">
                    Landmarks: {aiResponse.result.landmarks.join(' · ')}
                    {aiResponse.result.talukOrArea ? ` (${aiResponse.result.talukOrArea})` : ''}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#0B121F] border border-[#182336]">
                  <div className="text-[#8B9BB4] font-medium mb-1">Missing Details (For Active Triage)</div>
                  {aiResponse.result.missingInfoPriorities?.length > 0 ? (
                    <ul className="space-y-1.5 text-[11.5px] text-[#CBD5E1]">
                      {aiResponse.result.missingInfoPriorities.map((m, idx) => (
                        <li key={idx}>
                          <span className={m.priority === 'High' ? 'text-orange-400 font-mono mr-1' : 'text-cyan-400 font-mono mr-1'}>
                            [{m.priority}]
                          </span>
                          <span className="font-medium text-[#E6EDF7]">{m.field}:</span>{' '}
                          <span className="text-[#94A3B8]">{m.whyCritical}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="list-disc pl-4 space-y-0.5 text-[#CBD5E1]">
                      {aiResponse.result.missingInformation.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Duplicate Similarity Analysis Panel */}
              <div className="p-3 rounded bg-[#090E17] border border-[#1E2B40] space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-[#E6EDF7] flex items-center gap-1.5">
                    <GitMerge className="w-3.5 h-3.5 text-cyan-400" />
                    Cross-Lingual Duplicate Similarity Analysis
                  </div>
                  {checkingDuplicates ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Comparing against {incidents.length} active incidents...
                    </span>
                  ) : duplicateResponse ? (
                    <span
                      className={`text-[11px] font-mono font-semibold ${
                        duplicateResponse.result.overallDuplicateRisk === 'High'
                          ? 'text-red-400'
                          : duplicateResponse.result.overallDuplicateRisk === 'Moderate'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      Duplicate Risk: {duplicateResponse.result.overallDuplicateRisk} · {duplicateResponse.provider}
                    </span>
                  ) : null}
                </div>

                {duplicateResponse && (
                  <>
                    <p className="text-[11.5px] text-[#94A3B8]">{duplicateResponse.result.analysisSummary}</p>
                    {duplicateResponse.warning && (
                      <div className="text-[11px] font-mono text-amber-300/90">
                        {duplicateResponse.warning}
                      </div>
                    )}
                    {duplicateResponse.result.matches.length > 0 ? (
                      <div className="space-y-2">
                        {duplicateResponse.result.matches.slice(0, 2).map((m) => (
                          <div
                            key={m.incidentId}
                            className={`p-2.5 rounded border space-y-1.5 ${
                              m.conflictingSignals.length > 0
                                ? 'bg-red-500/10 border-red-500/30'
                                : m.similarityScore >= 0.65
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : 'bg-[#0B121F] border-[#182336]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 font-mono">
                                <span className="text-cyan-300 font-semibold">{m.incidentId}</span>
                                <span className="text-[#E6EDF7]">{Math.round(m.similarityScore * 100)}% match</span>
                                <span className="text-amber-300">{m.matchClassification}</span>
                              </div>
                              <button
                                type="button"
                                disabled={Boolean(addedSuccess) || !canEditTriage}
                                onClick={() => handleMergeIntoMatch(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium cursor-pointer disabled:opacity-40"
                              >
                                <GitMerge className="w-3 h-3" />
                                {m.conflictingSignals.length > 0
                                  ? 'Link & Flag Conflict'
                                  : m.matchClassification === 'Likely Forward-Chain'
                                    ? 'Link Forward-Chain'
                                    : `Merge into ${m.incidentId}`}
                              </button>
                            </div>
                            <div className="text-[11px] text-[#CBD5E1]">{m.rationale}</div>
                            {m.sharedSignals.length > 0 && (
                              <div className="text-[11px] text-emerald-300/90">
                                Shared: {m.sharedSignals.join(' · ')}
                              </div>
                            )}
                            {m.conflictingSignals.length > 0 && (
                              <div className="text-[11px] text-red-300 flex items-start gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>Conflict: {m.conflictingSignals.join(' · ')}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        No overlapping duplicate clusters detected — safe to log as a new incident.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Processing Explanation Trace */}
              <div className="p-3 rounded bg-[#090E17] border border-[#182336] text-xs">
                <div className="text-[#8B9BB4] font-medium mb-1.5">
                  How raw message became a structured incident (Overall Confidence:{' '}
                  <span className="font-mono text-cyan-400">
                    {Math.round(aiResponse.result.overallConfidence * 100)}%
                  </span>
                  )
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[#94A3B8]">
                  {aiResponse.result.processingSteps.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ol>
              </div>

              {showJson && (
                <pre className="p-3 rounded bg-[#060A11] border border-[#182336] text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-56">
                  {JSON.stringify(
                    {
                      extraction: aiResponse.result,
                      validationChecks: aiResponse.validationChecks,
                      duplicateSimilarity: duplicateResponse?.result ?? null,
                    },
                    null,
                    2
                  )}
                </pre>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#182336]">
                {addedSuccess ? (
                  <div className="inline-flex items-center gap-2 text-xs text-emerald-400">
                    <Check className="w-4 h-4" />
                    {addedSuccess.mode === 'merged' ? 'Merged into' : 'Added as'}{' '}
                    <span className="font-mono font-semibold">{addedSuccess.id}</span>
                    <button
                      type="button"
                      onClick={() =>
                        openIncidentDetail(
                          addedSuccess.id,
                          addedSuccess.mode === 'merged' ? 'evidence-verification' : 'incident-intelligence'
                        )
                      }
                      className="underline text-cyan-400 ml-1 cursor-pointer"
                    >
                      {addedSuccess.mode === 'merged' ? 'Inspect Evidence Graph →' : 'Open Intelligence →'}
                    </button>
                  </div>
                ) : !canEditTriage ? (
                  <span className="text-[11px] text-amber-300">
                    Read-Only Observer role cannot commit incidents. Switch role in Settings.
                  </span>
                ) : (
                  <span className="text-[11px] text-[#6B7E9B]">
                    {aiResponse.result.overallConfidence < systemStatus.humanReviewThreshold
                      ? `Confidence < ${Math.round(systemStatus.humanReviewThreshold * 100)}% — will auto-flag for Human Review.`
                      : 'Ready to commit to live operational incident store.'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCommitIncident}
                  disabled={Boolean(addedSuccess) || !canEditTriage}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-45"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add as New Incident
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Live Incident Feed Table */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E6EDF7]">
            All Live Incidents ({incidents.length} Simulated Records)
          </h2>
          <span className="text-xs text-[#6B7E9B]">
            DPDP 2023 PII Redaction: {systemStatus.piiRedactionEnabled ? 'Active' : 'Off'}
          </span>
        </div>
        <IncidentTable
          incidents={incidents}
          humanReviewThreshold={systemStatus.humanReviewThreshold}
          onSelectIncident={(id) => openIncidentDetail(id, 'incident-intelligence')}
        />
      </div>
    </div>
  );
}
