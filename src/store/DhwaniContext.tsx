import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_REPLAY_STEPS, SCENARIOS, type ScenarioDataset } from '../data/netravatiScenario';
import { checkServerHealth } from '../services/dhwaniApi';
import type {
  AuditLog,
  CoordinatorRole,
  DarkZone,
  DarkZoneActionRecord,
  DisasterScenarioId,
  EmergencyReport,
  EvidenceRecord,
  FollowUpQuestion,
  Incident,
  NavigationModule,
  NetworkTier,
  RescueTask,
  RescueTaskStatus,
  RescueTeam,
  SystemActivityItem,
  SystemStatus,
  VerificationStatus,
} from '../types/dhwani';

const STORAGE_KEY = 'dhwani_prototype_state_v1';

interface CoordinatorProfile {
  name: string;
  role: CoordinatorRole;
  station: string;
  authenticated: boolean;
}

interface PersistedState {
  scenarioId: DisasterScenarioId;
  incidents: Incident[];
  reports: EmergencyReport[];
  evidenceRecords: EvidenceRecord[];
  darkZones: DarkZone[];
  followUps: FollowUpQuestion[];
  rescueTeams: RescueTeam[];
  rescueTasks: RescueTask[];
  auditLogs: AuditLog[];
  activityFeed: SystemActivityItem[];
  systemStatus: SystemStatus;
  coordinator: CoordinatorProfile;
  replayStep: number;
  demoStats: ScenarioDataset['demoStats'];
}

interface DhwaniContextValue {
  activeModule: NavigationModule;
  setActiveModule: (mod: NavigationModule) => void;
  selectedIncidentId: string;
  setSelectedIncidentId: (id: string) => void;
  openIncidentDetail: (id: string, target?: NavigationModule) => void;

  scenarioId: DisasterScenarioId;
  scenarioMeta: ScenarioDataset;
  switchScenario: (id: DisasterScenarioId) => void;
  resetDemoState: () => void;

  incidents: Incident[];
  reports: EmergencyReport[];
  evidenceRecords: EvidenceRecord[];
  darkZones: DarkZone[];
  followUps: FollowUpQuestion[];
  rescueTeams: RescueTeam[];
  rescueTasks: RescueTask[];
  auditLogs: AuditLog[];
  activityFeed: SystemActivityItem[];
  demoStats: ScenarioDataset['demoStats'];
  systemStatus: SystemStatus;
  coordinator: CoordinatorProfile;

  // Coordinator & RBAC
  setCoordinatorProfile: (profile: Partial<CoordinatorProfile>) => void;
  canApproveOrDispatch: boolean;
  canEditTriage: boolean;

  // Network & Offline Mode controls
  setNetworkTier: (tier: NetworkTier, reason?: string) => void;
  syncOfflineQueue: () => void;
  setPiiRedaction: (enabled: boolean) => void;
  setHumanReviewThreshold: (threshold: number) => void;

  // Operational mutations
  addIncidentFromIntake: (incident: Incident, report: EmergencyReport, evidence: EvidenceRecord) => void;
  attachReportToIncident: (
    targetIncidentId: string,
    report: EmergencyReport,
    evidence: EvidenceRecord,
    options?: { markConflict?: boolean; markForwardChain?: boolean }
  ) => void;
  approveIncidentPriority: (incidentId: string) => void;
  overrideIncidentScore: (incidentId: string, newScore: number, reason: string) => void;
  updateIncidentVerification: (incidentId: string, status: VerificationStatus, note?: string) => void;
  mergeIncidents: (sourceIncidentId: string, targetIncidentId: string) => void;
  splitIncidentReport: (incidentId: string, reportId: string) => void;
  requestAdditionalEvidence: (incidentId: string, note: string) => void;
  updateIncidentLocation: (
    incidentId: string,
    patch: {
      placeName: string;
      landmark: string;
      taluk: string;
      lat: number;
      lng: number;
      precision: Incident['location']['precision'];
      uncertaintyRadiusMeters: number;
      confidence: number;
      candidateMatches?: Incident['location']['candidateMatches'];
    }
  ) => void;
  updateIncidentReportingRate: (incidentId: string, expectedReportingRate: number) => void;

  // Silence Radar
  triggerDarkZoneAction: (darkZoneId: string, actionType: DarkZoneActionRecord['actionType'], notes: string) => void;
  resolveDarkZoneVerification: (
    darkZoneId: string,
    outcome: 'confirmed_safe' | 'confirmed_emergency' | 'unreachable',
    note?: string
  ) => string | null;

  // Active Triage
  createAndSendFollowUp: (question: FollowUpQuestion) => void;
  sendDraftFollowUp: (questionId: string) => void;
  simulateFollowUpResponse: (questionId: string, optionIndex: number) => void;
  appendFieldVoiceUpdate: (incidentId: string, transcript: string, language: EmergencyReport['language'], providerLabel: string) => void;

  // Rescue Coordination
  assignRescueTeam: (params: {
    incidentId: string;
    teamId: string;
    routeSummary: string;
    hazardWarning: string | null;
    estimatedMinutes: number;
    notes: string;
  }) => void;
  updateRescueTaskStatus: (taskId: string, status: RescueTaskStatus) => void;

  // Live Demo Scenario Replay Engine
  replayStep: number;
  isReplaying: boolean;
  startReplay: () => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  nextReplayStep: () => void;
  resetReplay: () => void;
  jumpToReplayStep: (stepNum: number) => void;
}

const DhwaniContext = createContext<DhwaniContextValue | null>(null);

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function buildInitialState(scenarioId: DisasterScenarioId): PersistedState {
  const ds = SCENARIOS[scenarioId];
  return {
    scenarioId,
    incidents: structuredClone(ds.incidents),
    reports: structuredClone(ds.reports),
    evidenceRecords: structuredClone(ds.evidenceRecords),
    darkZones: structuredClone(ds.darkZones),
    followUps: structuredClone(ds.followUps),
    rescueTeams: structuredClone(ds.rescueTeams),
    rescueTasks: structuredClone(ds.rescueTasks),
    auditLogs: structuredClone(ds.auditLogs),
    activityFeed: structuredClone(ds.activityFeed),
    demoStats: { ...ds.demoStats },
    systemStatus: {
      networkTier: 'TIER_2_CLOUD',
      geminiAvailable: true,
      lastSyncedAt: nowTimeStr(),
      pendingOfflineSyncCount: 0,
      edgeModelLabel: 'Local Rule/Quantized Edge Interface (Simulated)',
      smsModemStatus: 'GSM Gateway Interface Ready (Simulated)',
      piiRedactionEnabled: true,
      humanReviewThreshold: 0.7,
    },
    coordinator: {
      name: 'R. Shenoy, IAS',
      role: 'District Emergency Coordinator',
      station: 'Dakshina Kannada DEOC · Mangaluru',
      authenticated: true,
    },
    replayStep: 0,
  };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed && Array.isArray(parsed.incidents) && parsed.incidents.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted local storage
  }
  return buildInitialState('netravati-flood');
}

