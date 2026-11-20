import type { HazardCategory, NetworkTier, SourceChannel, SupportedLanguage } from '../types/dhwani';
import {
  validateDuplicateSimilarity,
  validateProcessedReport,
  validateTriageSuggestion,
} from './aiValidation';
import {
  runLocalDuplicateSimilarityFallback,
  runLocalRuleBasedExtraction,
  runLocalTriageQuestionFallback,
  type DuplicateCandidateIncident,
  type DuplicateSimilarityResult,
  type ProcessedReportResult,
  type TriageSuggestionResult,
} from './localAiFallback';

export type AiProviderKind =
  | 'gemini-4-hydrogen'
  | 'tier-1-edge-fallback'
  | 'tier-0-sms-fallback'
  | 'local-fallback-after-error';

export interface ProcessReportResponse {
  provider: AiProviderKind;
  validated: boolean;
  validationChecks: string[];
  result: ProcessedReportResult;
  warning?: string;
}

export interface DuplicateSimilarityResponse {
  provider: AiProviderKind;
  validated: boolean;
  validationChecks: string[];
  result: DuplicateSimilarityResult;
  warning?: string;
}

export interface TriageQuestionResponse {
  provider: AiProviderKind;
  validated: boolean;
  validationChecks: string[];
  result: TriageSuggestionResult;
  warning?: string;
}

export interface HealthResponse {
  status: string;
  geminiConfigured: boolean;
  model: string;
  validationEnabled?: boolean;
  endpoints?: string[];
  timestamp: string;
}

const CLIENT_API_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = CLIENT_API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServerHealth(): Promise<HealthResponse> {
  try {
    const res = await fetchWithTimeout('/api/health', { method: 'GET' }, 5000);
    if (!res.ok) throw new Error('Health check failed');
    return await res.json();
  } catch {
    return {
      status: 'degraded',
      geminiConfigured: false,
      model: 'gemini-4-hydrogen',
      validationEnabled: true,
      timestamp: new Date().toISOString(),
    };
  }
}

export async function processEmergencyReport(params: {
  message: string;
  sourceChannel: SourceChannel;
  declaredLanguage?: string;
  locationHint?: string;
  scenarioContext?: string;
  networkTier: NetworkTier;
}): Promise<ProcessReportResponse> {
  if (params.networkTier === 'TIER_1_EDGE') {
    const localResult = runLocalRuleBasedExtraction(
      params.message,
      params.declaredLanguage,
      params.locationHint,
      'TIER_1_EDGE'
    );
    return {
      provider: 'tier-1-edge-fallback',
      validated: true,
      validationChecks: [
        'Local Edge Rule Schema Validated',
        localResult.extractedCoordinates
          ? 'GPS Guardrail: Explicit coordinates extracted'
          : 'GPS Guardrail: Zero fabricated coordinates',
      ],
      result: localResult,
      warning:
        'Tier 1 Edge Laptop Mode (simulated): Cloud Gemini bypassed. Processed locally using transparent rule-based extractor.',
    };
  }

  if (params.networkTier === 'TIER_0_SMS') {
    const localResult = runLocalRuleBasedExtraction(
      params.message,
      params.declaredLanguage,
      params.locationHint,
      'TIER_0_SMS'
    );
    return {
      provider: 'tier-0-sms-fallback',
      validated: true,
      validationChecks: [
        'Local GSM Keyword Schema Validated',
        'GPS Guardrail: Zero fabricated coordinates',
      ],
      result: localResult,
      warning:
        'Tier 0 SMS-Only Mode (simulated): Processed locally using minimal GSM keyword extraction and deterministic rules.',
    };
  }

  try {
    const res = await fetchWithTimeout('/api/ai/process-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.result) {
      const localResult = runLocalRuleBasedExtraction(
        params.message,
        params.declaredLanguage,
        params.locationHint,
        'CLOUD_FALLBACK'
      );
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: ['Fallback Schema Validated (Server returned error)'],
        result: localResult,
        warning:
          data?.error ||
          'Gemini API unavailable — transparently switched to local rule-based fallback.',
      };
    }

    // Client-side defense-in-depth validation of server response
    const clientCheck = validateProcessedReport(data.result, {
      rawMessage: params.message,
      locationHint: params.locationHint,
    });

    if (!clientCheck.ok) {
      const localResult = runLocalRuleBasedExtraction(
        params.message,
        params.declaredLanguage,
        params.locationHint,
        'CLOUD_FALLBACK'
      );
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: ['Fallback Schema Validated (Client rejected invalid cloud payload)'],
        result: localResult,
        warning: `Cloud response failed validation (${clientCheck.error}) — transparently switched to local rule-based fallback.`,
      };
    }

    const serverChecks: string[] = Array.isArray(data.validationChecks)
      ? data.validationChecks
      : clientCheck.validationChecks;
    const serverWarnings: string[] = Array.isArray(data.validationWarnings)
      ? data.validationWarnings
      : clientCheck.warnings;

    return {
      provider: 'gemini-4-hydrogen',
      validated: true,
      validationChecks: serverChecks,
      result: clientCheck.data,
      warning: serverWarnings.length > 0 ? serverWarnings.join(' ') : undefined,
    };
  } catch (err) {
    const localResult = runLocalRuleBasedExtraction(
      params.message,
      params.declaredLanguage,
      params.locationHint,
      'CLOUD_FALLBACK'
    );
    return {
      provider: 'local-fallback-after-error',
      validated: true,
      validationChecks: ['Fallback Schema Validated (Network unreachable)'],
      result: localResult,
      warning: `Network/API error (${err instanceof Error ? err.message : 'unreachable'}) — transparently switched to local rule-based fallback.`,
    };
  }
}

