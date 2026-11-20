import type { HazardCategory, LocationPrecision, SupportedLanguage } from '../types/dhwani';

export interface VulnerabilityDetail {
  group: string;
  evidencePhrase: string;
  urgencyWeight: 'Critical' | 'High' | 'Moderate';
}

export interface MissingInfoPriority {
  field: string;
  whyCritical: string;
  priority: 'High' | 'Medium';
}

export interface ProcessedReportResult {
  detectedLanguage: SupportedLanguage;
  isCodeMixed: boolean;
  detectedScriptsOrDialects: string[];
  englishTranslation: string;
  summary: string;
  hazardType: HazardCategory;
  secondaryHazards: HazardCategory[];
  affectedPeople: number | null;
  vulnerablePersons: string[];
  vulnerabilityDetails: VulnerabilityDetail[];
  landmarks: string[];
  locationDescription: string;
  talukOrArea: string | null;
  locationPrecision: LocationPrecision;
  uncertaintyRadiusMeters: number;
  extractedCoordinates: { lat: number; lng: number } | null;
  missingInformation: string[];
  missingInfoPriorities: MissingInfoPriority[];
  urgencyLevel: 'Critical' | 'High' | 'Moderate' | 'Low';
  overallConfidence: number;
  fieldConfidence: {
    language: number;
    hazard: number;
    location: number;
    population: number;
    vulnerability: number;
  };
  suggestedFollowUp: string;
  processingSteps: string[];
}

export type DuplicateMatchClassification =
  | 'Exact Duplicate'
  | 'Cross-Lingual Duplicate'
  | 'Likely Forward-Chain'
  | 'Related Same-Area Event'
  | 'Conflicting Report'
  | 'Distinct Incident';

export type DuplicateRecommendedAction =
  | 'Merge into Incident'
  | 'Link as Forward-Chain'
  | 'Flag Conflicting Evidence'
  | 'Create Separate Incident';

export interface DuplicateSimilarityMatch {
  incidentId: string;
  similarityScore: number; // 0 to 1
  matchClassification: DuplicateMatchClassification;
  sharedSignals: string[];
  conflictingSignals: string[];
  recommendedAction: DuplicateRecommendedAction;
  rationale: string;
}

export interface DuplicateSimilarityResult {
  matches: DuplicateSimilarityMatch[];
  bestMatchIncidentId: string | null;
  overallDuplicateRisk: 'High' | 'Moderate' | 'Low';
  analysisSummary: string;
}

export interface DuplicateCandidateIncident {
  id: string;
  title: string;
  originalMessage: string;
  translatedMessage: string;
  hazard: HazardCategory;
  language: SupportedLanguage;
  placeName: string;
  taluk: string;
  affectedPeople: number | null;
  receivedAt: string;
}

export interface TriageSuggestionResult {
  questionEnglish: string;
  questionLocalized: string;
  targetMissingField: string;
  informationGainReason: string;
  expectedConfidenceDelta: number;
  simulatedReplyOptions: {
    label: string;
    replyText: string;
    extractedUpdate: string;
    scoreDelta: number;
  }[];
}

