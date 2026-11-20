export type NavigationModule =
  | 'command-center'
  | 'live-demo'
  | 'live-feed'
  | 'incident-intelligence'
  | 'silence-radar'
  | 'active-triage'
  | 'evidence-verification'
  | 'geospatial'
  | 'rescue-coordination'
  | 'analytics'
  | 'system-health'
  | 'settings';

export type NetworkTier = 'TIER_2_CLOUD' | 'TIER_1_EDGE' | 'TIER_0_SMS';

export type DisasterScenarioId = 'netravati-flood' | 'kodagu-landslide';

export type CoordinatorRole =
  | 'District Emergency Coordinator'
  | 'Triage Intelligence Analyst'
  | 'Rescue Dispatch Officer'
  | 'Read-Only Observer';

export type SourceChannel =
  | 'SMS'
  | 'Missed-call IVR'
  | 'WhatsApp text'
  | 'WhatsApp voice note'
  | 'WhatsApp photo'
  | 'Telegram'
  | 'Emergency call transcript'
  | 'Social media'
  | 'Rainfall sensor'
  | 'River gauge sensor'
  | 'Volunteer PWA';

export type SupportedLanguage =
  | 'Kannada'
  | 'Tulu'
  | 'Malayalam'
  | 'Konkani'
  | 'Hindi'
  | 'English'
  | 'Code-mixed';

export type HazardCategory =
  | 'Flood'
  | 'Landslide'
  | 'Building collapse'
  | 'Road blockage'
  | 'People trapped'
  | 'Medical emergency'
  | 'Missing persons'
  | 'Infrastructure damage'
  | 'Other emergency';

export type LocationPrecision = 'verified' | 'approximate' | 'uncertain';

export type VerificationStatus =
  | 'Unverified'
  | 'Corroborated'
  | 'Conflicting evidence'
  | 'Potentially recycled image'
  | 'Verified by coordinator';

export type SeverityLevel = 'Critical' | 'High' | 'Moderate' | 'Low';

export type RescueTaskStatus =
  | 'Pending'
  | 'Assigned'
  | 'En route'
  | 'On site'
  | 'Completed'
  | 'Cancelled';

export type FollowUpStatus =
  | 'Draft'
  | 'Sent'
  | 'Delivered (simulated)'
  | 'Awaiting response'
  | 'Answer received (simulated)'
  | 'Information updated';

export interface LocationEstimate {
  placeName: string;
  landmark: string;
  taluk: string;
  /** Simulated regional coordinates for Netravati schematic/GIS visualization — never claimed as verified victim GPS unless precision === 'verified' */
  lat: number;
  lng: number;
  precision: LocationPrecision;
  gpsAvailable: boolean;
  uncertaintyRadiusMeters: number;
  confidence: number;
  candidateMatches: {
    name: string;
    matchScore: number;
    distanceHint: string;
  }[];
  requiredForResolution: string[];
}

export interface ScoreContributionFactor {
  id: string;
  label: string;
  points: number; // positive or negative
  category: 'severity' | 'vulnerability' | 'hazard-sensor' | 'corroboration' | 'bias-correction' | 'rumour-penalty';
  detail: string;
}

export interface NeedEstimate {
  rawReportCount: number;
  expectedReportingRate: number; // 0.05 to 1.0
  populationContext: number;
  connectivityScore: number; // 0 to 100
  languageAccessibility: number; // 0 to 100
  literacyAccessScore: number; // 0 to 100
  historicalBaselineRate: number;
  biasCorrectedNeedIndex: number;
  uncertaintyMargin: number; // +/-
  finalNeedScore: number; // 0 to 100
  counterfactualNote: string;
  factors: ScoreContributionFactor[];
}

export interface EmergencyReport {
  id: string;
  incidentId: string;
  originalMessage: string;
  translatedMessage: string;
  language: SupportedLanguage;
  sourceChannel: SourceChannel;
  reporterAlias: string;
  reporterPhoneMasked: string;
  reporterPhoneRaw: string;
  receivedAt: string;
  isDuplicate: boolean;
  forwardedFromId?: string;
  forwardChainDepth: number;
  similarityScore: number; // 0 to 1
  imageAttachment?: {
    caption: string;
    pHash: string;
    matchedArchiveYear?: number;
    hammingDistance?: number;
    flaggedAsPotentiallyRecycled: boolean;
  };
  isSimulatedDemoData: true;
}

export interface EvidenceRecord {
  id: string;
  incidentId: string;
  type:
    | 'independent_report'
    | 'duplicate_merge'
    | 'forward_chain'
    | 'recycled_image_check'
    | 'sensor_corroboration'
    | 'conflicting_claim'
    | 'coordinator_verification';
  label: string;
  detail: string;
  reliabilityDelta: number;
  sourceId?: string;
  parentNodeId?: string;
  timestamp: string;
}

export interface Incident {
  id: string;
  title: string;
  summary: string;
  originalMessage: string;
  processedMessage: string;
  language: SupportedLanguage;
  source: SourceChannel;
  receivedAt: string;
  hazard: HazardCategory;
  severity: SeverityLevel;
  affectedPeople: number | null;
  vulnerableGroups: string[];
  missingInformation: string[];
  location: LocationEstimate;
  confidence: number; // 0 to 1
  fieldConfidence: {
    language: number;
    hazard: number;
    location: number;
    population: number;
    vulnerability: number;
  };
  verificationStatus: VerificationStatus;
  needEstimate: NeedEstimate;
  reportIds: string[];
  duplicateCount: number;
  coordinatorDecision: {
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    overriddenScore?: number;
    overrideReason?: string;
  };
  recommendedResources: string[];
  areaType: 'Urban' | 'Peri-urban' | 'Remote village';
  flaggedForHumanReview: boolean;
  isSimulatedDemoData: true;
}