export async function analyzeDuplicateSimilarity(params: {
  candidateMessage: string;
  candidateTranslated?: string;
  candidateHazard?: HazardCategory;
  candidateLocation?: string;
  candidateLanguage?: SupportedLanguage;
  candidateAffectedPeople?: number | null;
  existingIncidents: DuplicateCandidateIncident[];
  networkTier: NetworkTier;
}): Promise<DuplicateSimilarityResponse> {
  const validIds = params.existingIncidents.map((i) => i.id);

  if (params.existingIncidents.length === 0) {
    return {
      provider: params.networkTier === 'TIER_2_CLOUD' ? 'gemini-4-hydrogen' : 'tier-1-edge-fallback',
      validated: true,
      validationChecks: ['No active incidents to compare'],
      result: {
        matches: [],
        bestMatchIncidentId: null,
        overallDuplicateRisk: 'Low',
        analysisSummary: 'No active incidents available for duplicate comparison.',
      },
    };
  }

  if (params.networkTier !== 'TIER_2_CLOUD') {
    const localSim = runLocalDuplicateSimilarityFallback(params);
    return {
      provider: params.networkTier === 'TIER_1_EDGE' ? 'tier-1-edge-fallback' : 'tier-0-sms-fallback',
      validated: true,
      validationChecks: [
        `Local Cross-Lingual Matcher checked ${validIds.length} active incidents`,
        'Grounded ID Check: 100% live scenario IDs',
      ],
      result: localSim,
      warning:
        params.networkTier === 'TIER_1_EDGE'
          ? 'Tier 1 Edge Mode: Cross-lingual duplicate similarity evaluated via local canonical token & landmark matcher.'
          : 'Tier 0 SMS Mode: Minimal local keyword overlap duplicate check active.',
    };
  }

  try {
    const res = await fetchWithTimeout('/api/ai/duplicate-similarity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.result) {
      const localSim = runLocalDuplicateSimilarityFallback(params);
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: [`Fallback Matcher checked ${validIds.length} active incidents`],
        result: localSim,
        warning:
          data?.error ||
          'Cloud duplicate similarity unavailable — transparently switched to local cross-lingual rule matcher.',
      };
    }

    const clientCheck = validateDuplicateSimilarity(data.result, validIds);
    if (!clientCheck.ok) {
      const localSim = runLocalDuplicateSimilarityFallback(params);
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: ['Fallback Matcher active after cloud validation failure'],
        result: localSim,
        warning: `Cloud similarity output failed validation (${clientCheck.error}) — switched to local rule matcher.`,
      };
    }

    const serverChecks: string[] = Array.isArray(data.validationChecks)
      ? data.validationChecks
      : clientCheck.validationChecks;
    const serverWarnings: string[] = Array.isArray(data.validationWarnings)
      ? data.validationWarnings
      : clientCheck.warnings;

    return {
      provider: 'gemini-4-hydrogen',
      validated: true,
      validationChecks: serverChecks,
      result: clientCheck.data,
      warning: serverWarnings.length > 0 ? serverWarnings.join(' ') : undefined,
    };
  } catch (err) {
    const localSim = runLocalDuplicateSimilarityFallback(params);
    return {
      provider: 'local-fallback-after-error',
      validated: true,
      validationChecks: [`Fallback Matcher checked ${validIds.length} active incidents`],
      result: localSim,
      warning: `Duplicate similarity API unreachable (${err instanceof Error ? err.message : 'network error'}) — using local rule matcher.`,
    };
  }
}

