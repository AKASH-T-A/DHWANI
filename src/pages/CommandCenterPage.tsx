import { useMemo } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import {
  EmergencyMetricCard,
  IncidentPriorityCard,
  TimelineEvent,
} from '../components/CommonWidgets';
import { IncidentTable } from '../components/IncidentTable';
import { InteractiveMap } from '../components/InteractiveMap';
import { useDhwani } from '../store/DhwaniContext';

export function CommandCenterPage() {
  const {
    incidents,
    darkZones,
    followUps,
    rescueTeams,
    rescueTasks,
    activityFeed,
    demoStats,
    scenarioMeta,
    systemStatus,
    selectedIncidentId,
    setSelectedIncidentId,
    openIncidentDetail,
    setActiveModule,
  } = useDhwani();

  const sortedByNeed = useMemo(
    () => [...incidents].sort((a, b) => b.needEstimate.finalNeedScore - a.needEstimate.finalNeedScore),
    [incidents]
  );

  const highPriorityCount = incidents.filter(
    (i) => i.needEstimate.finalNeedScore >= 70
  ).length;
  const criticalCount = incidents.filter((i) => i.severity === 'Critical').length;
  const pendingFollowUps = followUps.filter((f) => f.status !== 'Information updated').length;
  const awaitingVerification = incidents.filter(
    (i) =>
      i.verificationStatus === 'Unverified' ||
      i.verificationStatus === 'Conflicting evidence' ||
      i.verificationStatus === 'Potentially recycled image'
  ).length;
  const activeRescueTasks = rescueTasks.filter(
    (t) => t.status === 'Assigned' || t.status === 'En route' || t.status === 'On site'
  ).length;

  return (
    <div className="space-y-6">
      {/* Operational Philosophy & Pipeline Strip */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs font-mono text-cyan-400">
            {scenarioMeta.name} · {scenarioMeta.headlineTime}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7] tracking-tight">
            Reports are not need. Even silence can be a signal.
          </h1>
          <p className="mt-1.5 text-xs text-[#94A3B8] leading-relaxed">
            Listen → Understand & Locate → Fuse & Verify → Estimate Need & Ask Back → Coordinate Rescue.
            Priorities below are ranked by bias-corrected human need rather than raw message count.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setActiveModule('live-demo')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            Run 2:47 AM Live Demo
          </button>
          <button
            onClick={() => setActiveModule('live-feed')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#151F30] hover:bg-[#1D2B42] border border-[#243652] text-[#E6EDF7] text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
          >
            Submit Emergency Report
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* A. 8 Emergency Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <EmergencyMetricCard
          label="Total Reports Received"
          value={demoStats.totalRawMessages30m.toLocaleString()}
          subtext="Simulated 30-min surge across 11 channels"
          onClick={() => setActiveModule('live-feed')}
        />
        <EmergencyMetricCard
          label="Unique Incidents Identified"
          value={demoStats.uniqueIncidentsAfterFusion}
          subtext={`${incidents.length} active detailed records in workspace`}
          tone="info"
          onClick={() => setActiveModule('evidence-verification')}
        />
        <EmergencyMetricCard
          label="High-Priority Incidents"
          value={highPriorityCount}
          subtext="Bias-corrected Need Score ≥ 70"
          tone="warning"
          onClick={() => setActiveModule('incident-intelligence')}
        />
        <EmergencyMetricCard
          label="Critical Incidents"
          value={criticalCount}
          subtext="Immediate life-safety / entrapment"
          tone="critical"
          onClick={() => setActiveModule('incident-intelligence')}
        />
        <EmergencyMetricCard
          label="Potential Silent High-Risk Villages"
          value={darkZones.length}
          subtext="Silence Radar risk indicators (unverified)"
          tone="critical"
          onClick={() => setActiveModule('silence-radar')}
        />
        <EmergencyMetricCard
          label="Pending Follow-Up Questions"
          value={pendingFollowUps}
          subtext={`${demoStats.followUpQuestionsSent} sent · ${demoStats.locationsImproved} locations improved`}
          tone="warning"
          onClick={() => setActiveModule('active-triage')}
        />
        <EmergencyMetricCard
          label="Reports Awaiting Verification"
          value={awaitingVerification}
          subtext={`${demoStats.rumoursDownWeighted} rumours · ${demoStats.recycledPhotosDownWeighted} recycled photos`}
          tone="info"
          onClick={() => setActiveModule('evidence-verification')}
        />
        <EmergencyMetricCard
          label="Rescue Tasks In Progress"
          value={activeRescueTasks}
          subtext={`${rescueTeams.filter((t) => t.status === 'Available').length} of ${rescueTeams.length} teams available`}
          tone="success"
          onClick={() => setActiveModule('rescue-coordination')}
        />
      </div>

      {/* C. Emergency Map + D. Emergency Priority Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8">
          <InteractiveMap
            incidents={incidents}
            darkZones={darkZones}
            rescueTeams={rescueTeams}
            rescueTasks={rescueTasks}
            sensors={scenarioMeta.sensors}
            roadClosures={scenarioMeta.roadClosures}
            reliefCenters={scenarioMeta.reliefCenters}
            networkTier={systemStatus.networkTier}
            scenarioId={scenarioMeta.id}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={(id) => {
              setSelectedIncidentId(id);
            }}
            onSelectDarkZone={() => setActiveModule('silence-radar')}
            heightClass="h-[460px]"
          />
        </div>

        <div className="xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#E6EDF7]">
                Emergency Priority Queue (By Need Score)
              </h2>
              <p className="text-xs text-[#6B7E9B]">
                Sorted by bias-corrected human need, not raw message count
              </p>
            </div>
            <button
              onClick={() => setActiveModule('incident-intelligence')}
              className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap cursor-pointer"
            >
              Inspect Model
            </button>
          </div>

          <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
            {sortedByNeed.slice(0, 5).map((inc, idx) => (
              <IncidentPriorityCard
                key={inc.id}
                incident={inc}
                rank={idx + 1}
                onSelect={(id) => openIncidentDetail(id, 'incident-intelligence')}
              />
            ))}
          </div>
        </div>
      </div>

      {/* B. Live Incident Activity + E. System Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#E6EDF7]">Live Incident Activity</h2>
              <p className="text-xs text-[#6B7E9B]">
                Click any incident row to open Glass-Box Intelligence, Geo-Resolution, and Coordinator Controls
              </p>
            </div>
            <button
              onClick={() => setActiveModule('live-feed')}
              className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap cursor-pointer"
            >
              Full Intake Console
            </button>
          </div>
          <IncidentTable
            incidents={incidents}
            humanReviewThreshold={systemStatus.humanReviewThreshold}
            onSelectIncident={(id) => openIncidentDetail(id, 'incident-intelligence')}
            compact
          />
        </div>

        <div className="xl:col-span-4 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#182336]">
            <div>
              <h2 className="text-sm font-semibold text-[#E6EDF7]">System Activity</h2>
              <p className="text-xs text-[#6B7E9B]">
                AI extractions, duplicate merges, follow-ups & coordinator actions
              </p>
            </div>
            <button
              onClick={() => setActiveModule('settings')}
              className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap cursor-pointer"
            >
              Audit Log
            </button>
          </div>
          <div className="mt-1 max-h-[410px] overflow-y-auto pr-1">
            {activityFeed.slice(0, 12).map((item) => (
              <TimelineEvent
                key={item.id}
                item={item}
                onSelectIncident={(id) => openIncidentDetail(id, 'incident-intelligence')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
