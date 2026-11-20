import type { HazardCategory, LocationPrecision, SeverityLevel, SupportedLanguage } from '../types/dhwani';
import {
  extractExplicitGpsFromText,
  type DuplicateMatchClassification,
  type DuplicateRecommendedAction,
  type DuplicateSimilarityMatch,
  type DuplicateSimilarityResult,
  type MissingInfoPriority,
  type ProcessedReportResult,
  type TriageSuggestionResult,
  type VulnerabilityDetail,
} from './localAiFallback';

const VALID_LANGUAGES: SupportedLanguage[] = [
  'Kannada',
  'Tulu',
  'Malayalam',
  'Konkani',
  'Hindi',
  'English',
  'Code-mixed',
];

const VALID_HAZARDS: HazardCategory[] = [
  'Flood',
  'Landslide',
  'Building collapse',
  'Road blockage',
  'People trapped',
  'Medical emergency',
  'Missing persons',
  'Infrastructure damage',
  'Other emergency',
];

const VALID_PRECISIONS: LocationPrecision[] = ['verified', 'approximate', 'uncertain'];
const VALID_SEVERITIES: SeverityLevel[] = ['Critical', 'High', 'Moderate', 'Low'];

const VALID_MATCH_CLASSES: DuplicateMatchClassification[] = [
  'Exact Duplicate',
  'Cross-Lingual Duplicate',
  'Likely Forward-Chain',
  'Related Same-Area Event',
  'Conflicting Report',
  'Distinct Incident',
];

const VALID_DUP_ACTIONS: DuplicateRecommendedAction[] = [
  'Merge into Incident',
  'Link as Forward-Chain',
  'Flag Conflicting Evidence',
  'Create Separate Incident',
];

export interface ValidationOutcome<T> {
  ok: true;
  data: T;
  validationChecks: string[];
  warnings: string[];
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationOutcome<T> | ValidationFailure;

function clamp(n: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, n)).toFixed(2));
}

function asNonEmptyString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function asStringArray(v: unknown, maxItems = 12): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(
      v
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((s) => s.trim())
    )
  ).slice(0, maxItems);
}