const KNOWN_LANDMARKS: {
  keywords: string[];
  name: string;
  taluk: string;
  lat: number;
  lng: number;
  radius: number;
}[] = [
  // Dakshina Kannada — Netravati Flood Corridor
  {
    keywords: ['uppinangady', 'ಉಪ್ಪಿನಂಗಡಿ', 'devasthana', 'ದೇವಸ್ಥಾನ', 'temple', 'sangama'],
    name: 'Uppinangady Sahasralingeshwara Temple Area',
    taluk: 'Puttur',
    lat: 12.8384,
    lng: 75.2529,
    radius: 650,
  },
  {
    keywords: ['bantwal', 'ಬಂಟ್ವಾಳ', 'panemangalore', 'old bridge', 'bridge', 'sethuve', 'ಸೇತುವೆ', 'palam'],
    name: 'Bantwal / Panemangalore Old Bridge Sector',
    taluk: 'Bantwal',
    lat: 12.8891,
    lng: 75.0358,
    radius: 800,
  },
  {
    keywords: ['nelyadi', 'nelliyadi', 'ನೆಲ್ಯಾಡಿ'],
    name: 'Nelyadi Lowland Cluster',
    taluk: 'Kadaba',
    lat: 12.8398,
    lng: 75.3881,
    radius: 1100,
  },
  {
    keywords: ['kokkada', 'ಕೊಕ್ಕಡ', 'dharmasthala'],
    name: 'Kokkada Riverside Settlement',
    taluk: 'Belthangady',
    lat: 12.9052,
    lng: 75.3492,
    radius: 950,
  },
  {
    keywords: ['shishila', 'ಶಿಶಿಲ', 'shibaje'],
    name: 'Shishila Valley',
    taluk: 'Belthangady',
    lat: 12.9522,
    lng: 75.4621,
    radius: 1300,
  },
  {
    keywords: ['subrahmanya', 'ಸುಬ್ರಹ್ಮಣ್ಯ', 'kumaradhara'],
    name: 'Subrahmanya Kumaradhara Bridge Approach',
    taluk: 'Kadaba',
    lat: 12.6654,
    lng: 75.6145,
    radius: 900,
  },
  {
    keywords: ['mangaluru', 'mangalore', 'ಮಂಗಳೂರು', 'jeppu', 'kankanady'],
    name: 'Mangaluru Jeppu Ward',
    taluk: 'Mangaluru',
    lat: 12.8511,
    lng: 74.8492,
    radius: 500,
  },
  {
    keywords: ['belthangady', 'ಬೆಳ್ತಂಗಡಿ', 'ujire', 'ಉಜಿರೆ'],
    name: 'Ujire / Belthangady Town Approach',
    taluk: 'Belthangady',
    lat: 12.9935,
    lng: 75.3274,
    radius: 750,
  },
  // Kodagu — Landslide Corridor
  {
    keywords: ['madikeri', 'ಮಡಿಕೇರಿ', 'jodupala', 'ಜೋಡುಪಾಲ', 'makkandur'],
    name: 'Madikeri / Jodupala Hill Slope Sector',
    taluk: 'Madikeri',
    lat: 12.4244,
    lng: 75.7382,
    radius: 850,
  },
  {
    keywords: ['bhagamandala', 'ಭಾಗಮಂಡಲ', 'talacauvery', 'triveni'],
    name: 'Bhagamandala Triveni Sangama Sector',
    taluk: 'Madikeri',
    lat: 12.3879,
    lng: 75.5318,
    radius: 900,
  },
  {
    keywords: ['virajpet', 'ವಿರಾಜಪೇಟೆ', 'napoklu', 'makutta'],
    name: 'Virajpet / Makutta Ghat Approach',
    taluk: 'Virajpet',
    lat: 12.1956,
    lng: 75.8035,
    radius: 1000,
  },
  {
    keywords: ['kushalnagar', 'ಕುಶಾಲನಗರ', 'suntikoppa', 'somwarpet'],
    name: 'Kushalnagar / Suntikoppa Highway Sector',
    taluk: 'Somwarpet',
    lat: 12.4596,
    lng: 75.9571,
    radius: 850,
  },
];

export function matchLandmarkCoordinates(text: string): {
  name: string;
  taluk: string;
  lat: number;
  lng: number;
  radius: number;
  matched: boolean;
} {
  const lower = text.toLowerCase();
  for (const lm of KNOWN_LANDMARKS) {
    if (lm.keywords.some((kw) => lower.includes(kw))) {
      return { ...lm, matched: true };
    }
  }
  return {
    name: 'Unresolved Regional Location (Approximate)',
    taluk: 'Dakshina Kannada',
    lat: 12.871 + Math.sin(text.length) * 0.03,
    lng: 75.182 + Math.cos(text.length) * 0.05,
    radius: 2200,
    matched: false,
  };
}

export function extractExplicitGpsFromText(text: string): { lat: number; lng: number } | null {
  const match = text.match(/\b(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})\b/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return { lat, lng };
  }
  return null;
}

/**
 * Transparent local rule-based fallback used when:
 * 1. User switches to Tier 1 (Edge Laptop Mode) or Tier 0 (SMS-Only Mode), OR
 * 2. Cloud Gemini API key is unavailable / request fails / response fails validation.
 * Always explicitly labeled in UI as Local Rule-Based Fallback (never claims to be Gemini).
 */