export interface DarkZoneActionRecord {
  id: string;
  actionType:
    | 'IVR Callback'
    | 'SMS Verification Request'
    | 'Local Volunteer Contact'
    | 'Field Verification Request'
    | 'Drone Assessment Request';
  initiatedBy: string;
  timestamp: string;
  status: 'Dispatched (simulated)' | 'Awaiting response' | 'Acknowledged (simulated)';
  notes: string;
}

export interface DarkZone {
  id: string;
  villageName: string;
  taluk: string;
  lat: number;
  lng: number;
  population: number;
  expectedReports: number;
  actualReports: number;
  historicalBaseline: number;
  connectivityPercent: number;
  connectivityStatus: 'Severely Degraded' | 'Intermittent' | 'Blackout Suspected';
  nearbyGaugeName: string;
  nearbyGaugeLevelM: number;
  gaugeDangerLevelM: number;
  rainfallMmHr: number;
  roadStatus: string;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  lastCommunicationAt: string;
  minutesSilent: number;
  explanation: string;
  actions: DarkZoneActionRecord[];
  verificationOutcome?:
    | 'Unverified'
    | 'Verified Safe (Outage Only)'
    | 'Emergency Confirmed (Escalated)'
    | 'Unreachable — Escalated';
  linkedIncidentId?: string;
  isSimulatedDemoData: true;
}

export interface FollowUpResponse {
  id: string;
  questionId: string;
  replyText: string;
  translatedReply: string;
  receivedAt: string;
  extractedField: string;
  extractedValue: string;
  confidenceGain: number;
  needScoreDelta: number;
}

export interface FollowUpQuestion {
  id: string;
  incidentId: string;
  questionEnglish: string;
  questionLocalized: string;
  language: SupportedLanguage;
  channel: 'SMS' | 'Missed-call IVR' | 'WhatsApp text';
  targetMissingField: string;
  informationGainReason: string;
  status: FollowUpStatus;
  createdAt: string;
  sentAt?: string;
  response?: FollowUpResponse;
  simulatedOptions: {
    label: string;
    replyText: string;
    extractedUpdate: string;
    scoreDelta: number;
    confidenceGain: number;
    resolvedField: string;
  }[];
}

export interface RescueTeam {
  id: string;
  name: string;
  type: 'Boat rescue' | 'Medical response' | 'Fire and rescue' | 'SDRF/NDRF' | 'Local volunteers';
  currentLocation: string;
  lat: number;
  lng: number;
  availableResources: string[];
  personnelCount: number;
  assignedIncidentId: string | null;
  status: 'Available' | 'Assigned' | 'En route' | 'On site' | 'Standby';
  etaMinutes?: number;
}

export interface RescueTask {
  id: string;
  incidentId: string;
  teamId: string;
  assignedBy: string;
  assignedAt: string;
  status: RescueTaskStatus;
  recommendedResources: string[];
  routeSummary: string;
  hazardWarning: string | null;
  estimatedMinutes: number;
  notes: string;
  isSimulatedDispatch: true;
}

export interface SensorReading {
  id: string;
  name: string;
  type: 'River Gauge' | 'Rainfall Station';
  lat: number;
  lng: number;
  value: number;
  unit: string;
  dangerThreshold: number;
  trend: 'Rising rapidly' | 'Rising' | 'Stable' | 'Receding';
  status: 'Danger' | 'Warning' | 'Normal';
  updatedAt: string;
}

export interface RoadClosure {
  id: string;
  roadName: string;
  location: string;
  lat: number;
  lng: number;
  reason: string;
  severity: 'Impassable' | 'Partially Submerged';
}

export interface ReliefCenter {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  capacity: number;
  occupancy: number;
  facilities: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: CoordinatorRole;
  category:
    | 'AI Processing'
    | 'Evidence & Merge'
    | 'Priority Override'
    | 'Approval'
    | 'Active Triage'
    | 'Silence Radar'
    | 'Rescue Dispatch'
    | 'Network Mode'
    | 'Privacy & Security';
  summary: string;
  targetId?: string;
}

export interface SystemActivityItem {
  id: string;
  timestamp: string;
  type:
    | 'ai_extract'
    | 'incident_new'
    | 'duplicate_merge'
    | 'verification'
    | 'followup'
    | 'dark_zone'
    | 'coordinator'
    | 'network';
  title: string;
  detail: string;
  incidentId?: string;
}

export interface DemoReplayStep {
  stepNumber: number;
  timeLabel: string;
  title: string;
  stage: 'LISTEN' | 'UNDERSTAND & LOCATE' | 'FUSE & VERIFY' | 'ESTIMATE NEED & ASK BACK' | 'COORDINATE RESCUE' | 'OFFLINE RESILIENCE';
  description: string;
  targetModule: NavigationModule;
  highlightMetrics: string;
}

export interface SystemStatus {
  networkTier: NetworkTier;
  geminiAvailable: boolean;
  lastSyncedAt: string;
  pendingOfflineSyncCount: number;
  edgeModelLabel: string;
  smsModemStatus: string;
  piiRedactionEnabled: boolean;
  humanReviewThreshold: number; // default 0.70
}