export function DhwaniProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [activeModule, setActiveModule] = useState<NavigationModule>('command-center');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    () => state.incidents[0]?.id ?? 'INC-NTV-001'
  );
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef<number | null>(null);

  // Persist to browser localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);

  // Check real server health on mount
  useEffect(() => {
    checkServerHealth().then((health) => {
      setState((prev) => ({
        ...prev,
        systemStatus: {
          ...prev.systemStatus,
          geminiAvailable: health.geminiConfigured,
        },
      }));
    });
  }, []);

  const canApproveOrDispatch =
    state.coordinator.role === 'District Emergency Coordinator' ||
    state.coordinator.role === 'Rescue Dispatch Officer';
  const canEditTriage = state.coordinator.role !== 'Read-Only Observer';

  const replayStepRef = useRef(state.replayStep);
  useEffect(() => {
    replayStepRef.current = state.replayStep;
  }, [state.replayStep]);

  const openIncidentDetail = useCallback((id: string, target: NavigationModule = 'incident-intelligence') => {
    setSelectedIncidentId(id);
    setActiveModule(target);
  }, []);

  const switchScenario = useCallback((id: DisasterScenarioId) => {
    setIsReplaying(false);
    const fresh = buildInitialState(id);
    setState(fresh);
    setSelectedIncidentId(fresh.incidents[0]?.id ?? '');
  }, []);

  const resetDemoState = useCallback(() => {
    setIsReplaying(false);
    const fresh = buildInitialState(state.scenarioId);
    setState(fresh);
    setSelectedIncidentId(fresh.incidents[0]?.id ?? '');
  }, [state.scenarioId]);

  const setCoordinatorProfile = useCallback((profile: Partial<CoordinatorProfile>) => {
    setState((prev) => {
      const next = { ...prev.coordinator, ...profile };
      const log: AuditLog = {
        id: `AUD-${Date.now()}`,
        timestamp: nowTimeStr(),
        actor: next.name,
        role: next.role,
        category: 'Privacy & Security',
        summary: `Active coordinator session updated: ${next.name} (${next.role}).`,
      };
      return {
        ...prev,
        coordinator: next,
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  }, []);

  const setNetworkTier = useCallback((tier: NetworkTier, reason?: string) => {
    setState((prev) => {
      const tierNames: Record<NetworkTier, string> = {
        TIER_2_CLOUD: 'Tier 2 — Cloud Mode (Online)',
        TIER_1_EDGE: 'Tier 1 — Edge Laptop Mode (Offline)',
        TIER_0_SMS: 'Tier 0 — SMS-Only Mode (Severely Limited)',
      };
      const isRestoring = tier === 'TIER_2_CLOUD' && prev.systemStatus.networkTier !== 'TIER_2_CLOUD';
      const syncedCount = isRestoring ? prev.systemStatus.pendingOfflineSyncCount : 0;
      const log: AuditLog = {
        id: `AUD-${Date.now()}`,
        timestamp: nowTimeStr(),
        actor: prev.coordinator.name,
        role: prev.coordinator.role,
        category: 'Network Mode',
        summary: `${reason ? `${reason} — ` : ''}Switched operating tier to ${tierNames[tier]}.${isRestoring && syncedCount > 0 ? ` Synced ${syncedCount} buffered local records.` : ''}`,
      };
      const act: SystemActivityItem = {
        id: `ACT-${Date.now()}`,
        timestamp: nowTimeStr(),
        type: 'network',
        title: `Operating Mode: ${tierNames[tier]}`,
        detail:
          tier === 'TIER_2_CLOUD'
            ? `Cloud AI & live synchronization active.${syncedCount > 0 ? ` Flushed ${syncedCount} queued offline records.` : ''}`
            : tier === 'TIER_1_EDGE'
              ? 'Internet failed (simulated). Local triage, offline GIS vector map, and local storage queue remain operational.'
              : 'Severe link loss (simulated). Running minimal GSM keyword extraction and deterministic priority rules.',
      };
      return {
        ...prev,
        systemStatus: {
          ...prev.systemStatus,
          networkTier: tier,
          lastSyncedAt: isRestoring ? nowTimeStr() : prev.systemStatus.lastSyncedAt,
          pendingOfflineSyncCount: isRestoring ? 0 : prev.systemStatus.pendingOfflineSyncCount,
        },
        auditLogs: [log, ...prev.auditLogs],
        activityFeed: [act, ...prev.activityFeed].slice(0, 40),
      };
    });
  }, []);

  const syncOfflineQueue = useCallback(() => {
    setState((prev) => {
      if (prev.systemStatus.networkTier !== 'TIER_2_CLOUD') return prev;
      const count = prev.systemStatus.pendingOfflineSyncCount;
      const log: AuditLog = {
        id: `AUD-${Date.now()}`,
        timestamp: nowTimeStr(),
        actor: prev.coordinator.name,
        role: prev.coordinator.role,
        category: 'Network Mode',
        summary: `Synchronized ${count} locally buffered incident/audit records to cloud state.`,
      };
      return {
        ...prev,
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: 0,
          lastSyncedAt: nowTimeStr(),
        },
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  }, []);

  const setPiiRedaction = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      systemStatus: { ...prev.systemStatus, piiRedactionEnabled: enabled },
      auditLogs: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowTimeStr(),
          actor: prev.coordinator.name,
          role: prev.coordinator.role,
          category: 'Privacy & Security',
          summary: `DPDP Act 2023 PII phone/reporter redaction ${enabled ? 'enabled' : 'disabled'} by coordinator.`,
        },
        ...prev.auditLogs,
      ],
    }));
  }, []);

  const setHumanReviewThreshold = useCallback((threshold: number) => {
    setState((prev) => ({
      ...prev,
      systemStatus: { ...prev.systemStatus, humanReviewThreshold: threshold },
      incidents: prev.incidents.map((inc) => ({
        ...inc,
        flaggedForHumanReview: inc.confidence < threshold,
      })),
    }));
  }, []);

  const addIncidentFromIntake = useCallback(
    (incident: Incident, report: EmergencyReport, evidence: EvidenceRecord) => {
      setState((prev) => {
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
        const flagged = incident.confidence < prev.systemStatus.humanReviewThreshold;
        const nextInc = { ...incident, flaggedForHumanReview: flagged };
        return {
          ...prev,
          incidents: [nextInc, ...prev.incidents],
          reports: [report, ...prev.reports],
          evidenceRecords: [evidence, ...prev.evidenceRecords],
          demoStats: {
            ...prev.demoStats,
            totalRawMessages30m: prev.demoStats.totalRawMessages30m + 1,
            uniqueIncidentsAfterFusion: prev.demoStats.uniqueIncidentsAfterFusion + 1,
          },
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'AI Processing',
              summary: `Processed ${report.language} ${report.sourceChannel} report into ${nextInc.id} (Need Score ${nextInc.needEstimate.finalNeedScore}, Confidence ${(nextInc.confidence * 100).toFixed(0)}%).`,
              targetId: nextInc.id,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: 'ai_extract' as const,
              title: `New ${nextInc.hazard} Incident Structured (${nextInc.language})`,
              detail: `${nextInc.id}: ${nextInc.title} — Need Score ${nextInc.needEstimate.finalNeedScore}/100${flagged ? ' · Flagged for human review (< threshold)' : ''}.`,
              incidentId: nextInc.id,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
      setSelectedIncidentId(incident.id);
    },
    []
  );

  const attachReportToIncident = useCallback(
    (
      targetIncidentId: string,
      report: EmergencyReport,
      evidence: EvidenceRecord,
      options?: { markConflict?: boolean; markForwardChain?: boolean }
    ) => {
      setState((prev) => {
        const target = prev.incidents.find((i) => i.id === targetIncidentId);
        if (!target) return prev;
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
        const isConflict = Boolean(options?.markConflict);
        const isForward = Boolean(options?.markForwardChain);

        const nextStatus: VerificationStatus = isConflict
          ? 'Conflicting evidence'
          : target.verificationStatus === 'Unverified' && !isForward
            ? 'Corroborated'
            : target.verificationStatus;

        const nextConfidence = isConflict
          ? Number(Math.max(0.35, target.confidence - 0.08).toFixed(2))
          : isForward
            ? target.confidence
            : Number(Math.min(0.97, target.confidence + 0.05).toFixed(2));

        const linkedReport: EmergencyReport = {
          ...report,
          incidentId: targetIncidentId,
          isDuplicate: true,
          forwardChainDepth: isForward ? Math.max(1, report.forwardChainDepth) : report.forwardChainDepth,
          forwardedFromId: isForward ? target.reportIds[0] : report.forwardedFromId,
        };
        const linkedEvidence: EvidenceRecord = {
          ...evidence,
          incidentId: targetIncidentId,
        };

        return {
          ...prev,
          incidents: prev.incidents.map((inc) =>
            inc.id === targetIncidentId
              ? {
                  ...inc,
                  reportIds: Array.from(new Set([...inc.reportIds, linkedReport.id])),
                  duplicateCount: inc.duplicateCount + 1,
                  verificationStatus: nextStatus,
                  confidence: nextConfidence,
                  flaggedForHumanReview:
                    isConflict || nextConfidence < prev.systemStatus.humanReviewThreshold || inc.flaggedForHumanReview,
                }
              : inc
          ),
          reports: [linkedReport, ...prev.reports],
          evidenceRecords: [linkedEvidence, ...prev.evidenceRecords],
          demoStats: {
            ...prev.demoStats,
            totalRawMessages30m: prev.demoStats.totalRawMessages30m + 1,
            rumoursDownWeighted:
              isForward || isConflict
                ? prev.demoStats.rumoursDownWeighted + 1
                : prev.demoStats.rumoursDownWeighted,
          },
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Evidence & Merge',
              summary: `Attached ${linkedReport.language} ${linkedReport.sourceChannel} report (${linkedReport.id}) into ${targetIncidentId} (${isConflict ? 'Flagged Conflicting Evidence' : isForward ? 'Linked Forward-Chain' : 'Merged Duplicate'}).`,
              targetId: targetIncidentId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: isConflict ? ('verification' as const) : ('duplicate_merge' as const),
              title: isConflict
                ? `Conflicting Report Linked to ${targetIncidentId}`
                : `Duplicate Report Merged into ${targetIncidentId}`,
              detail: `${linkedReport.id} (${linkedReport.language}) linked via similarity analysis without inflating priority.`,
              incidentId: targetIncidentId,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
      setSelectedIncidentId(targetIncidentId);
    },
    []
  );

  const approveIncidentPriority = useCallback((incidentId: string) => {
    setState((prev) => {
      const target = prev.incidents.find((i) => i.id === incidentId);
      if (!target) return prev;
      const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
      return {
        ...prev,
        incidents: prev.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                verificationStatus:
                  inc.verificationStatus === 'Unverified'
                    ? 'Verified by coordinator'
                    : inc.verificationStatus,
                flaggedForHumanReview: false,
                coordinatorDecision: {
                  ...inc.coordinatorDecision,
                  approved: true,
                  approvedBy: prev.coordinator.name,
                  approvedAt: nowTimeStr(),
                },
              }
            : inc
        ),
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Approval',
            summary: `Coordinator approved priority score (${target.needEstimate.finalNeedScore}/100) for ${incidentId}.`,
            targetId: incidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowTimeStr(),
            type: 'coordinator' as const,
            title: `Priority Approved: ${incidentId}`,
            detail: `${prev.coordinator.name} approved Need Score ${target.needEstimate.finalNeedScore}/100 for ${target.location.placeName}.`,
            incidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
  }, []);

  const overrideIncidentScore = useCallback((incidentId: string, newScore: number, reason: string) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newScore)));
    setState((prev) => {
      const target = prev.incidents.find((i) => i.id === incidentId);
      if (!target) return prev;
      const oldScore = target.needEstimate.finalNeedScore;
      const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
      return {
        ...prev,
        incidents: prev.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                severity:
                  clamped >= 85 ? 'Critical' : clamped >= 70 ? 'High' : clamped >= 45 ? 'Moderate' : 'Low',
                needEstimate: {
                  ...inc.needEstimate,
                  finalNeedScore: clamped,
                },
                coordinatorDecision: {
                  ...inc.coordinatorDecision,
                  approved: true,
                  approvedBy: prev.coordinator.name,
                  approvedAt: nowTimeStr(),
                  overriddenScore: clamped,
                  overrideReason: reason,
                },
              }
            : inc
        ),
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Priority Override',
            summary: `Overrode ${incidentId} Need Score from ${oldScore} to ${clamped}. Reason: "${reason}".`,
            targetId: incidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowTimeStr(),
            type: 'coordinator' as const,
            title: `Score Overridden: ${incidentId} (${oldScore} → ${clamped})`,
            detail: `Reason: ${reason}`,
            incidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
  }, []);

  const updateIncidentVerification = useCallback(
    (incidentId: string, status: VerificationStatus, note?: string) => {
      setState((prev) => {
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
        return {
          ...prev,
          incidents: prev.incidents.map((inc) =>
            inc.id === incidentId
              ? {
                  ...inc,
                  verificationStatus: status,
                  flaggedForHumanReview: status === 'Verified by coordinator' ? false : inc.flaggedForHumanReview,
                }
              : inc
          ),
          evidenceRecords: [
            {
              id: `EV-${Date.now()}`,
              incidentId,
              type: 'coordinator_verification',
              label: `Coordinator Status: ${status}`,
              detail: note || `Updated manually by ${prev.coordinator.name}.`,
              reliabilityDelta: status === 'Verified by coordinator' ? 15 : 0,
              timestamp: nowTimeStr(),
            },
            ...prev.evidenceRecords,
          ],
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Evidence & Merge',
              summary: `Marked ${incidentId} verification status as "${status}"${note ? ` (${note})` : ''}.`,
              targetId: incidentId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: 'verification' as const,
              title: `Verification Updated: ${incidentId}`,
              detail: `Status set to "${status}" by ${prev.coordinator.name}.`,
              incidentId,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
    },
    []
  );

  const mergeIncidents = useCallback((sourceIncidentId: string, targetIncidentId: string) => {
    if (sourceIncidentId === targetIncidentId) return;
    setState((prev) => {
      const src = prev.incidents.find((i) => i.id === sourceIncidentId);
      const dst = prev.incidents.find((i) => i.id === targetIncidentId);
      if (!src || !dst) return prev;

      const mergedReportIds = Array.from(new Set([...dst.reportIds, ...src.reportIds]));
      const updatedIncidents = prev.incidents
        .filter((i) => i.id !== sourceIncidentId)
        .map((i) =>
          i.id === targetIncidentId
            ? {
                ...i,
                reportIds: mergedReportIds,
                duplicateCount: i.duplicateCount + src.reportIds.length,
                verificationStatus: 'Corroborated' as VerificationStatus,
                confidence: Number(Math.min(0.97, i.confidence + 0.05).toFixed(2)),
                needEstimate: {
                  ...i.needEstimate,
                  rawReportCount: i.needEstimate.rawReportCount + src.needEstimate.rawReportCount,
                },
              }
            : i
        );

      const updatedReports = prev.reports.map((r) =>
        r.incidentId === sourceIncidentId ? { ...r, incidentId: targetIncidentId, isDuplicate: true } : r
      );

      return {
        ...prev,
        incidents: updatedIncidents,
        reports: updatedReports,
        evidenceRecords: [
          {
            id: `EV-${Date.now()}`,
            incidentId: targetIncidentId,
            type: 'duplicate_merge',
            label: `Merged Cluster ${sourceIncidentId} → ${targetIncidentId}`,
            detail: `Coordinator fused ${src.reportIds.length} report(s) from "${src.title}" into ${targetIncidentId}.`,
            reliabilityDelta: 8,
            timestamp: nowTimeStr(),
          },
          ...prev.evidenceRecords,
        ],
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Evidence & Merge',
            summary: `Merged duplicate incident ${sourceIncidentId} into ${targetIncidentId}.`,
            targetId: targetIncidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowTimeStr(),
            type: 'duplicate_merge' as const,
            title: `Incidents Merged: ${sourceIncidentId} → ${targetIncidentId}`,
            detail: `Consolidated into single incident record with ${mergedReportIds.length} linked reports.`,
            incidentId: targetIncidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
    setSelectedIncidentId(targetIncidentId);
  }, []);

  const splitIncidentReport = useCallback((incidentId: string, reportId: string) => {
    setState((prev) => {
      const parent = prev.incidents.find((i) => i.id === incidentId);
      const rep = prev.reports.find((r) => r.id === reportId);
      if (!parent || !rep || parent.reportIds.length <= 1) return prev;

      const newId = `INC-SPL-${Math.floor(100 + Math.random() * 899)}`;
      const splitIncident: Incident = {
        ...structuredClone(parent),
        id: newId,
        title: `Split Incident from ${incidentId}: ${rep.translatedMessage.slice(0, 44)}`,
        originalMessage: rep.originalMessage,
        processedMessage: rep.translatedMessage,
        language: rep.language,
        source: rep.sourceChannel,
        reportIds: [rep.id],
        duplicateCount: 0,
        verificationStatus: 'Unverified',
        coordinatorDecision: { approved: false },
      };

      return {
        ...prev,
        incidents: [
          splitIncident,
          ...prev.incidents.map((i) =>
            i.id === incidentId
              ? {
                  ...i,
                  reportIds: i.reportIds.filter((rid) => rid !== reportId),
                  duplicateCount: Math.max(0, i.duplicateCount - 1),
                }
              : i
          ),
        ],
        reports: prev.reports.map((r) =>
          r.id === reportId ? { ...r, incidentId: newId, isDuplicate: false } : r
        ),
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Evidence & Merge',
            summary: `Split report ${reportId} out of ${incidentId} into standalone incident ${newId}.`,
            targetId: newId,
          },
          ...prev.auditLogs,
        ],
      };
    });
  }, []);

  const requestAdditionalEvidence = useCallback((incidentId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      incidents: prev.incidents.map((inc) =>
        inc.id === incidentId
          ? {
              ...inc,
              flaggedForHumanReview: true,
              missingInformation: inc.missingInformation.includes(note)
                ? inc.missingInformation
                : [...inc.missingInformation, note],
            }
          : inc
      ),
      auditLogs: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowTimeStr(),
          actor: prev.coordinator.name,
          role: prev.coordinator.role,
          category: 'Evidence & Merge',
          summary: `Requested additional field evidence for ${incidentId}: "${note}".`,
          targetId: incidentId,
        },
        ...prev.auditLogs,
      ],
    }));
  }, []);

  const updateIncidentLocation = useCallback(
    (
      incidentId: string,
      patch: {
        placeName: string;
        landmark: string;
        taluk: string;
        lat: number;
        lng: number;
        precision: Incident['location']['precision'];
        uncertaintyRadiusMeters: number;
        confidence: number;
        candidateMatches?: Incident['location']['candidateMatches'];
      }
    ) => {
      setState((prev) => {
        const target = prev.incidents.find((i) => i.id === incidentId);
        if (!target) return prev;
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
        const tightened = patch.uncertaintyRadiusMeters < target.location.uncertaintyRadiusMeters;
        return {
          ...prev,
          incidents: prev.incidents.map((inc) =>
            inc.id === incidentId
              ? {
                  ...inc,
                  location: {
                    ...inc.location,
                    ...patch,
                    gpsAvailable: patch.precision === 'verified',
                  },
                  fieldConfidence: {
                    ...inc.fieldConfidence,
                    location: patch.confidence,
                  },
                }
              : inc
          ),
          demoStats: {
            ...prev.demoStats,
            locationsImproved: tightened
              ? prev.demoStats.locationsImproved + 1
              : prev.demoStats.locationsImproved,
          },
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'AI Processing',
              summary: `Refined geo-resolution for ${incidentId} to "${patch.placeName}" (${patch.precision}, ±${patch.uncertaintyRadiusMeters}m).`,
              targetId: incidentId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: 'coordinator' as const,
              title: `Location Refined: ${incidentId}`,
              detail: `Resolved to ${patch.placeName} (${patch.precision}, ±${patch.uncertaintyRadiusMeters}m).`,
              incidentId,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
    },
    []
  );

  const updateIncidentReportingRate = useCallback((incidentId: string, expectedReportingRate: number) => {
    const clampedRate = Math.max(0.05, Math.min(1, Number(expectedReportingRate.toFixed(2))));
    setState((prev) => {
      const target = prev.incidents.find((i) => i.id === incidentId);
      if (!target) return prev;
      const newBiasIndex = Number((target.needEstimate.rawReportCount / clampedRate).toFixed(1));
      const oldRate = target.needEstimate.expectedReportingRate;
      const oldBiasPts = target.needEstimate.factors.find((f) => f.category === 'bias-correction')?.points ?? 12;
      const newBiasPts = Math.max(2, Math.min(24, Math.round((1 - clampedRate) * 20) + 2));
      const scoreDelta = newBiasPts - oldBiasPts;
      const nextScore = Math.max(10, Math.min(99, target.needEstimate.finalNeedScore + scoreDelta));
      const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;

      return {
        ...prev,
        incidents: prev.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                severity:
                  nextScore >= 85 ? 'Critical' : nextScore >= 70 ? 'High' : nextScore >= 45 ? 'Moderate' : 'Low',
                needEstimate: {
                  ...inc.needEstimate,
                  expectedReportingRate: clampedRate,
                  biasCorrectedNeedIndex: newBiasIndex,
                  finalNeedScore: nextScore,
                  factors: inc.needEstimate.factors.map((f) =>
                    f.category === 'bias-correction'
                      ? {
                          ...f,
                          points: newBiasPts,
                          detail: `Coordinator calibrated expected reporting rate to ${Math.round(clampedRate * 100)}% (adjusted need index ${newBiasIndex}).`,
                        }
                      : f
                  ),
                },
              }
            : inc
        ),
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Priority Override',
            summary: `Calibrated reporting rate for ${incidentId} (${Math.round(oldRate * 100)}% → ${Math.round(clampedRate * 100)}%); Need Score updated ${target.needEstimate.finalNeedScore} → ${nextScore}.`,
            targetId: incidentId,
          },
          ...prev.auditLogs,
        ],
      };
    });
  }, []);

  const triggerDarkZoneAction = useCallback(
    (darkZoneId: string, actionType: DarkZoneActionRecord['actionType'], notes: string) => {
      setState((prev) => {
        const dz = prev.darkZones.find((d) => d.id === darkZoneId);
        if (!dz) return prev;
        const record: DarkZoneActionRecord = {
          id: `DZA-${Date.now()}`,
          actionType,
          initiatedBy: prev.coordinator.name,
          timestamp: nowTimeStr(),
          status: 'Dispatched (simulated)',
          notes,
        };
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
        return {
          ...prev,
          darkZones: prev.darkZones.map((d) =>
            d.id === darkZoneId ? { ...d, actions: [record, ...d.actions] } : d
          ),
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Silence Radar',
              summary: `Initiated "${actionType}" (simulated) for Dark Zone ${dz.villageName} (${darkZoneId}).`,
              targetId: darkZoneId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: 'dark_zone' as const,
              title: `Silence Radar Verification: ${dz.villageName}`,
              detail: `${actionType} logged by ${prev.coordinator.name} (simulated workflow).`,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
    },
    []
  );

  const resolveDarkZoneVerification = useCallback(
    (
      darkZoneId: string,
      outcome: 'confirmed_safe' | 'confirmed_emergency' | 'unreachable',
      note?: string
    ): string | null => {
      const targetExists = state.darkZones.some((d) => d.id === darkZoneId);
      if (!targetExists) return null;

      const nowLabel = nowTimeStr();
      const idNum = Math.floor(400 + Math.random() * 599);
      const prefix = state.scenarioId === 'kodagu-landslide' ? 'INC-KDG' : 'INC-NTV';
      const createdIncidentId: string | null =
        outcome === 'confirmed_emergency' ? `${prefix}-${idNum}` : null;

      setState((prev) => {
        const dz = prev.darkZones.find((d) => d.id === darkZoneId);
        if (!dz) return prev;
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;

        if (outcome === 'confirmed_safe') {
          const ackRecord: DarkZoneActionRecord = {
            id: `DZA-${Date.now()}`,
            actionType: 'Local Volunteer Contact',
            initiatedBy: prev.coordinator.name,
            timestamp: nowLabel,
            status: 'Acknowledged (simulated)',
            notes:
              note?.trim() ||
              `Field verification confirmed ${dz.villageName} residents are safe. Silence was caused by cellular tower outage only (zero reports ≠ confirmed danger).`,
          };
          return {
            ...prev,
            darkZones: prev.darkZones.map((d) =>
              d.id === darkZoneId
                ? {
                    ...d,
                    riskLevel: 'Low',
                    verificationOutcome: 'Verified Safe (Outage Only)',
                    explanation: `Verified safe via coordinator outreach (${nowLabel}): silence was caused by telecom outage (${d.connectivityPercent}% signal), not confirmed flooding.`,
                    actions: [ackRecord, ...d.actions],
                  }
                : d
            ),
            demoStats: {
              ...prev.demoStats,
              potentialDarkZones: Math.max(0, prev.demoStats.potentialDarkZones - 1),
            },
            systemStatus: {
              ...prev.systemStatus,
              pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
            },
            auditLogs: [
              {
                id: `AUD-${Date.now()}`,
                timestamp: nowLabel,
                actor: prev.coordinator.name,
                role: prev.coordinator.role,
                category: 'Silence Radar',
                summary: `Verified ${dz.villageName} (${darkZoneId}) as SAFE — telecom outage only. Cleared Dark Zone alert.`,
                targetId: darkZoneId,
              },
              ...prev.auditLogs,
            ],
            activityFeed: [
              {
                id: `ACT-${Date.now()}`,
                timestamp: nowLabel,
                type: 'dark_zone' as const,
                title: `Silence Resolved (Verified Safe): ${dz.villageName}`,
                detail: `Field outreach confirmed residents safe; silence resulted from cellular outage only.`,
              },
              ...prev.activityFeed,
            ].slice(0, 40),
          };
        }

        if (outcome === 'unreachable') {
          const escRecord: DarkZoneActionRecord = {
            id: `DZA-${Date.now()}`,
            actionType: 'Field Verification Request',
            initiatedBy: prev.coordinator.name,
            timestamp: nowLabel,
            status: 'Awaiting response',
            notes:
              note?.trim() ||
              `Outreach attempts unanswered in ${dz.villageName}. Escalated physical patrol / drone scouting while maintaining unverified high-uncertainty status.`,
          };
          return {
            ...prev,
            darkZones: prev.darkZones.map((d) =>
              d.id === darkZoneId
                ? {
                    ...d,
                    verificationOutcome: 'Unreachable — Escalated',
                    actions: [escRecord, ...d.actions],
                  }
                : d
            ),
            systemStatus: {
              ...prev.systemStatus,
              pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
            },
            auditLogs: [
              {
                id: `AUD-${Date.now()}`,
                timestamp: nowLabel,
                actor: prev.coordinator.name,
                role: prev.coordinator.role,
                category: 'Silence Radar',
                summary: `Marked ${dz.villageName} (${darkZoneId}) unreachable after outreach; escalated field reconnaissance.`,
                targetId: darkZoneId,
              },
              ...prev.auditLogs,
            ],
            activityFeed: [
              {
                id: `ACT-${Date.now()}`,
                timestamp: nowLabel,
                type: 'dark_zone' as const,
                title: `Dark Zone Escalated: ${dz.villageName}`,
                detail: `Outreach unanswered; field patrol & drone verification requested.`,
              },
              ...prev.activityFeed,
            ].slice(0, 40),
          };
        }

        // outcome === 'confirmed_emergency': Escalate to a real shared Incident in operational state
        const incId = createdIncidentId ?? `${prefix}-${idNum}`;
        const repId = `REP-${idNum}`;
        const isKodagu = prev.scenarioId === 'kodagu-landslide';
        const hazard: Incident['hazard'] = isKodagu ? 'Landslide' : 'Flood';
        const summaryText =
          note?.trim() ||
          `Field verification confirmed emergency conditions in previously silent village ${dz.villageName} (${dz.taluk} Taluk): ${dz.roadStatus}.`;

        const expectedRate = Math.max(0.12, Number((dz.connectivityPercent / 100).toFixed(2)));
        const newIncident: Incident = {
          id: incId,
          title: `${hazard} (Silence Radar Verified) — ${dz.villageName}`,
          summary: summaryText,
          originalMessage: `[Silence Radar Verification · ${dz.id}] ${summaryText}`,
          processedMessage: summaryText,
          language: 'English',
          source: 'Volunteer PWA',
          receivedAt: nowLabel,
          hazard,
          severity: dz.riskLevel === 'Critical' ? 'Critical' : 'High',
          affectedPeople: null,
          vulnerableGroups: ['Isolated rural community (comms blackout)'],
          missingInformation: [
            'Exact household headcount needing evacuation',
            'Injury or urgent medical status',
          ],
          location: {
            placeName: dz.villageName,
            landmark: dz.roadStatus,
            taluk: dz.taluk,
            lat: dz.lat,
            lng: dz.lng,
            precision: 'approximate',
            gpsAvailable: false,
            uncertaintyRadiusMeters: 650,
            confidence: 0.78,
            candidateMatches: [
              {
                name: `${dz.villageName}, ${dz.taluk}`,
                matchScore: 0.82,
                distanceHint: 'Verified via Silence Radar outreach',
              },
            ],
            requiredForResolution: ['Exact household headcount needing evacuation'],
          },
          confidence: 0.82,
          fieldConfidence: {
            language: 0.95,
            hazard: 0.86,
            location: 0.78,
            population: 0.45,
            vulnerability: 0.74,
          },
          verificationStatus: 'Verified by coordinator',
          needEstimate: {
            rawReportCount: Math.max(1, dz.actualReports + 1),
            expectedReportingRate: expectedRate,
            populationContext: dz.population,
            connectivityScore: dz.connectivityPercent,
            languageAccessibility: 62,
            literacyAccessScore: 72,
            historicalBaselineRate: 0.2,
            biasCorrectedNeedIndex: Number((Math.max(1, dz.actualReports + 1) / expectedRate).toFixed(1)),
            uncertaintyMargin: 6.4,
            finalNeedScore: dz.riskLevel === 'Critical' ? 89 : 79,
            counterfactualNote:
              'Detected via DHWANI Silence Radar verification after cellular outage suppressed citizen distress calls.',
            factors: [
              {
                id: `${incId}-f1`,
                label: 'Verified Silence Radar emergency escalation',
                points: 28,
                category: 'severity',
                detail: summaryText,
              },
              {
                id: `${incId}-f2`,
                label: `Hydrological/Rainfall sensor (${dz.nearbyGaugeName})`,
                points: 20,
                category: 'hazard-sensor',
                detail: `${dz.nearbyGaugeLevelM}m vs ${dz.gaugeDangerLevelM}m danger mark · ${dz.rainfallMmHr} mm/hr.`,
              },
              {
                id: `${incId}-f3`,
                label: `Severe reporting-bias adjustment (${dz.connectivityPercent}% uptime)`,
                points: 22,
                category: 'bias-correction',
                detail: `Village silent for ${dz.minutesSilent}m due to ${dz.connectivityStatus}.`,
              },
              {
                id: `${incId}-f4`,
                label: 'Coordinator verification confirmation',
                points: 14,
                category: 'corroboration',
                detail: `Verified by ${prev.coordinator.name} via Silence Radar workflow.`,
              },
            ],
          },
          reportIds: [repId],
          duplicateCount: 0,
          coordinatorDecision: {
            approved: true,
            approvedBy: prev.coordinator.name,
            approvedAt: nowLabel,
          },
          recommendedResources: isKodagu
            ? ['SDRF/NDRF slope unit', 'Satellite phone', 'Medical kit']
            : ['Motorized rescue boat', 'Life jackets', 'VHF radio', 'First aid kit'],
          areaType: 'Remote village',
          flaggedForHumanReview: false,
          isSimulatedDemoData: true,
        };

        const newReport: EmergencyReport = {
          id: repId,
          incidentId: incId,
          originalMessage: `[Silence Radar Verification · ${dz.id}] ${summaryText}`,
          translatedMessage: summaryText,
          language: 'English',
          sourceChannel: 'Volunteer PWA',
          reporterAlias: `${prev.coordinator.name} (Field Verification)`,
          reporterPhoneMasked: 'VHF / Control Room',
          reporterPhoneRaw: 'VHF / Control Room',
          receivedAt: nowLabel,
          isDuplicate: false,
          forwardChainDepth: 0,
          similarityScore: 1,
          isSimulatedDemoData: true,
        };

        const newEvidence: EvidenceRecord = {
          id: `EV-${idNum}`,
          incidentId: incId,
          type: 'coordinator_verification',
          label: `Silence Radar Escalation (${dz.id})`,
          detail: `Verified emergency conditions in ${dz.villageName} after ${dz.minutesSilent}m communication silence.`,
          reliabilityDelta: 22,
          sourceId: repId,
          timestamp: nowLabel,
        };

        const confirmAction: DarkZoneActionRecord = {
          id: `DZA-${Date.now()}`,
          actionType: 'Field Verification Request',
          initiatedBy: prev.coordinator.name,
          timestamp: nowLabel,
          status: 'Acknowledged (simulated)',
          notes: `Emergency confirmed & escalated to live incident ${incId}: ${summaryText}`,
        };

        return {
          ...prev,
          incidents: [newIncident, ...prev.incidents],
          reports: [newReport, ...prev.reports],
          evidenceRecords: [newEvidence, ...prev.evidenceRecords],
          darkZones: prev.darkZones.map((d) =>
            d.id === darkZoneId
              ? {
                  ...d,
                  actualReports: d.actualReports + 1,
                  verificationOutcome: 'Emergency Confirmed (Escalated)',
                  linkedIncidentId: incId,
                  actions: [confirmAction, ...d.actions],
                }
              : d
          ),
          demoStats: {
            ...prev.demoStats,
            totalRawMessages30m: prev.demoStats.totalRawMessages30m + 1,
            uniqueIncidentsAfterFusion: prev.demoStats.uniqueIncidentsAfterFusion + 1,
          },
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowLabel,
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Silence Radar',
              summary: `Confirmed emergency in Dark Zone ${dz.villageName} (${darkZoneId}) and escalated to live incident ${incId}.`,
              targetId: incId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowLabel,
              type: 'dark_zone' as const,
              title: `Dark Zone Escalated to Live Incident: ${incId}`,
              detail: `${dz.villageName} verified affected; added to Command Center & Rescue Coordination queue.`,
              incidentId: incId,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });

      if (createdIncidentId) {
        setSelectedIncidentId(createdIncidentId);
      }
      return createdIncidentId;
    },
    [state.darkZones, state.scenarioId]
  );

  const createAndSendFollowUp = useCallback((question: FollowUpQuestion) => {
    setState((prev) => {
      const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
      const isDraft = question.status === 'Draft';
      return {
        ...prev,
        followUps: [question, ...prev.followUps],
        demoStats: {
          ...prev.demoStats,
          followUpQuestionsSent: isDraft
            ? prev.demoStats.followUpQuestionsSent
            : prev.demoStats.followUpQuestionsSent + 1,
        },
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Active Triage',
            summary: isDraft
              ? `Saved ${question.language} ${question.channel} follow-up draft for ${question.incidentId}: "${question.questionEnglish}".`
              : `Sent ${question.language} ${question.channel} follow-up (simulated) to ${question.incidentId}: "${question.questionEnglish}".`,
            targetId: question.incidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowTimeStr(),
            type: 'followup' as const,
            title: isDraft
              ? `Active Triage Draft Saved (${question.channel})`
              : `Active Triage Sent (${question.channel} · ${question.language})`,
            detail: `${question.incidentId}: "${question.questionEnglish}" ${isDraft ? '(Draft)' : '(Simulated delivery)'}.`,
            incidentId: question.incidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
  }, []);

  const sendDraftFollowUp = useCallback((questionId: string) => {
    setState((prev) => {
      const target = prev.followUps.find((f) => f.id === questionId);
      if (!target || target.status !== 'Draft') return prev;
      const nowLabel = nowTimeStr();
      const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;
      return {
        ...prev,
        followUps: prev.followUps.map((f) =>
          f.id === questionId ? { ...f, status: 'Awaiting response', sentAt: nowLabel } : f
        ),
        demoStats: {
          ...prev.demoStats,
          followUpQuestionsSent: prev.demoStats.followUpQuestionsSent + 1,
        },
        systemStatus: {
          ...prev.systemStatus,
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowLabel,
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Active Triage',
            summary: `Dispatched saved draft ${questionId} (${target.channel} · ${target.language}) to ${target.incidentId} (simulated).`,
            targetId: target.incidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowLabel,
            type: 'followup' as const,
            title: `Draft Follow-Up Sent (${target.channel} · ${target.language})`,
            detail: `${target.incidentId}: "${target.questionEnglish}" (Simulated delivery).`,
            incidentId: target.incidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
  }, []);

  const simulateFollowUpResponse = useCallback((questionId: string, optionIndex: number) => {
    setState((prev) => {
      const q = prev.followUps.find((f) => f.id === questionId);
      if (!q || !q.simulatedOptions[optionIndex]) return prev;
      const opt = q.simulatedOptions[optionIndex];
      const inc = prev.incidents.find((i) => i.id === q.incidentId);
      if (!inc) return prev;

      const newConf = Number(Math.min(0.96, inc.confidence + opt.confidenceGain).toFixed(2));
      const newScore = Math.max(10, Math.min(99, inc.needEstimate.finalNeedScore + opt.scoreDelta));
      const locationImproved = opt.resolvedField.toLowerCase().includes('location') || opt.resolvedField.toLowerCase().includes('temple') || opt.resolvedField.toLowerCase().includes('landmark');

      const responseObj = {
        id: `FUR-${Date.now()}`,
        questionId: q.id,
        replyText: opt.replyText,
        translatedReply: opt.extractedUpdate,
        receivedAt: nowTimeStr(),
        extractedField: opt.resolvedField,
        extractedValue: opt.extractedUpdate,
        confidenceGain: opt.confidenceGain,
        needScoreDelta: opt.scoreDelta,
      };

      return {
        ...prev,
        followUps: prev.followUps.map((f) =>
          f.id === questionId ? { ...f, status: 'Information updated', response: responseObj } : f
        ),
        incidents: prev.incidents.map((i) =>
          i.id === q.incidentId
            ? {
                ...i,
                summary: `${i.summary} [Active Triage Update: ${opt.extractedUpdate}]`,
                confidence: newConf,
                flaggedForHumanReview: newConf < prev.systemStatus.humanReviewThreshold,
                severity: newScore >= 85 ? 'Critical' : newScore >= 70 ? 'High' : i.severity,
                missingInformation: i.missingInformation.filter(
                  (m) => m.toLowerCase() !== opt.resolvedField.toLowerCase()
                ),
                location: locationImproved
                  ? {
                      ...i.location,
                      precision: 'approximate',
                      uncertaintyRadiusMeters: Math.max(280, Math.round(i.location.uncertaintyRadiusMeters * 0.45)),
                      confidence: Number(Math.min(0.9, i.location.confidence + 0.18).toFixed(2)),
                    }
                  : i.location,
                needEstimate: {
                  ...i.needEstimate,
                  finalNeedScore: newScore,
                  factors: [
                    ...i.needEstimate.factors,
                    {
                      id: `f-triage-${Date.now()}`,
                      label: `Active Triage reply (${opt.resolvedField})`,
                      points: opt.scoreDelta,
                      category: opt.scoreDelta >= 0 ? 'severity' : 'corroboration',
                      detail: opt.extractedUpdate,
                    },
                  ],
                },
              }
            : i
        ),
        demoStats: {
          ...prev.demoStats,
          locationsImproved: locationImproved
            ? prev.demoStats.locationsImproved + 1
            : prev.demoStats.locationsImproved,
        },
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: 'Active Triage Engine',
            role: 'Triage Intelligence Analyst',
            category: 'Active Triage',
            summary: `Simulated victim reply updated ${q.incidentId}: Confidence ${(inc.confidence * 100).toFixed(0)}% → ${(newConf * 100).toFixed(0)}%, Need Score ${inc.needEstimate.finalNeedScore} → ${newScore}.`,
            targetId: q.incidentId,
          },
          ...prev.auditLogs,
        ],
        activityFeed: [
          {
            id: `ACT-${Date.now()}`,
            timestamp: nowTimeStr(),
            type: 'followup' as const,
            title: `Victim Reply Updated ${q.incidentId} (Simulated)`,
            detail: `${opt.extractedUpdate} (Score ${inc.needEstimate.finalNeedScore} → ${newScore}, Confidence ${(newConf * 100).toFixed(0)}%).`,
            incidentId: q.incidentId,
          },
          ...prev.activityFeed,
        ].slice(0, 40),
      };
    });
  }, []);

  const appendFieldVoiceUpdate = useCallback(
    (incidentId: string, transcript: string, language: EmergencyReport['language'], providerLabel: string) => {
      const cleaned = transcript.trim();
      if (!cleaned) return;
      setState((prev) => {
        const inc = prev.incidents.find((i) => i.id === incidentId);
        if (!inc) return prev;
        const repId = `REP-V${Math.floor(100 + Math.random() * 899)}`;
        const nowLabel = nowTimeStr();
        const newConf = Number(Math.min(0.96, inc.confidence + 0.08).toFixed(2));
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;

        const voiceReport: EmergencyReport = {
          id: repId,
          incidentId,
          originalMessage: cleaned,
          translatedMessage: cleaned,
          language,
          sourceChannel: 'Volunteer PWA',
          reporterAlias: `${prev.coordinator.name} (Voice Dictation)`,
          reporterPhoneMasked: 'Field Radio / PWA',
          reporterPhoneRaw: 'Field Radio / PWA',
          receivedAt: nowLabel,
          isDuplicate: false,
          forwardChainDepth: 0,
          similarityScore: 0.9,
          isSimulatedDemoData: true,
        };

        const voiceEvidence: EvidenceRecord = {
          id: `EV-V${Date.now()}`,
          incidentId,
          type: 'independent_report',
          label: `Field Voice Dictation (${repId} · ${providerLabel})`,
          detail: cleaned,
          reliabilityDelta: 10,
          sourceId: repId,
          timestamp: nowLabel,
        };

        return {
          ...prev,
          incidents: prev.incidents.map((i) =>
            i.id === incidentId
              ? {
                  ...i,
                  summary: `${i.summary} [Field Voice Note: ${cleaned}]`,
                  confidence: newConf,
                  flaggedForHumanReview: newConf < prev.systemStatus.humanReviewThreshold,
                  reportIds: [...i.reportIds, repId],
                  needEstimate: {
                    ...i.needEstimate,
                    rawReportCount: i.needEstimate.rawReportCount + 1,
                  },
                }
              : i
          ),
          reports: [voiceReport, ...prev.reports],
          evidenceRecords: [voiceEvidence, ...prev.evidenceRecords],
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowLabel,
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Active Triage',
              summary: `Appended voice-dictated field update (${providerLabel}) to ${incidentId}: "${cleaned.slice(0, 90)}"`,
              targetId: incidentId,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowLabel,
              type: 'followup' as const,
              title: `Field Voice Update Logged (${incidentId})`,
              detail: `${cleaned.slice(0, 120)} (Transcribed via ${providerLabel}).`,
              incidentId,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
    },
    []
  );

  const assignRescueTeam = useCallback(
    (params: {
      incidentId: string;
      teamId: string;
      routeSummary: string;
      hazardWarning: string | null;
      estimatedMinutes: number;
      notes: string;
    }) => {
      setState((prev) => {
        const inc = prev.incidents.find((i) => i.id === params.incidentId);
        const team = prev.rescueTeams.find((t) => t.id === params.teamId);
        if (!inc || !team) return prev;
        const offlineBump = prev.systemStatus.networkTier !== 'TIER_2_CLOUD' ? 1 : 0;

        const newTask: RescueTask = {
          id: `TASK-${Math.floor(100 + Math.random() * 899)}`,
          incidentId: inc.id,
          teamId: team.id,
          assignedBy: `${prev.coordinator.name} (${prev.coordinator.role})`,
          assignedAt: nowTimeStr(),
          status: 'Assigned',
          recommendedResources: inc.recommendedResources,
          routeSummary: params.routeSummary,
          hazardWarning: params.hazardWarning,
          estimatedMinutes: params.estimatedMinutes,
          notes: params.notes,
          isSimulatedDispatch: true,
        };

        return {
          ...prev,
          rescueTasks: [newTask, ...prev.rescueTasks],
          rescueTeams: prev.rescueTeams.map((t) =>
            t.id === team.id
              ? { ...t, assignedIncidentId: inc.id, status: 'Assigned', etaMinutes: params.estimatedMinutes }
              : t
          ),
          systemStatus: {
            ...prev.systemStatus,
            pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + offlineBump,
          },
          auditLogs: [
            {
              id: `AUD-${Date.now()}`,
              timestamp: nowTimeStr(),
              actor: prev.coordinator.name,
              role: prev.coordinator.role,
              category: 'Rescue Dispatch',
              summary: `Assigned ${team.name} (${team.id}) to ${inc.id} (${inc.location.placeName}) — Simulated dispatch.`,
              targetId: inc.id,
            },
            ...prev.auditLogs,
          ],
          activityFeed: [
            {
              id: `ACT-${Date.now()}`,
              timestamp: nowTimeStr(),
              type: 'coordinator' as const,
              title: `Rescue Team Assigned (Simulated): ${team.name}`,
              detail: `Dispatched to ${inc.id} (${inc.location.placeName}), ETA ~${params.estimatedMinutes} min.`,
              incidentId: inc.id,
            },
            ...prev.activityFeed,
          ].slice(0, 40),
        };
      });
    },
    []
  );

  const updateRescueTaskStatus = useCallback((taskId: string, status: RescueTaskStatus) => {
    setState((prev) => {
      const task = prev.rescueTasks.find((t) => t.id === taskId);
      if (!task) return prev;
      return {
        ...prev,
        rescueTasks: prev.rescueTasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
        rescueTeams: prev.rescueTeams.map((team) => {
          if (team.id !== task.teamId) return team;
          if (status === 'Completed' || status === 'Cancelled') {
            return { ...team, status: 'Available', assignedIncidentId: null, etaMinutes: undefined };
          }
          if (status === 'En route' || status === 'On site' || status === 'Assigned') {
            return { ...team, status };
          }
          return team;
        }),
        auditLogs: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: nowTimeStr(),
            actor: prev.coordinator.name,
            role: prev.coordinator.role,
            category: 'Rescue Dispatch',
            summary: `Updated rescue task ${taskId} (${task.incidentId}) status to "${status}".`,
            targetId: task.incidentId,
          },
          ...prev.auditLogs,
        ],
      };
    });
  }, []);

  // Apply concrete application state updates for each step of the 12-event Scenario Replay!
  const applyReplayEventMutation = useCallback((stepNum: number) => {
    const step = DEMO_REPLAY_STEPS.find((s) => s.stepNumber === stepNum);
    if (!step) return;

    setState((prev) => {
      let next = { ...prev, replayStep: stepNum };
      const actItem: SystemActivityItem = {
        id: `ACT-REPLAY-${stepNum}-${Date.now()}`,
        timestamp: step.timeLabel,
        type:
          stepNum <= 3
            ? 'ai_extract'
            : stepNum <= 5
              ? 'duplicate_merge'
              : stepNum === 7
                ? 'dark_zone'
                : stepNum === 8 || stepNum === 9
                  ? 'followup'
                  : stepNum >= 11
                    ? 'network'
                    : 'coordinator',
        title: `[Demo Event ${stepNum}/12] ${step.title}`,
        detail: step.description,
        incidentId: stepNum <= 6 || stepNum === 10 ? 'INC-NTV-001' : stepNum === 8 || stepNum === 9 ? 'INC-NTV-004' : undefined,
      };
      next.activityFeed = [actItem, ...prev.activityFeed].slice(0, 40);

      // Step-specific real state mutations so every module stays synchronized!
      if (stepNum === 1) {
        next.demoStats = { ...prev.demoStats, totalRawMessages30m: prev.demoStats.totalRawMessages30m + 1 };
      } else if (stepNum === 2) {
        next.incidents = prev.incidents.map((i) =>
          i.id === 'INC-NTV-001' ? { ...i, confidence: 0.89 } : i
        );
      } else if (stepNum === 3) {
        next.incidents = prev.incidents.map((i) =>
          i.id === 'INC-NTV-001'
            ? {
                ...i,
                location: { ...i.location, precision: 'approximate', uncertaintyRadiusMeters: 650 },
              }
            : i
        );
      } else if (stepNum === 4) {
        next.demoStats = { ...prev.demoStats, totalRawMessages30m: prev.demoStats.totalRawMessages30m + 3 };
      } else if (stepNum === 5) {
        next.incidents = prev.incidents.map((i) =>
          i.id === 'INC-NTV-001' ? { ...i, verificationStatus: 'Corroborated', duplicateCount: 3 } : i
        );
      } else if (stepNum === 6) {
        next.incidents = prev.incidents.map((i) =>
          i.id === 'INC-NTV-001'
            ? { ...i, needEstimate: { ...i.needEstimate, finalNeedScore: 92 } }
            : i
        );
      } else if (stepNum === 7) {
        next.darkZones = prev.darkZones.map((dz) =>
          dz.id === 'DZ-001' ? { ...dz, riskLevel: 'Critical', connectivityPercent: 14, actualReports: 0 } : dz
        );
      } else if (stepNum === 8) {
        next.followUps = prev.followUps.map((f) =>
          f.id === 'FU-001' && f.status !== 'Information updated'
            ? { ...f, status: 'Awaiting response', sentAt: step.timeLabel }
            : f
        );
        next.demoStats = { ...prev.demoStats, followUpQuestionsSent: Math.max(42, prev.demoStats.followUpQuestionsSent + 1) };
      } else if (stepNum === 9) {
        // Apply simulated reply to FU-001 if still waiting
        const fu = prev.followUps.find((f) => f.id === 'FU-001');
        if (fu && fu.status !== 'Information updated') {
          const opt = fu.simulatedOptions[0];
          next.followUps = prev.followUps.map((f) =>
            f.id === 'FU-001'
              ? {
                  ...f,
                  status: 'Information updated',
                  response: {
                    id: `FUR-REPLAY-9`,
                    questionId: 'FU-001',
                    replyText: opt.replyText,
                    translatedReply: opt.extractedUpdate,
                    receivedAt: step.timeLabel,
                    extractedField: opt.resolvedField,
                    extractedValue: opt.extractedUpdate,
                    confidenceGain: opt.confidenceGain,
                    needScoreDelta: opt.scoreDelta,
                  },
                }
              : f
          );
          next.incidents = prev.incidents.map((i) =>
            i.id === 'INC-NTV-004'
              ? {
                  ...i,
                  summary: `${i.summary} [Active Triage Update: ${opt.extractedUpdate}]`,
                  confidence: 0.86,
                  flaggedForHumanReview: false,
                  severity: 'Critical',
                  missingInformation: i.missingInformation.filter(
                    (m) => m.toLowerCase() !== opt.resolvedField.toLowerCase()
                  ),
                  needEstimate: {
                    ...i.needEstimate,
                    finalNeedScore: 84,
                    factors: [
                      ...i.needEstimate.factors,
                      {
                        id: `f-replay-9`,
                        label: `Active Triage reply (${opt.resolvedField})`,
                        points: opt.scoreDelta,
                        category: 'severity',
                        detail: opt.extractedUpdate,
                      },
                    ],
                  },
                }
              : i
          );
          next.demoStats = { ...prev.demoStats, locationsImproved: prev.demoStats.locationsImproved + 1 };
        }
      } else if (stepNum === 10) {
        next.incidents = prev.incidents.map((i) =>
          i.id === 'INC-NTV-001'
            ? {
                ...i,
                verificationStatus: 'Verified by coordinator',
                coordinatorDecision: {
                  approved: true,
                  approvedBy: prev.coordinator.name,
                  approvedAt: step.timeLabel,
                },
              }
            : i
        );
        const alreadyAssigned = prev.rescueTasks.some(
          (t) => t.incidentId === 'INC-NTV-001' && t.teamId === 'TEAM-BR01'
        );
        if (!alreadyAssigned) {
          next.rescueTasks = [
            {
              id: 'TASK-DEMO-01',
              incidentId: 'INC-NTV-001',
              teamId: 'TEAM-BR01',
              assignedBy: prev.coordinator.name,
              assignedAt: step.timeLabel,
              status: 'En route',
              recommendedResources: ['Motorized inflatable boat', 'Life jackets (6)', 'Geriatric medical kit'],
              routeSummary: 'Simulated OR-Tools Route: Puttur Staging -> Uppinangady High Ground Launch (11.4 km)',
              hazardWarning: 'Detour advised: NH-75 Nelyadi east culvert submerged; approach from Puttur west corridor.',
              estimatedMinutes: 14,
              notes: 'Demo Replay Event 10 simulated rescue dispatch.',
              isSimulatedDispatch: true,
            },
            ...prev.rescueTasks,
          ];
          next.rescueTeams = prev.rescueTeams.map((t) =>
            t.id === 'TEAM-BR01'
              ? { ...t, status: 'En route', assignedIncidentId: 'INC-NTV-001', etaMinutes: 14 }
              : t
          );
        }
      } else if (stepNum === 11) {
        next.systemStatus = {
          ...prev.systemStatus,
          networkTier: 'TIER_1_EDGE',
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + 2,
        };
      } else if (stepNum === 12) {
        next.systemStatus = {
          ...prev.systemStatus,
          networkTier: 'TIER_1_EDGE',
          pendingOfflineSyncCount: prev.systemStatus.pendingOfflineSyncCount + 1,
        };
      }

      next.auditLogs = [
        {
          id: `AUD-REPLAY-${stepNum}-${Date.now()}`,
          timestamp: step.timeLabel,
          actor: 'Scenario Replay Engine',
          role: prev.coordinator.role,
          category: stepNum >= 11 ? 'Network Mode' : stepNum === 10 ? 'Rescue Dispatch' : 'AI Processing',
          summary: `Event ${stepNum}/12: ${step.title} — ${step.highlightMetrics}`,
        },
        ...prev.auditLogs,
      ];

      return next;
    });
  }, []);

  const nextReplayStep = useCallback(() => {
    const current = replayStepRef.current;
    if (current >= DEMO_REPLAY_STEPS.length) {
      setIsReplaying(false);
      return;
    }
    applyReplayEventMutation(current + 1);
  }, [applyReplayEventMutation]);

  const jumpToReplayStep = useCallback(
    (stepNum: number) => {
      const clamped = Math.max(1, Math.min(DEMO_REPLAY_STEPS.length, stepNum));
      applyReplayEventMutation(clamped);
    },
    [applyReplayEventMutation]
  );

  const startReplay = useCallback(() => {
    const fresh = buildInitialState('netravati-flood');
    setState(fresh);
    replayStepRef.current = 0;
    setSelectedIncidentId('INC-NTV-001');
    setIsReplaying(true);
    setTimeout(() => applyReplayEventMutation(1), 150);
  }, [applyReplayEventMutation]);

  const pauseReplay = useCallback(() => setIsReplaying(false), []);
  const resumeReplay = useCallback(() => {
    if (replayStepRef.current >= DEMO_REPLAY_STEPS.length) {
      startReplay();
    } else {
      setIsReplaying(true);
    }
  }, [startReplay]);

  const resetReplay = useCallback(() => {
    setIsReplaying(false);
    const fresh = buildInitialState(state.scenarioId);
    setState(fresh);
    replayStepRef.current = 0;
    setSelectedIncidentId(fresh.incidents[0]?.id ?? 'INC-NTV-001');
  }, [state.scenarioId]);

  useEffect(() => {
    if (!isReplaying) {
      if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
      return;
    }
    replayTimerRef.current = window.setInterval(() => {
      const current = replayStepRef.current;
      if (current >= DEMO_REPLAY_STEPS.length) {
        setIsReplaying(false);
        return;
      }
      applyReplayEventMutation(current + 1);
    }, 3200);
    return () => {
      if (replayTimerRef.current) window.clearInterval(replayTimerRef.current);
    };
  }, [isReplaying, applyReplayEventMutation]);

  const scenarioMeta = SCENARIOS[state.scenarioId];

  const value = useMemo<DhwaniContextValue>(
    () => ({
      activeModule,
      setActiveModule,
      selectedIncidentId,
      setSelectedIncidentId,
      openIncidentDetail,
      scenarioId: state.scenarioId,
      scenarioMeta,
      switchScenario,
      resetDemoState,
      incidents: state.incidents,
      reports: state.reports,
      evidenceRecords: state.evidenceRecords,
      darkZones: state.darkZones,
      followUps: state.followUps,
      rescueTeams: state.rescueTeams,
      rescueTasks: state.rescueTasks,
      auditLogs: state.auditLogs,
      activityFeed: state.activityFeed,
      demoStats: state.demoStats,
      systemStatus: state.systemStatus,
      coordinator: state.coordinator,
      setCoordinatorProfile,
      canApproveOrDispatch,
      canEditTriage,
      setNetworkTier,
      syncOfflineQueue,
      setPiiRedaction,
      setHumanReviewThreshold,
      addIncidentFromIntake,
      attachReportToIncident,
      approveIncidentPriority,
      overrideIncidentScore,
      updateIncidentVerification,
      mergeIncidents,
      splitIncidentReport,
      requestAdditionalEvidence,
      updateIncidentLocation,
      updateIncidentReportingRate,
      triggerDarkZoneAction,
      resolveDarkZoneVerification,
      createAndSendFollowUp,
      sendDraftFollowUp,
      simulateFollowUpResponse,
      appendFieldVoiceUpdate,
      assignRescueTeam,
      updateRescueTaskStatus,
      replayStep: state.replayStep,
      isReplaying,
      startReplay,
      pauseReplay,
      resumeReplay,
      nextReplayStep,
      resetReplay,
      jumpToReplayStep,
    }),
    [
      activeModule,
      selectedIncidentId,
      openIncidentDetail,
      state,
      scenarioMeta,
      switchScenario,
      resetDemoState,
      setCoordinatorProfile,
      canApproveOrDispatch,
      canEditTriage,
      setNetworkTier,
      syncOfflineQueue,
      setPiiRedaction,
      setHumanReviewThreshold,
      addIncidentFromIntake,
      attachReportToIncident,
      approveIncidentPriority,
      overrideIncidentScore,
      updateIncidentVerification,
      mergeIncidents,
      splitIncidentReport,
      requestAdditionalEvidence,
      updateIncidentLocation,
      updateIncidentReportingRate,
      triggerDarkZoneAction,
      resolveDarkZoneVerification,
      createAndSendFollowUp,
      sendDraftFollowUp,
      simulateFollowUpResponse,
      appendFieldVoiceUpdate,
      assignRescueTeam,
      updateRescueTaskStatus,
      isReplaying,
      startReplay,
      pauseReplay,
      resumeReplay,
      nextReplayStep,
      resetReplay,
      jumpToReplayStep,
    ]
  );

  return <DhwaniContext.Provider value={value}>{children}</DhwaniContext.Provider>;
}

export function useDhwani(): DhwaniContextValue {
  const ctx = useContext(DhwaniContext);
  if (!ctx) throw new Error('useDhwani must be used within DhwaniProvider');
  return ctx;
}
