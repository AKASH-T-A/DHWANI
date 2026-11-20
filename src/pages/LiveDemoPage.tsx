import { ArrowUpRight, CheckCircle2, Circle } from 'lucide-react';
import { EmergencyMetricCard, ScenarioReplayControls } from '../components/CommonWidgets';
import { DEMO_REPLAY_STEPS } from '../data/netravatiScenario';
import { useDhwani } from '../store/DhwaniContext';

export function LiveDemoPage() {
  const {
    demoStats,
    replayStep,
    isReplaying,
    startReplay,
    pauseReplay,
    resumeReplay,
    nextReplayStep,
    resetReplay,
    jumpToReplayStep,
    systemStatus,
    setNetworkTier,
    setActiveModule,
    openIncidentDetail,
  } = useDhwani();

  const currentStepObj =
    DEMO_REPLAY_STEPS.find((s) => s.stepNumber === replayStep) ?? DEMO_REPLAY_STEPS[0];

  const handleToggleOffline = () => {
    if (systemStatus.networkTier === 'TIER_2_CLOUD') {
      setNetworkTier('TIER_1_EDGE', 'Live Demo Network Control');
    } else {
      setNetworkTier('TIER_2_CLOUD', 'Live Demo Network Control');
    }
  };

  const navigateToStepModule = (stepNumber: number, targetModule: typeof DEMO_REPLAY_STEPS[number]['targetModule']) => {
    const incidentModules = new Set([
      'incident-intelligence',
      'evidence-verification',
      'active-triage',
      'rescue-coordination',
      'geospatial',
    ]);
    if (incidentModules.has(targetModule)) {
      const focusId = stepNumber === 8 || stepNumber === 9 ? 'INC-NTV-004' : 'INC-NTV-001';
      openIncidentDetail(focusId, targetModule);
    } else {
      setActiveModule(targetModule);
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Scenario Header */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-mono text-amber-400">
              SIMULATED DISASTER DEMONSTRATION · NOT REAL-WORLD EVENT DATA
            </div>
            <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7]">
              2:47 AM — Netravati River Flood, Coastal Karnataka
            </h1>
            <p className="mt-1.5 text-xs text-[#94A3B8] leading-relaxed">
              Interactive end-to-end replay engine reproducing the DHWANI vision. Every event below updates the shared operational state across Command Center, Incident Intelligence, Evidence Graph, Silence Radar, Active Triage, Rescue Coordination, and Offline System Health.
            </p>
          </div>
          <div className="text-right font-mono text-xs text-[#8B9BB4]">
            <div>Languages: Kannada · Tulu · Malayalam · English</div>
            <div className="mt-1 text-cyan-400">
              Active Tier: {systemStatus.networkTier.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      </div>

      {/* Exact Presentation Scenario Figures */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <EmergencyMetricCard
          label="Messages (30 min)"
          value={demoStats.totalRawMessages30m.toLocaleString()}
          subtext="Simulated burst"
        />
        <EmergencyMetricCard
          label="Unique Incidents"
          value={demoStats.uniqueIncidentsAfterFusion}
          subtext="After fusion"
          tone="info"
        />
        <EmergencyMetricCard
          label="Rumours Down-Weighted"
          value={demoStats.rumoursDownWeighted}
          subtext="Forward chains"
          tone="warning"
        />
        <EmergencyMetricCard
          label="Recycled Photos"
          value={demoStats.recycledPhotosDownWeighted}
          subtext="pHash flagged"
          tone="warning"
        />
        <EmergencyMetricCard
          label="Potential Dark Zones"
          value={demoStats.potentialDarkZones}
          subtext="Silence Radar"
          tone="critical"
        />
        <EmergencyMetricCard
          label="Follow-Ups Sent"
          value={demoStats.followUpQuestionsSent}
          subtext="Active Triage"
          tone="info"
        />
        <EmergencyMetricCard
          label="Locations Improved"
          value={demoStats.locationsImproved}
          subtext="Via victim replies"
          tone="success"
        />
      </div>

      {/* Replay Engine Controls */}
      <ScenarioReplayControls
        replayStep={replayStep}
        totalSteps={DEMO_REPLAY_STEPS.length}
        isReplaying={isReplaying}
        networkTier={systemStatus.networkTier}
        onStart={startReplay}
        onPause={pauseReplay}
        onResume={resumeReplay}
        onNext={nextReplayStep}
        onReset={resetReplay}
        onToggleOffline={handleToggleOffline}
      />

      {/* Current Event Spotlight */}
      <div className="bg-[#111B2E] border border-cyan-500/35 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-cyan-400">
            {replayStep === 0
              ? 'READY TO START — PRESS "START DEMO" OR CLICK ANY EVENT BELOW'
              : `ACTIVE EVENT ${currentStepObj.stepNumber}/12 · ${currentStepObj.timeLabel} · ${currentStepObj.stage}`}
          </div>
          {replayStep > 0 && (
            <button
              type="button"
              onClick={() => navigateToStepModule(currentStepObj.stepNumber, currentStepObj.targetModule)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 cursor-pointer"
            >
              Inspect live effect in {currentStepObj.targetModule.replace('-', ' ')}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-[#E6EDF7]">{currentStepObj.title}</h2>
        <p className="mt-1.5 text-sm text-[#CBD5E1] leading-relaxed">{currentStepObj.description}</p>
        <div className="mt-3 pt-3 border-t border-[#1E2E49] text-xs font-mono text-emerald-400">
          State Delta: {currentStepObj.highlightMetrics}
        </div>
      </div>

      {/* 12-Event Interactive Timeline Grid */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#E6EDF7]">
            12-Event End-to-End Operational Sequence
          </h3>
          <span className="text-xs text-[#8B9BB4]">Click any event to execute it immediately</span>
        </div>
        <div className="divide-y divide-[#182336]">
          {DEMO_REPLAY_STEPS.map((step) => {
            const done = replayStep >= step.stepNumber;
            const current = replayStep === step.stepNumber;
            return (
              <div
                key={step.stepNumber}
                onClick={() => jumpToReplayStep(step.stepNumber)}
                className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer transition-colors ${
                  current
                    ? 'bg-[#14233A]'
                    : done
                      ? 'bg-[#0F1623] hover:bg-[#131C2D]'
                      : 'bg-[#0C121D] opacity-75 hover:opacity-100 hover:bg-[#121A2B]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-[#475569]" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-[#8B9BB4]">EVENT {step.stepNumber}</span>
                      <span className="text-[#475569]">·</span>
                      <span className="text-cyan-400">{step.timeLabel}</span>
                      <span className="text-[#475569]">·</span>
                      <span className="text-amber-300/90">{step.stage}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#E6EDF7]">{step.title}</div>
                    <p className="mt-0.5 text-xs text-[#94A3B8] leading-relaxed">{step.description}</p>
                  </div>
                </div>
                <div className="md:text-right shrink-0 pl-7 md:pl-0">
                  <div className="text-xs font-mono text-emerald-400/90">{step.highlightMetrics}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToReplayStep(step.stepNumber);
                      navigateToStepModule(step.stepNumber, step.targetModule);
                    }}
                    className="mt-1 text-xs text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    Open module <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