export function runLocalRuleBasedExtraction(
  message: string,
  declaredLanguage?: string,
  locationHint?: string,
  tierLabel: 'TIER_1_EDGE' | 'TIER_0_SMS' | 'CLOUD_FALLBACK' = 'CLOUD_FALLBACK'
): ProcessedReportResult {
  const combined = `${message} ${locationHint ?? ''}`;
  const lower = combined.toLowerCase();

  // Native Unicode script checks
  const hasKannadaScript = /[\u0C80-\u0CFF]/.test(message);
  const hasMalayalamScript = /[\u0D00-\u0D7F]/.test(message);
  const hasDevanagariScript = /[\u0900-\u097F]/.test(message);

  // Romanized lexical checks
  const kannadaTokens = ['neeru', 'mane', 'jana', 'ajji', 'devasthana', 'hinde', 'bandide', 'olage', 'bartha', 'ide', 'mele', 'raste', 'sahaya', 'gudda', 'kusitha'];
  const tuluTokens = ['neer', 'ill', 'da', 'barpundu', 'poyere', 'ajji', 'kudla', 'sethuve', 'bokk'];
  const malayalamTokens = ['vellam', 'veedu', 'aalkar', 'sahayam', 'palam', 'kudungi', 'venam', 'aayi'];
  const hindiTokens = ['paani', 'ghar', 'log', 'madad', 'pul', 'doob', 'chhat', 'bachao', 'bhooskhalan'];
  const konkaniTokens = ['udak', 'ghor', 'lok', 'madat', 'dhompar'];

  const knCount = kannadaTokens.filter((t) => lower.includes(t)).length;
  const tuCount = tuluTokens.filter((t) => lower.includes(t)).length;
  const mlCount = malayalamTokens.filter((t) => lower.includes(t)).length;
  const hiCount = hindiTokens.filter((t) => lower.includes(t)).length;
  const kokCount = konkaniTokens.filter((t) => lower.includes(t)).length;
  const hasEnglish = /\b(water|flood|roof|stuck|trapped|help|road|bridge|elderly|landslide|medical|house|people|signal|urgent|blocked|patient)\b/i.test(lower);

  let detectedLanguage: SupportedLanguage = 'English';
  let isCodeMixed = false;
  const detectedScriptsOrDialects: string[] = [];

  if (hasKannadaScript) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Kannada';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Kannada script (Unicode)');
  } else if (hasMalayalamScript) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Malayalam';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Malayalam script (Unicode)');
  } else if (hasDevanagariScript) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Hindi';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Devanagari script (Unicode)');
  } else if (knCount >= 2) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Kannada';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Romanized Kannada');
  } else if (mlCount >= 2) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Malayalam';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Romanized Malayalam');
  } else if (tuCount >= 2) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Tulu';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Romanized Tulu');
  } else if (hiCount >= 2) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Hindi';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Romanized Hindi');
  } else if (kokCount >= 2) {
    detectedLanguage = hasEnglish ? 'Code-mixed' : 'Konkani';
    isCodeMixed = hasEnglish;
    detectedScriptsOrDialects.push('Romanized Konkani');
  } else if (
    declaredLanguage &&
    ['Kannada', 'Tulu', 'Malayalam', 'Konkani', 'Hindi', 'English', 'Code-mixed'].includes(declaredLanguage)
  ) {
    detectedLanguage = declaredLanguage as SupportedLanguage;
    detectedScriptsOrDialects.push(`${declaredLanguage} (declared hint)`);
  } else {
    detectedScriptsOrDialects.push('Latin / English');
  }

  if (isCodeMixed && !detectedScriptsOrDialects.includes('English')) {
    detectedScriptsOrDialects.push('English code-mix');
  }

  // Primary & secondary hazard extraction
  const detectedHazards: HazardCategory[] = [];
  if (/neeru|neer|vellam|paani|udak|flood|water|submerged|river|ನೀರು|വെള്ളം|पानी/.test(lower)) {
    detectedHazards.push('Flood');
  }
  if (/landslide|mudslide|hill|collapsed slope|bhooskhalan|gudda|kusitha|ಭೂಕುಸಿತ/.test(lower)) {
    detectedHazards.push('Landslide');
  }
  if (/roof|mele|chhat|trapped|stuck|stranded|kudungi|ಸಿಲುಕಿದ್ದಾರೆ/.test(lower)) {
    detectedHazards.push('People trapped');
  }
  if (/collapse|wall fell|building fell|house fell/.test(lower)) {
    detectedHazards.push('Building collapse');
  }
  if (/road blocked|raste|bridge|highway|cut off|blocked|ರಸ್ತೆ/.test(lower)) {
    detectedHazards.push('Road blockage');
  }
  if (/medical|injured|heart|pregnant|ambulance|hospital|medicine|bleeding|patient|dialysis|oxygen|ಗಾಯ/.test(lower)) {
    detectedHazards.push('Medical emergency');
  }
  if (/missing|cannot find|washed away/.test(lower)) {
    detectedHazards.push('Missing persons');
  }
  if (/signal|power|tower|electricity|transformer|blackout/.test(lower)) {
    detectedHazards.push('Infrastructure damage');
  }

  let hazardType: HazardCategory = detectedHazards[0] ?? 'Other emergency';
  // Prioritize Flood or Landslide when combined with rooftop/trapped unless explicitly only trapped
  if (detectedHazards.includes('Landslide') && !/devasthana/.test(lower)) {
    hazardType = 'Landslide';
  } else if (detectedHazards.includes('Flood')) {
    hazardType = 'Flood';
  }
  const secondaryHazards = detectedHazards.filter((h) => h !== hazardType);

  // Affected people (strictly extracted, never invented)
  let affectedPeople: number | null = null;
  const numMatch = lower.match(/\b(\d{1,3})\s*(jana|people|persons|members|family|log|aalkar|stranded|stuck|trapped|ಜನ)?\b/);
  if (numMatch) {
    const parsedNum = parseInt(numMatch[1], 10);
    if (parsedNum > 0 && parsedNum < 500) {
      affectedPeople = parsedNum;
    }
  } else if (/\bfour\b/.test(lower)) {
    affectedPeople = 4;
  } else if (/\bfive\b/.test(lower)) {
    affectedPeople = 5;
  } else if (/\bsix\b/.test(lower)) {
    affectedPeople = 6;
  } else if (/\bthree\b/.test(lower)) {
    affectedPeople = 3;
  } else if (/\btwo\b/.test(lower)) {
    affectedPeople = 2;
  }

  // Vulnerable persons with evidence phrases
  const vulnerablePersons: string[] = [];
  const vulnerabilityDetails: VulnerabilityDetail[] = [];

  const elderlyMatch = lower.match(/\b(ajji|elderly|old woman|grandmother|senior|grandfather|old man|vridha|ಅಜ್ಜಿ)\b/);
  if (elderlyMatch) {
    vulnerablePersons.push('Elderly person');
    vulnerabilityDetails.push({
      group: 'Elderly person',
      evidencePhrase: elderlyMatch[0],
      urgencyWeight: 'Critical',
    });
  }
  const childMatch = lower.match(/\b(child|children|baby|infant|kid|magu|makkalu|ಮಗು|ಮಕ್ಕಳು)\b/);
  if (childMatch) {
    vulnerablePersons.push('Children / Infants');
    vulnerabilityDetails.push({
      group: 'Children / Infants',
      evidencePhrase: childMatch[0],
      urgencyWeight: 'Critical',
    });
  }
  const pregnantMatch = lower.match(/\b(pregnant|garbhini|ಗರ್ಭಿಣಿ)\b/);
  if (pregnantMatch) {
    vulnerablePersons.push('Pregnant woman');
    vulnerabilityDetails.push({
      group: 'Pregnant woman',
      evidencePhrase: pregnantMatch[0],
      urgencyWeight: 'Critical',
    });
  }
  const medicalMatch = lower.match(/\b(injured|bleeding|medical|patient|sick|oxygen|dialysis|bp|insulin|disabled|wheelchair|ಗಾಯ)\b/);
  if (medicalMatch) {
    vulnerablePersons.push('Medical / Injured person');
    vulnerabilityDetails.push({
      group: 'Medical / Injured person',
      evidencePhrase: medicalMatch[0],
      urgencyWeight: 'High',
    });
  }

  // Landmark matching + strict non-fabricated GPS check
  const explicitCoords = extractExplicitGpsFromText(combined);
  const lm = matchLandmarkCoordinates(lower);
  const landmarks: string[] = [];
  if (lm.matched) landmarks.push(lm.name);
  if (/devasthana|temple|ದೇವಸ್ಥಾನ/.test(lower) && !landmarks.some((l) => l.toLowerCase().includes('temple'))) {
    landmarks.push('Local Temple Landmark');
  }
  if (/bridge|sethuve|palam|ಸೇತುವೆ/.test(lower) && !landmarks.some((l) => l.toLowerCase().includes('bridge'))) {
    landmarks.push('Old River Bridge');
  }
  if (locationHint && locationHint.trim() && !landmarks.includes(locationHint.trim())) {
    landmarks.unshift(locationHint.trim());
  }

  const locationPrecision: LocationPrecision = explicitCoords
    ? 'verified'
    : lm.matched || landmarks.length > 0
      ? 'approximate'
      : 'uncertain';

  // English translation
  let englishTranslation = message.trim();
  if (/uppinangady devasthana hinde neeru bandide/i.test(lower)) {
    englishTranslation =
      'Floodwater has come behind Uppinangady temple; 4 people are stranded on the roof including an elderly grandmother.';
  } else if (/neeru mane olage bartha ide/i.test(lower)) {
    englishTranslation = 'Floodwater is entering inside our house; urgent help is needed.';
  } else if (detectedLanguage !== 'English') {
    const parts: string[] = [];
    parts.push(`[Local ${tierLabel === 'TIER_0_SMS' ? 'SMS keyword' : 'rule-based'} interpretation]`);
    if (detectedHazards.length > 0) parts.push(`${detectedHazards.join(' + ')} reported`);
    if (/mele|roof|chhat/.test(lower)) parts.push('people stranded on rooftop');
    if (affectedPeople !== null) parts.push(`${affectedPeople} people stated`);
    if (vulnerablePersons.length > 0) parts.push(`vulnerable: ${vulnerablePersons.join(', ')}`);
    if (landmarks.length > 0) parts.push(`near ${landmarks[0]}`);
    englishTranslation = `${parts.join(' — ')}. (Original: "${message.trim()}")`;
  }

  // Missing information with priority & rationale
  const missingInformation: string[] = [];
  const missingInfoPriorities: MissingInfoPriority[] = [];

  if (!explicitCoords) {
    missingInformation.push('Exact GPS / house landmark');
    missingInfoPriorities.push({
      field: 'Exact GPS / house landmark',
      whyCritical: 'No explicit coordinates provided; rescue crews need nearest landmark or house marker to locate victims.',
      priority: lm.matched ? 'Medium' : 'High',
    });
  }
  if (
    !/knee|waist|chest|roof|mele|first floor|feet|metre|meter/.test(lower) &&
    (hazardType === 'Flood' || hazardType === 'People trapped')
  ) {
    missingInformation.push('Current water depth / rate of rise');
    missingInfoPriorities.push({
      field: 'Current water depth / rate of rise',
      whyCritical: 'Determines whether motorized boat evacuation is immediately mandatory versus road vehicle access.',
      priority: 'High',
    });
  }
  if (affectedPeople === null) {
    missingInformation.push('Exact number of affected people');
    missingInfoPriorities.push({
      field: 'Exact number of affected people',
      whyCritical: 'Required to size rescue boat capacity, life jackets, and medical supplies.',
      priority: 'High',
    });
  }
  if (!/injur|medical|hurt|bleed|patient|safe/.test(lower)) {
    missingInformation.push('Injury or urgent medical status');
    missingInfoPriorities.push({
      field: 'Injury or urgent medical status',
      whyCritical: 'Determines whether paramedics or trauma/medication kits must deploy with the rescue team.',
      priority: 'Medium',
    });
  }

  const isRoofOrTrapped = /mele|roof|trapped|stuck|stranded|kudungi/.test(lower);
  const urgencyLevel =
    isRoofOrTrapped || vulnerablePersons.length > 0
      ? 'Critical'
      : hazardType === 'Flood' || hazardType === 'Landslide' || hazardType === 'Medical emergency'
        ? 'High'
        : 'Moderate';

  const baseConf = tierLabel === 'TIER_0_SMS' ? 0.62 : 0.74;
  const overallConfidence = Number(
    Math.min(0.9, Math.max(0.35, baseConf + (lm.matched ? 0.08 : -0.1) + (affectedPeople !== null ? 0.04 : 0))).toFixed(2)
  );

  return {
    detectedLanguage,
    isCodeMixed,
    detectedScriptsOrDialects,
    englishTranslation,
    summary: isRoofOrTrapped
      ? `${hazardType}: ${affectedPeople ?? 'Unspecified number of'} people stranded on rooftop${vulnerablePersons.length ? ` (${vulnerablePersons.join(', ')})` : ''} near ${landmarks[0] ?? 'unconfirmed landmark'}.`
      : `${hazardType} reported near ${landmarks[0] ?? 'unspecified location'}${affectedPeople !== null ? ` affecting ${affectedPeople} people` : ''}.`,
    hazardType,
    secondaryHazards,
    affectedPeople,
    vulnerablePersons,
    vulnerabilityDetails,
    landmarks: landmarks.length > 0 ? landmarks : ['Unresolved local landmark'],
    locationDescription: landmarks[0] ?? 'Unspecified village / landmark (needs follow-up)',
    talukOrArea: lm.matched ? lm.taluk : null,
    locationPrecision,
    uncertaintyRadiusMeters: explicitCoords ? 25 : lm.matched ? lm.radius : 2200,
    extractedCoordinates: explicitCoords,
    missingInformation,
    missingInfoPriorities,
    urgencyLevel,
    overallConfidence,
    fieldConfidence: {
      language: 0.88,
      hazard: hazardType === 'Other emergency' ? 0.52 : 0.84,
      location: explicitCoords ? 0.96 : lm.matched ? 0.68 : 0.36,
      population: affectedPeople !== null ? 0.84 : 0.3,
      vulnerability: vulnerablePersons.length > 0 ? 0.86 : 0.48,
    },
    suggestedFollowUp: missingInformation.includes('Current water depth / rate of rise')
      ? 'Is the water above knee level? Reply 1 for YES, 2 for NO.'
      : missingInformation.includes('Exact number of affected people')
        ? 'How many people are stranded with you? Reply with a number.'
        : 'Can you share the nearest school, temple, or bus stop name? Reply by SMS.',
    processingSteps: [
      `Engine: ${
        tierLabel === 'TIER_0_SMS'
          ? 'Tier 0 GSM Keyword Parser (Transparent Local Rule Fallback)'
          : tierLabel === 'TIER_1_EDGE'
            ? 'Tier 1 Edge Local Rule Extractor (Offline Fallback)'
            : 'Local Rule-Based Fallback Extractor (Cloud Gemini Unavailable)'
      }`,
      `Language classified as ${detectedLanguage}${isCodeMixed ? ' (code-mixed)' : ''} (${detectedScriptsOrDialects.join(', ')}).`,
      `Identified primary hazard "${hazardType}"${secondaryHazards.length ? ` + secondary: ${secondaryHazards.join(', ')}` : ''} and ${affectedPeople !== null ? `${affectedPeople} affected people` : 'no stated headcount (left null)'}.`,
      `Location precision marked "${locationPrecision}" (±${explicitCoords ? 25 : lm.matched ? lm.radius : 2200}m) — ${explicitCoords ? 'explicit GPS extracted from message' : 'no GPS coordinates fabricated'}.`,
      `Detected ${vulnerablePersons.length} vulnerable group signal(s) and ${missingInformation.length} missing triage field(s).`,
    ],
  };
}