function normalizeLanguage(val: unknown): SupportedLanguage {
  const s = typeof val === 'string' ? val.trim() : '';
  const exact = VALID_LANGUAGES.find((l) => l.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  if (/mix|hinglish|kanglish/i.test(s)) return 'Code-mixed';
  if (/kannada/i.test(s)) return 'Kannada';
  if (/tulu/i.test(s)) return 'Tulu';
  if (/malayalam/i.test(s)) return 'Malayalam';
  if (/konkani/i.test(s)) return 'Konkani';
  if (/hindi/i.test(s)) return 'Hindi';
  return 'English';
}

function normalizeHazard(val: unknown): HazardCategory {
  const s = typeof val === 'string' ? val.trim() : '';
  const exact = VALID_HAZARDS.find((h) => h.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  if (/flood|water|inundat/i.test(s)) return 'Flood';
  if (/landslide|mudslide|slope/i.test(s)) return 'Landslide';
  if (/collapse|structural/i.test(s)) return 'Building collapse';
  if (/road|bridge|block/i.test(s)) return 'Road blockage';
  if (/trap|strand|stuck|roof/i.test(s)) return 'People trapped';
  if (/med|injur|health|ambulance/i.test(s)) return 'Medical emergency';
  if (/missing|swept/i.test(s)) return 'Missing persons';
  if (/infra|power|telecom|tower/i.test(s)) return 'Infrastructure damage';
  return 'Other emergency';
}

function normalizeSeverity(val: unknown): SeverityLevel {
  const s = typeof val === 'string' ? val.trim() : '';
  const exact = VALID_SEVERITIES.find((sev) => sev.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  if (/crit|extreme|immediate/i.test(s)) return 'Critical';
  if (/high|urgent|severe/i.test(s)) return 'High';
  if (/low|minor/i.test(s)) return 'Low';
  return 'Moderate';
}

function normalizeConfidence(val: unknown, fallback = 0.65): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  // Guard against models returning 0-100 percentages instead of 0-1 floats
  const normalized = val > 1 && val <= 100 ? val / 100 : val;
  return clamp(normalized, 0.05, 0.99);
}

/**
 * Validates and sanitizes Gemini's structured emergency extraction response.
 * Enforces anti-fabrication guardrails (never fabricates GPS coordinates or unstated counts).
 */
export function validateProcessedReport(
  raw: unknown,
  context: { rawMessage: string; locationHint?: string }
): ValidationResult<ProcessedReportResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'AI response was not a valid JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const warnings: string[] = [];
  const validationChecks: string[] = [];

  const englishTranslation = asNonEmptyString(obj.englishTranslation);
  const summary = asNonEmptyString(obj.summary);
  if (!englishTranslation || !summary) {
    return {
      ok: false,
      error: 'AI extraction missed required englishTranslation or summary fields.',
    };
  }

  const detectedLanguage = normalizeLanguage(obj.detectedLanguage);
  const isCodeMixed = Boolean(obj.isCodeMixed || detectedLanguage === 'Code-mixed');
  const detectedScriptsOrDialects = asStringArray(obj.detectedScriptsOrDialects, 5);
  const hazardType = normalizeHazard(obj.hazardType);
  const secondaryHazards = Array.isArray(obj.secondaryHazards)
    ? Array.from(
        new Set(
          obj.secondaryHazards
            .map((h) => normalizeHazard(h))
            .filter((h) => h !== hazardType && h !== 'Other emergency')
        )
      )
    : [];

  // Strictly validate affectedPeople (null or reasonable positive integer)
  let affectedPeople: number | null = null;
  if (typeof obj.affectedPeople === 'number' && Number.isFinite(obj.affectedPeople)) {
    const rounded = Math.round(obj.affectedPeople);
    if (rounded > 0 && rounded <= 10000) {
      affectedPeople = rounded;
    } else {
      warnings.push(`Ignored out-of-range affectedPeople value (${obj.affectedPeople}).`);
    }
  }

  // Vulnerable persons & evidence phrases
  const vulnerablePersons = asStringArray(obj.vulnerablePersons, 8);
  const vulnerabilityDetails: VulnerabilityDetail[] = [];
  if (Array.isArray(obj.vulnerabilityDetails)) {
    for (const item of obj.vulnerabilityDetails.slice(0, 8)) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const group = asNonEmptyString(rec.group);
        const evidencePhrase = asNonEmptyString(rec.evidencePhrase);
        const uw = asNonEmptyString(rec.urgencyWeight, 'High');
        const urgencyWeight: VulnerabilityDetail['urgencyWeight'] =
          uw === 'Critical' || uw === 'High' || uw === 'Moderate' ? uw : 'High';
        if (group && evidencePhrase) {
          vulnerabilityDetails.push({ group, evidencePhrase, urgencyWeight });
        }
      }
    }
  }
  // Keep vulnerablePersons synced with details
  for (const vd of vulnerabilityDetails) {
    if (!vulnerablePersons.includes(vd.group)) {
      vulnerablePersons.push(vd.group);
    }
  }

  // Anti-hallucination GPS guardrail: ONLY allow verified GPS if explicit coordinates exist in input
  const explicitInputCoords = extractExplicitGpsFromText(`${context.rawMessage} ${context.locationHint ?? ''}`);
  const rawPrecision = asNonEmptyString(obj.locationPrecision, 'uncertain').toLowerCase();
  let locationPrecision: LocationPrecision = VALID_PRECISIONS.includes(rawPrecision as LocationPrecision)
    ? (rawPrecision as LocationPrecision)
    : 'uncertain';

  if (locationPrecision === 'verified' && !explicitInputCoords) {
    locationPrecision = 'approximate';
    warnings.push(
      'Guardrail: Downgraded locationPrecision from "verified" to "approximate" because no explicit GPS coordinates appear in the raw message.'
    );
  }
  validationChecks.push(
    explicitInputCoords
      ? 'GPS Guardrail: Explicit coordinates verified in input text'
      : 'GPS Guardrail: Confirmed zero fabricated GPS coordinates'
  );

  const landmarks = asStringArray(obj.landmarks, 6);
  const locationDescription = asNonEmptyString(
    obj.locationDescription,
    landmarks[0] || context.locationHint?.trim() || 'Unspecified village / landmark'
  );
  const talukOrArea = asNonEmptyString(obj.talukOrArea) || null;

  const rawRadius =
    typeof obj.uncertaintyRadiusMeters === 'number' && Number.isFinite(obj.uncertaintyRadiusMeters)
      ? Math.round(obj.uncertaintyRadiusMeters)
      : locationPrecision === 'verified'
        ? 30
        : locationPrecision === 'approximate'
          ? 750
          : 2000;
  const uncertaintyRadiusMeters =
    locationPrecision === 'verified'
      ? Math.max(10, Math.min(200, rawRadius))
      : Math.max(150, Math.min(10000, rawRadius));

  const missingInformation = asStringArray(obj.missingInformation, 8);
  const missingInfoPriorities: MissingInfoPriority[] = [];
  if (Array.isArray(obj.missingInfoPriorities)) {
    for (const item of obj.missingInfoPriorities.slice(0, 8)) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const field = asNonEmptyString(rec.field);
        const whyCritical = asNonEmptyString(rec.whyCritical);
        const priority: MissingInfoPriority['priority'] = rec.priority === 'High' ? 'High' : 'Medium';
        if (field && whyCritical) {
          missingInfoPriorities.push({ field, whyCritical, priority });
          if (!missingInformation.includes(field)) {
            missingInformation.push(field);
          }
        }
      }
    }
  }
  if (!explicitInputCoords && !missingInformation.some((m) => /gps|location|landmark|coord/i.test(m))) {
    missingInformation.unshift('Exact GPS / house landmark');
  }

  const urgencyLevel = normalizeSeverity(obj.urgencyLevel);
  const overallConfidence = normalizeConfidence(obj.overallConfidence, 0.72);
  const rawFc = (obj.fieldConfidence && typeof obj.fieldConfidence === 'object'
    ? obj.fieldConfidence
    : {}) as Record<string, unknown>;

  const fieldConfidence = {
    language: normalizeConfidence(rawFc.language, overallConfidence),
    hazard: normalizeConfidence(rawFc.hazard, overallConfidence),
    location: normalizeConfidence(
      rawFc.location,
      locationPrecision === 'verified' ? 0.92 : locationPrecision === 'approximate' ? 0.68 : 0.42
    ),
    population: normalizeConfidence(rawFc.population, affectedPeople !== null ? 0.8 : 0.35),
    vulnerability: normalizeConfidence(rawFc.vulnerability, vulnerablePersons.length > 0 ? 0.82 : 0.55),
  };

  const suggestedFollowUp = asNonEmptyString(
    obj.suggestedFollowUp,
    missingInformation[0]
      ? `Please confirm: ${missingInformation[0]}. Reply by SMS.`
      : 'Please confirm your exact landmark and current safety status.'
  );

  const processingSteps = asStringArray(obj.processingSteps, 8);
  if (processingSteps.length === 0) {
    processingSteps.push(`Structured extraction completed for ${detectedLanguage} message (${hazardType}).`);
  }

  validationChecks.push(
    `Schema Validated: ${detectedLanguage} · ${hazardType} · ${urgencyLevel} · Confidence ${Math.round(overallConfidence * 100)}%`
  );
  validationChecks.push(
    affectedPeople !== null
      ? `Headcount Guardrail: Extracted ${affectedPeople} affected people`
      : 'Headcount Guardrail: Preserved null (no headcount invented)'
  );

  return {
    ok: true,
    data: {
      detectedLanguage,
      isCodeMixed,
      detectedScriptsOrDialects:
        detectedScriptsOrDialects.length > 0 ? detectedScriptsOrDialects : [detectedLanguage],
      englishTranslation,
      summary,
      hazardType,
      secondaryHazards,
      affectedPeople,
      vulnerablePersons,
      vulnerabilityDetails,
      landmarks: landmarks.length > 0 ? landmarks : [locationDescription],
      locationDescription,
      talukOrArea,
      locationPrecision,
      uncertaintyRadiusMeters,
      extractedCoordinates: explicitInputCoords,
      missingInformation: missingInformation.length > 0 ? missingInformation : ['On-site verification pending'],
      missingInfoPriorities,
      urgencyLevel,
      overallConfidence,
      fieldConfidence,
      suggestedFollowUp,
      processingSteps,
    },
    validationChecks,
    warnings,
  };
}

