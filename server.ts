import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  validateDuplicateSimilarity,
  validateProcessedReport,
  validateTriageSuggestion,
} from './src/services/aiValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';
const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const GEMINI_TIMEOUT_MS = 16000;

function classifyGeminiError(err: unknown): { status: number; code: string; message: string; retryable: boolean } {
  const msg = err instanceof Error ? err.message : String(err ?? 'Unknown Gemini API error');
  if (/TIMEOUT|AbortError|timed out/i.test(msg)) {
    return {
      status: 504,
      code: 'GEMINI_TIMEOUT',
      message: 'Cloud Gemini request timed out. Transparently switched to local rule-based fallback.',
      retryable: false,
    };
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED|403/i.test(msg)) {
    return {
      status: 403,
      code: 'GEMINI_AUTH_ERROR',
      message: 'Gemini API key authentication failed. Check GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return {
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
      message: 'Gemini API rate limit or quota reached. Transparently falling back to local rule engine.',
      retryable: true,
    };
  }
  if (/UNAVAILABLE|503|500|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)) {
    return {
      status: 503,
      code: 'GEMINI_TRANSIENT_ERROR',
      message: 'Gemini upstream temporarily unavailable. Transparently falling back to local rule engine.',
      retryable: true,
    };
  }
  return {
    status: 502,
    code: 'GEMINI_REQUEST_FAILED',
    message: `Gemini processing failed: ${msg}`,
    retryable: false,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`GEMINI_TIMEOUT after ${ms}ms`)), ms);
    }),
  ]);
}

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await withTimeout(fn(), GEMINI_TIMEOUT_MS);
    } catch (err) {
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt >= maxRetries) {
        throw err;
      }
      const backoffMs = 450 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      attempt += 1;
    }
  }
}