export async function generateTriageQuestion(params: {
  incidentSummary: string;
  originalMessage: string;
  hazardType?: HazardCategory;
  locationDescription?: string;
  locationPrecision?: string;
  affectedPeople?: number | null;
  vulnerableGroups?: string[];
  missingInformation: string[];
  existingFollowUps?: string[];
  targetLanguage: SupportedLanguage;
  channel: 'SMS' | 'Missed-call IVR' | 'WhatsApp text';
  networkTier: NetworkTier;
}): Promise<TriageQuestionResponse> {
  if (params.networkTier !== 'TIER_2_CLOUD') {
    const localQ = runLocalTriageQuestionFallback(
      params.missingInformation,
      params.targetLanguage,
      params.existingFollowUps
    );
    return {
      provider: params.networkTier === 'TIER_1_EDGE' ? 'tier-1-edge-fallback' : 'tier-0-sms-fallback',
      validated: true,
      validationChecks: [
        `Local Value-of-Information template selected for "${localQ.targetMissingField}"`,
        'Prototype Honesty: Simulated test reply options labeled',
      ],
      result: localQ,
      warning:
        params.networkTier === 'TIER_1_EDGE'
          ? 'Tier 1 Edge Mode: Question selected via local Value-of-Information rule lookup.'
          : 'Tier 0 SMS Mode: Standard 1/2 keypad SMS template selected.',
    };
  }

  try {
    const res = await fetchWithTimeout('/api/ai/triage-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.result) {
      const localQ = runLocalTriageQuestionFallback(
        params.missingInformation,
        params.targetLanguage,
        params.existingFollowUps
      );
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: ['Fallback Active Triage schema validated'],
        result: localQ,
        warning: data?.error || 'Gemini unavailable — transparently switched to local Active Triage heuristic.',
      };
    }

    const clientCheck = validateTriageSuggestion(data.result);
    if (!clientCheck.ok) {
      const localQ = runLocalTriageQuestionFallback(
        params.missingInformation,
        params.targetLanguage,
        params.existingFollowUps
      );
      return {
        provider: 'local-fallback-after-error',
        validated: true,
        validationChecks: ['Fallback Active Triage active after validation failure'],
        result: localQ,
        warning: `Cloud triage response failed validation (${clientCheck.error}) — switched to local rule template.`,
      };
    }

    const serverChecks: string[] = Array.isArray(data.validationChecks)
      ? data.validationChecks
      : clientCheck.validationChecks;
    const serverWarnings: string[] = Array.isArray(data.validationWarnings)
      ? data.validationWarnings
      : clientCheck.warnings;

    return {
      provider: 'gemini-4-hydrogen',
      validated: true,
      validationChecks: serverChecks,
      result: clientCheck.data,
      warning: serverWarnings.length > 0 ? serverWarnings.join(' ') : undefined,
    };
  } catch {
    const localQ = runLocalTriageQuestionFallback(
      params.missingInformation,
      params.targetLanguage,
      params.existingFollowUps
    );
    return {
      provider: 'local-fallback-after-error',
      validated: true,
      validationChecks: ['Fallback Active Triage schema validated'],
      result: localQ,
      warning: 'Cloud API unreachable — transparently switched to local Active Triage heuristic.',
    };
  }
}

export interface TranscribeAudioResponse {
  ok: boolean;
  provider: 'gemini-3.5-transcribe' | 'offline-unavailable' | 'error';
  transcript?: string;
  error?: string;
}