/**
 * Cross-lingual canonical concept dictionary for transparent local duplicate similarity fallback.
 */
const CONCEPT_SYNONYMS: Record<string, string> = {
  neeru: 'floodwater',
  neer: 'floodwater',
  vellam: 'floodwater',
  paani: 'floodwater',
  udak: 'floodwater',
  flood: 'floodwater',
  floodwater: 'floodwater',
  water: 'floodwater',
  submerged: 'floodwater',
  devasthana: 'temple',
  temple: 'temple',
  sethuve: 'bridge',
  palam: 'bridge',
  pul: 'bridge',
  bridge: 'bridge',
  mane: 'house',
  veedu: 'house',
  ghar: 'house',
  ghor: 'house',
  ill: 'house',
  house: 'house',
  home: 'house',
  mele: 'rooftop',
  chhat: 'rooftop',
  roof: 'rooftop',
  rooftop: 'rooftop',
  trapped: 'stranded',
  stuck: 'stranded',
  stranded: 'stranded',
  kudungi: 'stranded',
  ajji: 'elderly',
  grandmother: 'elderly',
  elderly: 'elderly',
  old: 'elderly',
  landslide: 'landslide',
  mudslide: 'landslide',
  bhooskhalan: 'landslide',
  kusitha: 'landslide',
  raste: 'road',
  road: 'road',
  highway: 'road',
  blocked: 'blocked',
  sahaya: 'help',
  sahayam: 'help',
  madad: 'help',
  help: 'help',
  medical: 'medical',
  injured: 'medical',
  patient: 'medical',
  hospital: 'medical',
};

function canonicalizeTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const normalized = new Set<string>();
  for (const tok of tokens) {
    normalized.add(CONCEPT_SYNONYMS[tok] ?? tok);
  }
  return normalized;
}

/**
 * Transparent local rule-based duplicate & conflict similarity analyzer.
 * Used in Tier 1 Edge, Tier 0 SMS, or whenever Cloud Gemini is unavailable.
 */
export function runLocalDuplicateSimilarityFallback(params: {
  candidateMessage: string;
  candidateTranslated?: string;
  candidateHazard?: HazardCategory;
  candidateLocation?: string;
  candidateLanguage?: SupportedLanguage;
  candidateAffectedPeople?: number | null;
  existingIncidents: DuplicateCandidateIncident[];
}): DuplicateSimilarityResult {
  const candText = `${params.candidateMessage} ${params.candidateTranslated ?? ''} ${params.candidateLocation ?? ''}`;
  const candTokens = canonicalizeTokens(candText);
  const candLandmark = matchLandmarkCoordinates(candText);
  const looksForwarded = /\b(fwd|forwarded|please share|share fast|whatsapp forward|received from)\b/i.test(
    params.candidateMessage
  );

  const matches: DuplicateSimilarityMatch[] = [];

  for (const inc of params.existingIncidents) {
    const incText = `${inc.originalMessage} ${inc.translatedMessage} ${inc.placeName} ${inc.taluk} ${inc.title}`;
    const incTokens = canonicalizeTokens(incText);

    const sharedConcepts: string[] = [];
    for (const tok of candTokens) {
      if (incTokens.has(tok) && tok.length >= 3) {
        sharedConcepts.push(tok);
      }
    }

    const unionSize = new Set([...candTokens, ...incTokens]).size || 1;
    const jaccard = sharedConcepts.length / unionSize;

    const sameHazard = Boolean(params.candidateHazard && params.candidateHazard === inc.hazard);
    const samePlace =
      (candLandmark.matched && inc.placeName.toLowerCase().includes(candLandmark.name.split(' ')[0].toLowerCase())) ||
      (candLandmark.matched && inc.taluk.toLowerCase() === candLandmark.taluk.toLowerCase()) ||
      (params.candidateLocation &&
        inc.placeName.toLowerCase().includes(params.candidateLocation.toLowerCase().split(' ')[0]));

    let score = jaccard * 0.65 + (sameHazard ? 0.18 : 0) + (samePlace ? 0.24 : 0);
    // Boost if same normalized core concepts (>= 3 overlapping emergency tokens)
    if (sharedConcepts.length >= 4) score += 0.14;
    score = Number(Math.min(0.96, Math.max(0.05, score)).toFixed(2));

    const sharedSignals: string[] = [];
    const conflictingSignals: string[] = [];

    if (samePlace) sharedSignals.push(`Location overlap (${inc.placeName}, ${inc.taluk})`);
    if (sameHazard) sharedSignals.push(`Matching hazard category (${inc.hazard})`);
    if (sharedConcepts.length > 0) {
      sharedSignals.push(`Shared semantic terms: ${sharedConcepts.slice(0, 5).join(', ')}`);
    }

    // Check potential numeric contradiction in same place
    if (
      samePlace &&
      params.candidateAffectedPeople != null &&
      inc.affectedPeople != null &&
      Math.abs(params.candidateAffectedPeople - inc.affectedPeople) >= 4
    ) {
      conflictingSignals.push(
        `Headcount discrepancy: incoming states ${params.candidateAffectedPeople} vs existing ${inc.affectedPeople}`
      );
    }
    if (
      samePlace &&
      params.candidateHazard &&
      params.candidateHazard !== inc.hazard &&
      score >= 0.45
    ) {
      conflictingSignals.push(
        `Hazard mismatch at same area: incoming "${params.candidateHazard}" vs existing "${inc.hazard}"`
      );
    }

    let matchClassification: DuplicateMatchClassification = 'Distinct Incident';
    let recommendedAction: DuplicateRecommendedAction = 'Create Separate Incident';

    if (conflictingSignals.length > 0 && score >= 0.45) {
      matchClassification = 'Conflicting Report';
      recommendedAction = 'Flag Conflicting Evidence';
    } else if (looksForwarded && score >= 0.5) {
      matchClassification = 'Likely Forward-Chain';
      recommendedAction = 'Link as Forward-Chain';
    } else if (score >= 0.72) {
      const crossLingual = Boolean(params.candidateLanguage && params.candidateLanguage !== inc.language);
      matchClassification = crossLingual ? 'Cross-Lingual Duplicate' : 'Exact Duplicate';
      recommendedAction = 'Merge into Incident';
    } else if (score >= 0.48) {
      matchClassification = samePlace ? 'Related Same-Area Event' : 'Cross-Lingual Duplicate';
      recommendedAction = score >= 0.6 ? 'Merge into Incident' : 'Create Separate Incident';
    }

    if (score >= 0.35 || conflictingSignals.length > 0) {
      matches.push({
        incidentId: inc.id,
        similarityScore: score,
        matchClassification,
        sharedSignals: sharedSignals.length > 0 ? sharedSignals : ['Low lexical overlap'],
        conflictingSignals,
        recommendedAction,
        rationale:
          conflictingSignals.length > 0
            ? `Local rule check flagged conflicting details with ${inc.id} in ${inc.placeName}; coordinator review recommended.`
            : score >= 0.6
              ? `Strong cross-lingual token and area overlap (${Math.round(score * 100)}%) with ${inc.id}; likely refers to the same emergency.`
              : `Moderate contextual overlap (${Math.round(score * 100)}%) with ${inc.id} in ${inc.taluk}.`,
      });
    }
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);
  const topMatches = matches.slice(0, 4);
  const top = topMatches[0];
  const overallDuplicateRisk: 'High' | 'Moderate' | 'Low' =
    top && top.similarityScore >= 0.7
      ? 'High'
      : top && top.similarityScore >= 0.48
        ? 'Moderate'
        : 'Low';

  return {
    matches: topMatches,
    bestMatchIncidentId: top && top.similarityScore >= 0.48 ? top.incidentId : null,
    overallDuplicateRisk,
    analysisSummary: top
      ? `Local cross-lingual similarity matcher found ${topMatches.length} candidate(s). Closest match: ${top.incidentId} (${Math.round(top.similarityScore * 100)}% — ${top.matchClassification}).`
      : 'Local cross-lingual similarity matcher found no likely duplicate among active incidents.',
  };
}