function safeJsonParse(rawText: string | undefined): { ok: true; value: unknown } | { ok: false; error: string } {
  const cleaned = (rawText ?? '').trim();
  if (!cleaned) {
    return { ok: false, error: 'Model returned an empty response.' };
  }
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    // Attempt stripping accidental markdown code fences if present
    const stripped = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      return { ok: true, value: JSON.parse(stripped) };
    } catch (err) {
      return {
        ok: false,
        error: `Model output was not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
      };
    }
  }
}

// Health check (never exposes API key value)
app.get('/api/health', (_req, res) => {
  const hasGemini = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  res.json({
    status: 'ok',
    service: 'dhwani-coordination-server',
    geminiConfigured: hasGemini,
    model: GEMINI_TEXT_MODEL,
    endpoints: [
      '/api/ai/process-report',
      '/api/ai/duplicate-similarity',
      '/api/ai/triage-question',
      '/api/ai/transcribe',
    ],
    validationEnabled: true,
    timestamp: new Date().toISOString(),
  });
});

// 1. Server-side multilingual emergency report understanding & structured JSON extraction
app.post('/api/ai/process-report', async (req, res) => {
  const {
    message,
    sourceChannel,
    declaredLanguage,
    locationHint,
    scenarioContext,
    networkTier = 'TIER_2_CLOUD',
  } = req.body ?? {};

  if (!message || typeof message !== 'string' || message.trim().length < 3) {
    res.status(400).json({ error: 'Emergency message text must be at least 3 characters.' });
    return;
  }

  if (networkTier !== 'TIER_2_CLOUD') {
    res.status(503).json({
      error: `Cloud AI unavailable in ${networkTier}. Switch to local Edge/SMS extraction.`,
      offlineTier: networkTier,
    });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server. Using transparent local rule-based fallback.',
      code: 'GEMINI_UNAVAILABLE',
    });
    return;
  }

  try {
    const prompt = [
      `Analyze this disaster emergency report for a district emergency control room in India.`,
      scenarioContext ? `Active regional scenario context: ${scenarioContext}` : 'Regional context: Coastal & Malnad Karnataka (Dakshina Kannada / Kodagu).',
      `Raw message: "${message.trim()}"`,
      `Source channel: ${sourceChannel || 'Unknown'}`,
      `Declared language hint: ${declaredLanguage || 'Auto-detect'}`,
      `Optional location hint: ${locationHint || 'None provided'}`,
      `Strict Extraction & Anti-Fabrication Rules:`,
      `1. Detect language accurately as one of: Kannada, Tulu, Malayalam, Konkani, Hindi, English, Code-mixed. Identify scripts/dialects used (e.g. Romanized Kannada, Kannada Unicode, Tulu-English code-mix).`,
      `2. Translate faithfully into clear English without adding facts not present in the raw message.`,
      `3. Classify primary hazardType strictly as one of: Flood, Landslide, Building collapse, Road blockage, People trapped, Medical emergency, Missing persons, Infrastructure damage, Other emergency. Include any secondaryHazards from the same enum.`,
      `4. Extract affectedPeople ONLY if explicitly stated or clearly countable in the message; otherwise return null. NEVER invent casualty or survivor counts.`,
      `5. Detect vulnerable persons (elderly, infants/children, pregnant women, injured/medical/dialysis/mobility-impaired) and quote the exact evidencePhrase from the message in vulnerabilityDetails.`,
      `6. Extract landmarks, locationDescription, and talukOrArea strictly from the message/hint. NEVER fabricate exact GPS coordinates. Set locationPrecision to 'verified' ONLY if numeric lat/lng coordinates explicitly appear in the text; use 'approximate' for named villages/landmarks, or 'uncertain' for vague descriptions.`,
      `7. Detect missing critical rescue information (e.g. water depth/rate of rise, exact landmark, headcount, medical injury status, road accessibility) with whyCritical and priority (High or Medium).`,
      `8. Provide calibrated confidence scores from 0.0 to 1.0 (overallConfidence and per-field) and a concise step-by-step processingSteps trace.`,
    ].join('\n');

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are DHWANI, a responsible multilingual disaster intelligence engine for Indian district disaster control rooms. Be strictly factual, preserve uncertainty, never fabricate GPS coordinates or unstated counts, and return valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: { type: Type.STRING },
              isCodeMixed: { type: Type.BOOLEAN },
              detectedScriptsOrDialects: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              englishTranslation: { type: Type.STRING },
              summary: { type: Type.STRING },
              hazardType: { type: Type.STRING },
              secondaryHazards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              affectedPeople: { type: Type.INTEGER },
              vulnerablePersons: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              vulnerabilityDetails: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    group: { type: Type.STRING },
                    evidencePhrase: { type: Type.STRING },
                    urgencyWeight: { type: Type.STRING },
                  },
                  required: ['group', 'evidencePhrase', 'urgencyWeight'],
                },
              },
              landmarks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              locationDescription: { type: Type.STRING },
              talukOrArea: { type: Type.STRING },
              locationPrecision: { type: Type.STRING },
              uncertaintyRadiusMeters: { type: Type.INTEGER },
              missingInformation: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              missingInfoPriorities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    field: { type: Type.STRING },
                    whyCritical: { type: Type.STRING },
                    priority: { type: Type.STRING },
                  },
                  required: ['field', 'whyCritical', 'priority'],
                },
              },
              urgencyLevel: { type: Type.STRING },
              overallConfidence: { type: Type.NUMBER },
              fieldConfidence: {
                type: Type.OBJECT,
                properties: {
                  language: { type: Type.NUMBER },
                  hazard: { type: Type.NUMBER },
                  location: { type: Type.NUMBER },
                  population: { type: Type.NUMBER },
                  vulnerability: { type: Type.NUMBER },
                },
                required: ['language', 'hazard', 'location', 'population', 'vulnerability'],
              },
              suggestedFollowUp: { type: Type.STRING },
              processingSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'detectedLanguage',
              'isCodeMixed',
              'detectedScriptsOrDialects',
              'englishTranslation',
              'summary',
              'hazardType',
              'secondaryHazards',
              'vulnerablePersons',
              'vulnerabilityDetails',
              'landmarks',
              'locationDescription',
              'locationPrecision',
              'uncertaintyRadiusMeters',
              'missingInformation',
              'missingInfoPriorities',
              'urgencyLevel',
              'overallConfidence',
              'fieldConfidence',
              'suggestedFollowUp',
              'processingSteps',
            ],
          },
        },
      })
    );

    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) {
      res.status(502).json({
        error: parsed.error,
        code: 'GEMINI_INVALID_JSON',
      });
      return;
    }

    const validated = validateProcessedReport(parsed.value, {
      rawMessage: message,
      locationHint: typeof locationHint === 'string' ? locationHint : undefined,
    });

    if (!validated.ok) {
      res.status(502).json({
        error: `Server validation rejected Gemini output: ${validated.error}`,
        code: 'GEMINI_VALIDATION_FAILED',
      });
      return;
    }

    res.json({
      provider: GEMINI_TEXT_MODEL,
      validated: true,
      validationChecks: validated.validationChecks,
      validationWarnings: validated.warnings,
      result: validated.data,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const classified = classifyGeminiError(err);
    res.status(classified.status).json({
      error: classified.message,
      code: classified.code,
    });
  }
});

// 2. Server-side cross-lingual duplicate similarity & conflict analysis
app.post('/api/ai/duplicate-similarity', async (req, res) => {
  const {
    candidateMessage,
    candidateTranslated,
    candidateHazard,
    candidateLocation,
    candidateLanguage,
    candidateAffectedPeople,
    existingIncidents = [],
    networkTier = 'TIER_2_CLOUD',
  } = req.body ?? {};

  if (!candidateMessage || typeof candidateMessage !== 'string' || candidateMessage.trim().length < 3) {
    res.status(400).json({ error: 'Candidate emergency message is required.' });
    return;
  }

  if (!Array.isArray(existingIncidents) || existingIncidents.length === 0) {
    res.json({
      provider: GEMINI_TEXT_MODEL,
      validated: true,
      validationChecks: ['No active incidents supplied for comparison'],
      validationWarnings: [],
      result: {
        matches: [],
        bestMatchIncidentId: null,
        overallDuplicateRisk: 'Low',
        analysisSummary: 'No active incidents available to compare against.',
      },
      processedAt: new Date().toISOString(),
    });
    return;
  }

  if (networkTier !== 'TIER_2_CLOUD') {
    res.status(503).json({
      error: `Cloud duplicate similarity unavailable in ${networkTier}. Using local cross-lingual rule engine.`,
      offlineTier: networkTier,
    });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server. Using transparent local similarity fallback.',
      code: 'GEMINI_UNAVAILABLE',
    });
    return;
  }

  // Cap payload size & extract exact grounded incident IDs
  const trimmedIncidents = existingIncidents.slice(0, 15).map((inc: Record<string, unknown>) => ({
    id: String(inc.id ?? ''),
    title: String(inc.title ?? ''),
    originalMessage: String(inc.originalMessage ?? '').slice(0, 220),
    translatedMessage: String(inc.translatedMessage ?? '').slice(0, 220),
    hazard: String(inc.hazard ?? ''),
    language: String(inc.language ?? ''),
    placeName: String(inc.placeName ?? ''),
    taluk: String(inc.taluk ?? ''),
    affectedPeople: typeof inc.affectedPeople === 'number' ? inc.affectedPeople : null,
    receivedAt: String(inc.receivedAt ?? ''),
  }));
  const validIds = trimmedIncidents.map((i) => i.id).filter(Boolean);

  try {
    const prompt = [
      `Compare this incoming emergency report against existing active disaster incidents to detect cross-lingual duplicates, forwarded copies, related same-area events, or conflicting claims.`,
      `Incoming Report:`,
      `- Raw message: "${candidateMessage.trim()}"`,
      candidateTranslated ? `- English interpretation: "${candidateTranslated}"` : '',
      candidateLanguage ? `- Language: ${candidateLanguage}` : '',
      candidateHazard ? `- Hazard: ${candidateHazard}` : '',
      candidateLocation ? `- Location description: ${candidateLocation}` : '',
      candidateAffectedPeople != null ? `- Affected people stated: ${candidateAffectedPeople}` : '- Affected people stated: Not stated',
      ``,
      `Active Incidents (ONLY reference incident IDs from this exact JSON list; NEVER invent an ID):`,
      JSON.stringify(trimmedIncidents, null, 2),
      ``,
      `Rules:`,
      `- Return matches ONLY for incidents with similarityScore >= 0.30 or clear conflicting signals (up to 4 most relevant).`,
      `- Account for cross-lingual equivalence (Kannada, Tulu, Malayalam, Konkani, Hindi, English, code-mixed).`,
      `- Classify each match strictly as one of: Exact Duplicate, Cross-Lingual Duplicate, Likely Forward-Chain, Related Same-Area Event, Conflicting Report, Distinct Incident.`,
      `- Set recommendedAction strictly as one of: Merge into Incident, Link as Forward-Chain, Flag Conflicting Evidence, Create Separate Incident.`,
      `- Highlight specific sharedSignals (landmarks, hazards, vulnerable individuals, wording) and any conflictingSignals (contradictory headcount, contradictory road/water status, mismatched hazard).`,
      `- Set overallDuplicateRisk to High, Moderate, or Low.`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are DHWANI Evidence Fusion AI. Detect semantic duplicates, forward chains, and conflicting field claims across Indian languages without ever inventing incident IDs or fabricated facts.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    incidentId: { type: Type.STRING },
                    similarityScore: { type: Type.NUMBER },
                    matchClassification: { type: Type.STRING },
                    sharedSignals: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    conflictingSignals: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    recommendedAction: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: [
                    'incidentId',
                    'similarityScore',
                    'matchClassification',
                    'sharedSignals',
                    'conflictingSignals',
                    'recommendedAction',
                    'rationale',
                  ],
                },
              },
              bestMatchIncidentId: { type: Type.STRING },
              overallDuplicateRisk: { type: Type.STRING },
              analysisSummary: { type: Type.STRING },
            },
            required: ['matches', 'overallDuplicateRisk', 'analysisSummary'],
          },
        },
      })
    );

    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) {
      res.status(502).json({
        error: parsed.error,
        code: 'GEMINI_INVALID_JSON',
      });
      return;
    }

    const validated = validateDuplicateSimilarity(parsed.value, validIds);
    if (!validated.ok) {
      res.status(502).json({
        error: `Server validation rejected similarity output: ${validated.error}`,
        code: 'GEMINI_VALIDATION_FAILED',
      });
      return;
    }

    res.json({
      provider: GEMINI_TEXT_MODEL,
      validated: true,
      validationChecks: validated.validationChecks,
      validationWarnings: validated.warnings,
      result: validated.data,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const classified = classifyGeminiError(err);
    res.status(classified.status).json({
      error: classified.message,
      code: classified.code,
    });
  }
});

// 3. Server-side Active Triage optimal follow-up question generator
app.post('/api/ai/triage-question', async (req, res) => {
  const {
    incidentSummary,
    originalMessage,
    hazardType,
    locationDescription,
    locationPrecision,
    affectedPeople,
    vulnerableGroups = [],
    missingInformation = [],
    existingFollowUps = [],
    targetLanguage = 'Kannada',
    channel = 'SMS',
    networkTier = 'TIER_2_CLOUD',
  } = req.body ?? {};

  if (networkTier !== 'TIER_2_CLOUD') {
    res.status(503).json({
      error: `Cloud AI unavailable in ${networkTier}.`,
      offlineTier: networkTier,
    });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
      code: 'GEMINI_UNAVAILABLE',
    });
    return;
  }

  try {
    const prompt = [
      `Generate ONE single highest-information-value follow-up triage question for a disaster-affected citizen.`,
      `Incident summary: ${incidentSummary || 'Unknown incident'}`,
      `Original message: "${originalMessage || ''}"`,
      hazardType ? `Primary hazard: ${hazardType}` : '',
      locationDescription ? `Current location estimate: ${locationDescription} (${locationPrecision || 'approximate'})` : '',
      affectedPeople != null ? `Stated affected people: ${affectedPeople}` : 'Stated affected people: Unknown',
      Array.isArray(vulnerableGroups) && vulnerableGroups.length > 0
        ? `Known vulnerable groups: ${vulnerableGroups.join(', ')}`
        : 'Known vulnerable groups: None confirmed yet',
      `Missing information: ${Array.isArray(missingInformation) ? missingInformation.join('; ') : ''}`,
      Array.isArray(existingFollowUps) && existingFollowUps.length > 0
        ? `Questions ALREADY asked (DO NOT repeat these): ${existingFollowUps.join(' | ')}`
        : '',
      `Target language: ${targetLanguage}`,
      `Delivery channel: ${channel} (keep under 160 characters for SMS; use simple 1/2/3 keypad reply choices so citizens on 2G or stressed conditions can reply effortlessly).`,
      `Return:`,
      `- questionEnglish: concise English version`,
      `- questionLocalized: natural, culturally accurate ${targetLanguage} version (romanized or script + clear 1/2/3 keys)`,
      `- targetMissingField: the exact missing field resolved`,
      `- informationGainReason: concise rescue-decision rationale`,
      `- expectedConfidenceDelta: calibrated float between 0.05 and 0.30`,
      `- simulatedReplyOptions: 2 realistic hypothetical test reply options (for prototype simulation only) with label, replyText, extractedUpdate, and integer scoreDelta (-15 to +20).`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are DHWANI Active Triage. Choose the single shortest, highest-Value-of-Information clarifying question that maximally reduces rescue prioritization uncertainty. Never repeat already-asked questions and never invent live citizen responses.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questionEnglish: { type: Type.STRING },
              questionLocalized: { type: Type.STRING },
              targetMissingField: { type: Type.STRING },
              informationGainReason: { type: Type.STRING },
              expectedConfidenceDelta: { type: Type.NUMBER },
              simulatedReplyOptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    replyText: { type: Type.STRING },
                    extractedUpdate: { type: Type.STRING },
                    scoreDelta: { type: Type.INTEGER },
                  },
                  required: ['label', 'replyText', 'extractedUpdate', 'scoreDelta'],
                },
              },
            },
            required: [
              'questionEnglish',
              'questionLocalized',
              'targetMissingField',
              'informationGainReason',
              'expectedConfidenceDelta',
              'simulatedReplyOptions',
            ],
          },
        },
      })
    );

    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) {
      res.status(502).json({
        error: parsed.error,
        code: 'GEMINI_INVALID_JSON',
      });
      return;
    }

    const validated = validateTriageSuggestion(parsed.value);
    if (!validated.ok) {
      res.status(502).json({
        error: `Server validation rejected triage output: ${validated.error}`,
        code: 'GEMINI_VALIDATION_FAILED',
      });
      return;
    }

    res.json({
      provider: GEMINI_TEXT_MODEL,
      validated: true,
      validationChecks: validated.validationChecks,
      validationWarnings: validated.warnings,
      result: validated.data,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const classified = classifyGeminiError(err);
    res.status(classified.status).json({
      error: classified.message,
      code: classified.code,
    });
  }
});

// 4. Server-side audio transcription for Active Triage field dictation (gemini-3.5-transcribe)
app.post('/api/ai/transcribe', async (req, res) => {
  const {
    audioBase64,
    mimeType = 'audio/webm',
    languageHint = 'Auto-detect',
    networkTier = 'TIER_2_CLOUD',
  } = req.body ?? {};

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    res.status(400).json({ error: 'Missing base64 audio payload.' });
    return;
  }

  if (networkTier !== 'TIER_2_CLOUD') {
    res.status(503).json({
      error: `Cloud transcription unavailable in ${networkTier}.`,
      offlineTier: networkTier,
    });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
      code: 'GEMINI_UNAVAILABLE',
    });
    return;
  }

  try {
    const cleanMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
    const audioPart = {
      inlineData: {
        mimeType: cleanMime,
        data: audioBase64,
      },
    };

    const instructionText =
      languageHint && languageHint !== 'Auto-detect'
        ? `Transcribe this disaster emergency field worker audio accurately. Expected language or code-mix: ${languageHint} (may include Kannada, Tulu, Malayalam, Konkani, Hindi, or English). Return only the clean verbatim transcription without extra commentary.`
        : 'Transcribe this disaster emergency field worker audio accurately (may be in Kannada, Tulu, Malayalam, Konkani, Hindi, English, or code-mixed). Return only the clean verbatim transcription without extra commentary.';

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: GEMINI_TRANSCRIBE_MODEL,
        contents: { parts: [audioPart, { text: instructionText }] },
      })
    );

    const transcript = (response.text ?? '').trim();
    if (!transcript) {
      res.status(422).json({
        error: 'No speech was detected in the recording. Please speak clearly and try again.',
        code: 'EMPTY_TRANSCRIPT',
      });
      return;
    }

    res.json({
      provider: GEMINI_TRANSCRIBE_MODEL,
      transcript,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const classified = classifyGeminiError(err);
    res.status(classified.status).json({
      error: `Audio transcription failed: ${classified.message}`,
      code: classified.code,
    });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DHWANI Coordination Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