export async function transcribeFieldAudio(params: {
  audioBase64: string;
  mimeType: string;
  languageHint?: string;
  networkTier: NetworkTier;
}): Promise<TranscribeAudioResponse> {
  if (params.networkTier !== 'TIER_2_CLOUD') {
    return {
      ok: false,
      provider: 'offline-unavailable',
      error: `Cloud speech transcription (gemini-3.5-transcribe) is unavailable in ${params.networkTier.replace(/_/g, ' ')}. Use browser speech dictation if supported or enter text locally.`,
    };
  }

  try {
    const res = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        provider: 'error',
        error: data?.error || 'Audio transcription failed on server.',
      };
    }
    return {
      ok: true,
      provider: 'gemini-3.5-transcribe',
      transcript: data.transcript as string,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'error',
      error: err instanceof Error ? err.message : 'Unable to reach transcription server.',
    };
  }
}

/**
 * Integration-ready service architecture registry documenting exact separation
 * between fully implemented, simulated, integration-ready, and future capabilities.
 */
export interface ArchitectureCapabilitySpec {
  id: string;
  component: string;
  targetStack: string;
  status: 'Implemented' | 'Simulated' | 'Integration-Ready' | 'Future Roadmap';
  notes: string;
}

export const ARCHITECTURE_CAPABILITY_MATRIX: ArchitectureCapabilitySpec[] = [
  {
    id: 'cap-gemini',
    component: 'Multilingual Extraction, Duplicate Similarity & Active Triage AI',
    targetStack: 'Gemini API (gemini-4-hydrogen) via Express server proxy + schema guardrails',
    status: 'Implemented',
    notes:
      'Server-side structured JSON extraction, vulnerable-person & missing-info detection, cross-lingual duplicate/conflict analysis, and Active Triage generation with runtime validation & transparent local fallback.',
  },
  {
    id: 'cap-state',
    component: 'Shared Operational State, Audit Trail & Local Persistence',
    targetStack: 'React Context + Browser LocalStorage (Prototype)',
    status: 'Implemented',
    notes: 'Persists coordinator actions, merges, overrides, triage responses, and dispatches across page navigation.',
  },
  {
    id: 'cap-bias',
    component: 'Reporting-Bias Need Estimator',
    targetStack: 'Transparent Formula Prototype -> PyMC Hierarchical Bayesian Engine',
    status: 'Implemented',
    notes: 'Interactive simplified model (Reports / Expected Reporting Rate) implemented; PyMC posterior inference is future backend.',
  },
  {
    id: 'cap-comms',
    component: 'SMS / Missed-Call IVR / WhatsApp / GSM Modem Delivery',
    targetStack: 'Twilio / Exotel / WhatsApp Cloud API / Gammu GSM Daemon',
    status: 'Simulated',
    notes: 'All outbound messages, IVR callbacks, and victim replies are simulated in prototype.',
  },
  {
    id: 'cap-indic',
    component: 'Indic Speech & Regional Translation Pipeline',
    targetStack: 'Gemini 3.5 Transcribe + IndicWhisper / Bhashini ASR + IndicTrans2',
    status: 'Implemented',
    notes: 'Field voice dictation uses server-side gemini-3.5-transcribe with Web Speech fallback; supports 7 regional/code-mixed languages.',
  },
  {
    id: 'cap-cluster',
    component: 'Cross-Lingual Duplicate Similarity & Perceptual Image Hashing',
    targetStack: 'Gemini Similarity Engine + Deterministic pHash -> pgvector / HDBSCAN',
    status: 'Implemented',
    notes: 'Server-side Gemini + local cross-lingual rule fallback evaluate duplicate/forward/conflict similarity; deterministic pHash checks photo uploads.',
  },
  {
    id: 'cap-routing',
    component: 'Hazard-Aware Rescue Vehicle Routing',
    targetStack: 'Google OR-Tools + PostGIS Road Graph',
    status: 'Simulated',
    notes: 'Route suggestions and road-closure hazard warnings are simulated for active disaster corridors.',
  },
  {
    id: 'cap-stream',
    component: 'Event Streaming & Spatial Persistence',
    targetStack: 'Redpanda / Kafka + PostgreSQL / PostGIS + Redis',
    status: 'Future Roadmap',
    notes: 'Designed around typed event schemas; runs in-process on Express + browser storage for hackathon demo.',
  },
];