/**
 * Validates Gemini's duplicate similarity analysis against the exact set of real active incident IDs.
 * Drops any hallucinated incident IDs so live incident references are 100% grounded.
 */
export function validateDuplicateSimilarity(
  raw: unknown,
  validIncidentIds: string[]
): ValidationResult<DuplicateSimilarityResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Duplicate similarity response was not a valid JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const validSet = new Set(validIncidentIds);
  const warnings: string[] = [];
  const validationChecks: string[] = [];

  const matches: DuplicateSimilarityMatch[] = [];
  const seenIds = new Set<string>();

  if (Array.isArray(obj.matches)) {
    for (const entry of obj.matches) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const incidentId = asNonEmptyString(rec.incidentId);
      if (!incidentId || !validSet.has(incidentId)) {
        if (incidentId) {
          warnings.push(`Filtered non-existent incidentId "${incidentId}" returned by model.`);
        }
        continue;
      }
      if (seenIds.has(incidentId)) continue;
      seenIds.add(incidentId);

      const similarityScore = normalizeConfidence(rec.similarityScore, 0.3);
      const rawClass = asNonEmptyString(rec.matchClassification, 'Distinct Incident');
      const matchClassification: DuplicateMatchClassification = VALID_MATCH_CLASSES.includes(
        rawClass as DuplicateMatchClassification
      )
        ? (rawClass as DuplicateMatchClassification)
        : similarityScore >= 0.72
          ? 'Cross-Lingual Duplicate'
          : similarityScore >= 0.48
            ? 'Related Same-Area Event'
            : 'Distinct Incident';

      const rawAction = asNonEmptyString(rec.recommendedAction, 'Create Separate Incident');
      const recommendedAction: DuplicateRecommendedAction = VALID_DUP_ACTIONS.includes(
        rawAction as DuplicateRecommendedAction
      )
        ? (rawAction as DuplicateRecommendedAction)
        : matchClassification === 'Conflicting Report'
          ? 'Flag Conflicting Evidence'
          : matchClassification === 'Likely Forward-Chain'
            ? 'Link as Forward-Chain'
            : similarityScore >= 0.68
              ? 'Merge into Incident'
              : 'Create Separate Incident';

      const sharedSignals = asStringArray(rec.sharedSignals, 6);
      const conflictingSignals = asStringArray(rec.conflictingSignals, 6);
      const rationale = asNonEmptyString(
        rec.rationale,
        `Similarity ${Math.round(similarityScore * 100)}% with ${incidentId}.`
      );

      matches.push({
        incidentId,
        similarityScore,
        matchClassification,
        sharedSignals: sharedSignals.length > 0 ? sharedSignals : ['Semantic context evaluated'],
        conflictingSignals,
        recommendedAction,
        rationale,
      });
    }
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);
  const topMatches = matches.slice(0, 5);

  const rawBest = asNonEmptyString(obj.bestMatchIncidentId);
  const bestMatchIncidentId =
    rawBest && validSet.has(rawBest)
      ? rawBest
      : topMatches[0] && topMatches[0].similarityScore >= 0.48
        ? topMatches[0].incidentId
        : null;

  const rawRisk = asNonEmptyString(obj.overallDuplicateRisk);
  const overallDuplicateRisk: 'High' | 'Moderate' | 'Low' =
    rawRisk === 'High' || rawRisk === 'Moderate' || rawRisk === 'Low'
      ? rawRisk
      : topMatches[0] && topMatches[0].similarityScore >= 0.72
        ? 'High'
        : topMatches[0] && topMatches[0].similarityScore >= 0.48
          ? 'Moderate'
          : 'Low';

  const analysisSummary = asNonEmptyString(
    obj.analysisSummary,
    bestMatchIncidentId
      ? `Highest semantic similarity with ${bestMatchIncidentId} (${overallDuplicateRisk} duplicate risk).`
      : 'No probable duplicate detected across active incidents.'
  );

  validationChecks.push(
    `Grounded ID Check: Verified ${topMatches.length} candidate(s) against ${validIncidentIds.length} live incident IDs`
  );
  validationChecks.push(`Similarity Calibration: Overall duplicate risk rated "${overallDuplicateRisk}"`);

  return {
    ok: true,
    data: {
      matches: topMatches,
      bestMatchIncidentId,
      overallDuplicateRisk,
      analysisSummary,
    },
    validationChecks,
    warnings,
  };
}