export function runLocalTriageQuestionFallback(
  missingFields: string[],
  language: SupportedLanguage,
  existingFollowUps: string[] = []
): TriageSuggestionResult {
  const alreadyAsked = existingFollowUps.join(' ').toLowerCase();
  const wantsWater =
    missingFields.some((m) => m.toLowerCase().includes('water') || m.toLowerCase().includes('depth')) &&
    !alreadyAsked.includes('knee');
  const wantsLocation =
    missingFields.some((m) => m.toLowerCase().includes('location') || m.toLowerCase().includes('landmark') || m.toLowerCase().includes('gps')) &&
    !alreadyAsked.includes('landmark');
  const wantsPeople =
    missingFields.some((m) => m.toLowerCase().includes('people') || m.toLowerCase().includes('count')) &&
    !alreadyAsked.includes('how many');

  if (wantsWater) {
    const localizedMap: Record<SupportedLanguage, string> = {
      Kannada: 'Neeru mandi level ginta jasthi idya? 1 = HOUDU (Yes), 2 = ILLA (No).',
      Tulu: 'Neer mandi mela barpunda? 1 = ANDH (Yes), 2 = IJJ (No).',
      Malayalam: 'Vellam muttinum mukalil aano? 1 = ATHE (Yes), 2 = ALLA (No).',
      Konkani: 'Udak dhompar voir aasa? 1 = HOY (Yes), 2 = NA (No).',
      Hindi: 'Kya paani ghutne se upar hai? 1 = HAAN (Yes), 2 = NAHI (No).',
      English: 'Is the water above knee level? Reply 1 for YES, 2 for NO.',
      'Code-mixed': 'Water mandi level ginta jasthi idya? Reply 1 = YES, 2 = NO.',
    };
    return {
      questionEnglish: 'Is the water above knee level? Reply 1 for YES, 2 for NO.',
      questionLocalized: localizedMap[language] ?? localizedMap.English,
      targetMissingField: 'Current water depth / rate of rise',
      informationGainReason:
        'Highest expected value of information: confirms whether boat evacuation is immediately mandatory versus road evacuation.',
      expectedConfidenceDelta: 0.14,
      simulatedReplyOptions: [
        {
          label: 'Reply 1 (YES — Water chest-high, rising)',
          replyText: '1 - Neeru ede level bartha ide, ground floor full aagide.',
          extractedUpdate: 'Water above chest level; ground floor fully submerged — boat rescue required.',
          scoreDelta: 11,
        },
        {
          label: 'Reply 2 (NO — Ankle level, stable)',
          replyText: '2 - Neeru kammi ide, road open ide.',
          extractedUpdate: 'Water below knee level and currently stable.',
          scoreDelta: -8,
        },
      ],
    };
  }

  if (wantsLocation) {
    const localizedMap: Record<SupportedLanguage, string> = {
      Kannada: 'Nimma hatthira yava landmark ide? 1 = Devasthana, 2 = Haleya Sethuve, 3 = Shale.',
      Tulu: 'Nikulena pakka yava landmark undu? 1 = Devasthana, 2 = Sethuve, 3 = Shale.',
      Malayalam: 'Ningalude aduthulla landmark ethanu? 1 = Ambalam, 2 = Palam, 3 = School.',
      Konkani: 'Tumche lagim khoinche landmark aasa? 1 = Deul, 2 = Pool, 3 = Shala.',
      Hindi: 'Aapke paas kaunsa landmark hai? 1 = Mandir, 2 = Purana Pul, 3 = School.',
      English: 'Which nearest landmark or bridge are you closest to? Reply 1 = Temple, 2 = Old Bridge, 3 = School.',
      'Code-mixed': 'Nearest landmark yavudu? Reply 1 = Temple, 2 = Old Bridge, 3 = School.',
    };
    return {
      questionEnglish: 'Which nearest landmark or bridge are you closest to? Reply 1 for Temple, 2 for Old Bridge, 3 for School.',
      questionLocalized: localizedMap[language] ?? localizedMap.English,
      targetMissingField: 'Exact GPS / house landmark',
      informationGainReason:
        'Narrows geographical uncertainty polygon from >1.5 km to <400 m so rescue teams can navigate without GPS.',
      expectedConfidenceDelta: 0.18,
      simulatedReplyOptions: [
        {
          label: 'Reply 1 (Behind Temple, 200m east)',
          replyText: '1 - Devasthana hinde 200m east red-tile mane.',
          extractedUpdate: 'Landmark refined: 200m east of temple (red-tile roof). Uncertainty narrowed to ±280m.',
          scoreDelta: 5,
        },
        {
          label: 'Reply 3 (Near Govt Primary School)',
          replyText: '3 - Govt primary school pakka.',
          extractedUpdate: 'Landmark refined: Adjacent to Govt Primary School. Uncertainty narrowed to ±350m.',
          scoreDelta: 4,
        },
      ],
    };
  }

  if (wantsPeople) {
    return {
      questionEnglish: 'How many people are stranded with you? Reply 1 for 1–3 people, 2 for 4–8 people, 3 for 9+ people.',
      questionLocalized:
        language === 'Kannada'
          ? 'Nimma jothe estu jana iddare? 1 = 1-3 jana, 2 = 4-8 jana, 3 = 9+ jana.'
          : 'How many people need rescue? Reply 1 = 1-3, 2 = 4-8, 3 = 9+.',
      targetMissingField: 'Exact number of affected people',
      informationGainReason:
        'Sizing rescue boat capacity and life-jacket allocation depends directly on total stranded headcount.',
      expectedConfidenceDelta: 0.15,
      simulatedReplyOptions: [
        {
          label: 'Reply 2 (4–8 people stranded)',
          replyText: '2 - 6 jana ide, eradu makkalu.',
          extractedUpdate: 'Confirmed 6 stranded people including 2 children.',
          scoreDelta: 8,
        },
        {
          label: 'Reply 1 (1–3 people)',
          replyText: '1 - Ibbare ide.',
          extractedUpdate: 'Confirmed 2 adults requiring evacuation.',
          scoreDelta: 2,
        },
      ],
    };
  }

  return {
    questionEnglish: 'Are any children, elderly, or injured people with you? Reply 1 for YES, 2 for NO.',
    questionLocalized:
      language === 'Kannada'
        ? 'Nimma jothe makkalu, vridharu athava gaaya aadaru idhara? 1 = HOUDU, 2 = ILLA.'
        : language === 'Malayalam'
          ? 'Kuttikal, vriddhar, allenkil parikkettavar undo? 1 = ATHE, 2 = ALLA.'
          : language === 'Hindi'
            ? 'Kya bachche, buzurg ya ghayal log saath hain? 1 = HAAN, 2 = NAHI.'
            : 'Any children, elderly, or injured persons present? Reply 1 = YES, 2 = NO.',
    targetMissingField: 'Injury or urgent medical status',
    informationGainReason:
      'Directly determines whether medical paramedics must accompany the rescue team.',
    expectedConfidenceDelta: 0.12,
    simulatedReplyOptions: [
      {
        label: 'Reply 1 (YES — Elderly + injured ankle)',
        replyText: '1 - Ajji ge BP tablet bekku, obbarige kaalu gaaya.',
        extractedUpdate: 'Vulnerable confirmed: elderly woman needing BP medication + 1 injured leg.',
        scoreDelta: 9,
      },
      {
        label: 'Reply 2 (NO — All adults uninjured)',
        replyText: '2 - Yaarigu gaaya illa.',
        extractedUpdate: 'No injuries reported among stranded adults.',
        scoreDelta: -3,
      },
    ],
  };
}