/**
 * Validates Gemini's Active Triage follow-up question output.
 */
export function validateTriageSuggestion(raw: unknown): ValidationResult<TriageSuggestionResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Active Triage AI response was not a valid JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const warnings: string[] = [];
  const validationChecks: string[] = [];

  const questionEnglish = asNonEmptyString(obj.questionEnglish);
  const questionLocalized = asNonEmptyString(obj.questionLocalized, questionEnglish);
  if (!questionEnglish) {
    return { ok: false, error: 'Active Triage AI response missed questionEnglish.' };
  }

  const targetMissingField = asNonEmptyString(obj.targetMissingField, 'Critical missing triage detail');
  const informationGainReason = asNonEmptyString(
    obj.informationGainReason,
    'Reduces rescue prioritization uncertainty in a single low-bandwidth reply.'
  );

  const rawDelta =
    typeof obj.expectedConfidenceDelta === 'number' && Number.isFinite(obj.expectedConfidenceDelta)
      ? obj.expectedConfidenceDelta > 1
        ? obj.expectedConfidenceDelta / 100
        : obj.expectedConfidenceDelta
      : 0.14;
  const expectedConfidenceDelta = clamp(rawDelta, 0.04, 0.35);

  const simulatedReplyOptions: TriageSuggestionResult['simulatedReplyOptions'] = [];
  if (Array.isArray(obj.simulatedReplyOptions)) {
    for (const opt of obj.simulatedReplyOptions.slice(0, 3)) {
      if (!opt || typeof opt !== 'object') continue;
      const rec = opt as Record<string, unknown>;
      const label = asNonEmptyString(rec.label);
      const replyText = asNonEmptyString(rec.replyText);
      const extractedUpdate = asNonEmptyString(rec.extractedUpdate);
      const rawScoreDelta =
        typeof rec.scoreDelta === 'number' && Number.isFinite(rec.scoreDelta) ? Math.round(rec.scoreDelta) : 0;
      const scoreDelta = Math.max(-15, Math.min(20, rawScoreDelta));
      if (label && replyText && extractedUpdate) {
        simulatedReplyOptions.push({ label, replyText, extractedUpdate, scoreDelta });
      }
    }
  }

  if (simulatedReplyOptions.length < 2) {
    warnings.push('Added standard 1/2 simulated test reply options because model returned fewer than 2 options.');
    simulatedReplyOptions.push(
      {
        label: 'Reply 1 (YES — Confirmed Urgent)',
        replyText: '1 - Yes, situation worsening.',
        extractedUpdate: `Confirmed urgent update for ${targetMissingField}.`,
        scoreDelta: 8,
      },
      {
        label: 'Reply 2 (NO — Currently Stable)',
        replyText: '2 - No, stable for now.',
        extractedUpdate: `Confirmed stable status for ${targetMissingField}.`,
        scoreDelta: -4,
      }
    );
  }

  validationChecks.push(`Triage Schema Validated: Target "${targetMissingField}" (+${Math.round(expectedConfidenceDelta * 100)}% est. gain)`);
  validationChecks.push('Prototype Honesty: Reply options strictly flagged as simulated test scenarios');

  return {
    ok: true,
    data: {
      questionEnglish,
      questionLocalized,
      targetMissingField,
      informationGainReason,
      expectedConfidenceDelta,
      simulatedReplyOptions: simulatedReplyOptions.slice(0, 3),
    },
    validationChecks,
    warnings,
  };
}
