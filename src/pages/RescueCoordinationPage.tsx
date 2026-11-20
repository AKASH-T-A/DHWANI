import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Route, Send, ShieldCheck } from 'lucide-react';
import { RescueTeamCard } from '../components/RescueTeamCard';
import { useDhwani } from '../store/DhwaniContext';
import type { RescueTaskStatus } from '../types/dhwani';

const TASK_STATUSES: RescueTaskStatus[] = [
  'Pending',
  'Assigned',
  'En route',
  'On site',
  'Completed',
  'Cancelled',
];

export function RescueCoordinationPage() {
  const {
    incidents,
    rescueTeams,
    rescueTasks,
    scenarioMeta,
    selectedIncidentId,
    setSelectedIncidentId,
    canApproveOrDispatch,
    assignRescueTeam,
    updateRescueTaskStatus,
  } = useDhwani();

  const sortedIncidents = useMemo(
    () => [...incidents].sort((a, b) => b.needEstimate.finalNeedScore - a.needEstimate.finalNeedScore),
    [incidents]
  );

  const assignedIncidentIds = useMemo(
    () =>
      new Set(
        rescueTasks
          .filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
          .map((t) => t.incidentId)
      ),
    [rescueTasks]
  );

  const pendingRescueRequests = useMemo(
    () => sortedIncidents.filter((inc) => !assignedIncidentIds.has(inc.id)),
    [sortedIncidents, assignedIncidentIds]
  );

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) ?? sortedIncidents[0];

  const availableTeams = rescueTeams.filter((t) => t.status === 'Available');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(availableTeams[0]?.id ?? rescueTeams[0]?.id ?? '');
  const [teamFilter, setTeamFilter] = useState<'All' | 'Available' | 'Assigned'>('All');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchConfirm, setDispatchConfirm] = useState('');

  // Keep selectedTeamId synchronized when switching scenarios or after assigning teams
  useEffect(() => {
    const exists = rescueTeams.some((t) => t.id === selectedTeamId);
    if (!exists) {
      setSelectedTeamId(availableTeams[0]?.id ?? rescueTeams[0]?.id ?? '');
    }
  }, [rescueTeams, selectedTeamId, availableTeams]);

  const filteredTeams = useMemo(() => {
    if (teamFilter === 'Available') return rescueTeams.filter((t) => t.status === 'Available');
    if (teamFilter === 'Assigned') return rescueTeams.filter((t) => t.status !== 'Available');
    return rescueTeams;
  }, [rescueTeams, teamFilter]);

  const selectedTeam = rescueTeams.find((t) => t.id === selectedTeamId);
  const selectedTeamBusy = Boolean(selectedTeam && selectedTeam.status !== 'Available');

  // Detect if route approaches any closed road in scenario
  const matchingClosure = useMemo(() => {
    if (!selectedIncident) return null;
    return scenarioMeta.roadClosures.find(
      (rc) =>
        rc.roadName.toLowerCase().includes(selectedIncident.location.taluk.toLowerCase()) ||
        rc.location.toLowerCase().includes(selectedIncident.location.placeName.split(' ')[0].toLowerCase()) ||
        selectedIncident.location.placeName.toLowerCase().includes('uppinangady')
    );
  }, [selectedIncident, scenarioMeta.roadClosures]);

  const handleAssign = () => {
    if (!selectedIncident || !selectedTeam || !canApproveOrDispatch) return;
    const estMin = selectedTeam.type === 'Local volunteers' ? 8 : selectedTeam.type === 'Boat rescue' ? 14 : 19;
    assignRescueTeam({
      incidentId: selectedIncident.id,
      teamId: selectedTeam.id,
      routeSummary: `Simulated OR-Tools Route: ${selectedTeam.currentLocation} → ${selectedIncident.location.placeName} (~${estMin} min simulated)`,
      hazardWarning: matchingClosure
        ? `Hazard Corridor Warning: ${matchingClosure.roadName} (${matchingClosure.reason}). Verify approach before entering.`
        : null,
      estimatedMinutes: estMin,
      notes: dispatchNotes.trim() || 'Coordinator-authorized simulated rescue dispatch.',
    });
    setDispatchNotes('');
    setDispatchConfirm(
      `Simulated dispatch assigned: ${selectedTeam.name} → ${selectedIncident.id} (${selectedIncident.location.placeName}).`
    );
    const nextAvail = rescueTeams.find((t) => t.status === 'Available' && t.id !== selectedTeam.id);
    if (nextAvail) setSelectedTeamId(nextAvail.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF7]">
            Rescue Coordination &amp; Resource Allocation
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
            Human coordinators retain exclusive dispatch authority. AI recommends equipment and highlights road-hazard warnings; all dispatches below are simulated for the prototype.
          </p>
        </div>

        <div className="px-3 py-2 rounded-md bg-[#0F1623] border border-[#1E2B40] text-xs font-mono text-amber-300">
          SIMULATED DISPATCH WORKFLOW · NO LIVE EMERGENCY SERVICE TRANSMITTED
        </div>
      </div>

      {/* Pending Rescue Requests Queue + Road Accessibility Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#182336]">
            <div>
              <h2 className="text-sm font-semibold text-[#E6EDF7]">
                Pending Rescue Requests ({pendingRescueRequests.length} Unassigned)
              </h2>
              <p className="text-xs text-[#8B9BB4]">
                Ranked by bias-corrected Need Score. Select any request to stage dispatch.
              </p>
            </div>
          </div>
          {pendingRescueRequests.length === 0 ? (
            <div className="p-4 rounded bg-[#090E17] border border-[#182336] text-xs text-emerald-400">
              All active incidents currently have assigned rescue units.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {pendingRescueRequests.slice(0, 4).map((inc) => {
                const active = selectedIncident?.id === inc.id;
                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => {
                      setSelectedIncidentId(inc.id);
                      setDispatchConfirm('');
                    }}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer text-xs ${
                      active
                        ? 'bg-[#132238] border-orange-500/60'
                        : 'bg-[#090E17] border-[#182336] hover:border-[#2C4061]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-cyan-400 font-semibold">{inc.id}</span>
                      <span className="text-orange-400 font-semibold tabular-nums">
                        {inc.needEstimate.finalNeedScore}/100
                      </span>
                    </div>
                    <div className="mt-1 font-medium text-[#E6EDF7] truncate">{inc.location.placeName}</div>
                    <div className="mt-0.5 text-[11px] text-[#94A3B8] truncate">
                      {inc.hazard} · {inc.affectedPeople !== null ? `${inc.affectedPeople} affected` : 'Count unconfirmed'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:col-span-5 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#182336]">
            <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-1.5">
              <Route className="w-4 h-4 text-orange-400" />
              Road Accessibility &amp; Corridor Hazards ({scenarioMeta.roadClosures.length})
            </h2>
          </div>
          <div className="space-y-2 text-xs">
            {scenarioMeta.roadClosures.map((rc) => (
              <div key={rc.id} className="p-2.5 rounded bg-[#090E17] border border-orange-500/25">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-orange-300">{rc.roadName}</span>
                  <span className="font-mono text-[11px] text-red-400">{rc.severity}</span>
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">
                  {rc.location} — {rc.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dispatch Builder + Team Registry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-5 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-[#182336]">
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              1. Select Incident &amp; Assign Rescue Unit
            </h2>
            <p className="text-xs text-[#8B9BB4] mt-0.5">
              Incidents sorted by bias-corrected Need Score.
            </p>
          </div>

          {!canApproveOrDispatch && (
            <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              Current role cannot issue dispatches. Switch to District Emergency Coordinator or Rescue Dispatch Officer in Settings.
            </div>
          )}

          {dispatchConfirm && (
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {dispatchConfirm}
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8B9BB4] mb-1">Target Incident</label>
            <select
              value={selectedIncident?.id ?? ''}
              onChange={(e) => {
                setSelectedIncidentId(e.target.value);
                setDispatchConfirm('');
              }}
              className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] font-mono"
            >
              {sortedIncidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  [{inc.needEstimate.finalNeedScore}/100] {inc.id} — {inc.location.placeName} ({inc.hazard})
                </option>
              ))}
            </select>
          </div>

          {selectedIncident && (
            <div className="p-3 rounded bg-[#090E17] border border-[#182336] text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E6EDF7]">{selectedIncident.title}</span>
                <span className="font-mono text-orange-400">
                  {selectedIncident.needEstimate.finalNeedScore}/100
                </span>
              </div>
              <div className="text-[#94A3B8]">
                Affected: {selectedIncident.affectedPeople ?? 'Unknown'} · Vulnerable:{' '}
                {selectedIncident.vulnerableGroups.join(', ') || 'None noted'}
              </div>
              <div className="text-cyan-300">
                Recommended resources: {selectedIncident.recommendedResources.join(' · ')}
              </div>
            </div>
          )}

          {matchingClosure && (
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Route Hazard Zone Warning</div>
                <div className="mt-0.5">
                  Reported closure near corridor: <strong>{matchingClosure.roadName}</strong> — {matchingClosure.reason}. Confirm alternate launch point before dispatch.
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8B9BB4] mb-1">Select Rescue Team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
            >
              {rescueTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.name} ({t.type}) — {t.status}
                </option>
              ))}
            </select>
            {selectedTeamBusy && (
              <div className="mt-1.5 text-[11px] text-amber-300">
                Note: {selectedTeam?.name} is currently {selectedTeam?.status}. Assigning will reassign this unit from its existing deployment.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-[#8B9BB4] mb-1">Coordinator Dispatch Notes</label>
            <input
              type="text"
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              placeholder="Staging instructions, VHF channel, life-jacket requirement..."
              className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
            />
          </div>

          <button
            type="button"
            disabled={!canApproveOrDispatch || !selectedIncident || !selectedTeam}
            onClick={handleAssign}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-40 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {selectedTeamBusy ? 'Reassign & Authorize Simulated Dispatch' : 'Authorize & Assign Simulated Dispatch'}
          </button>
        </div>

        {/* Right: Rescue Team Registry with Filter Tabs */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Rescue Team Registry ({availableTeams.length} Available / {rescueTeams.length} Total)
            </h2>
            <div className="flex items-center gap-1.5 text-xs">
              {(['All', 'Available', 'Assigned'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTeamFilter(tab)}
                  className={`px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    teamFilter === tab
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300 font-medium'
                      : 'bg-[#0F1623] border-[#1E2B40] text-[#8B9BB4] hover:text-[#E6EDF7]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTeams.map((team) => (
              <RescueTeamCard
                key={team.id}
                team={team}
                selected={selectedTeamId === team.id}
                onSelect={(id) => setSelectedTeamId(id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Active Rescue Tasks & Assignment History */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Rescue Tasks &amp; Status Progression ({rescueTasks.length})
          </h2>
          <span className="text-xs text-[#8B9BB4]">Update status as teams progress</span>
        </div>

        <div className="divide-y divide-[#182336]">
          {rescueTasks.map((task) => {
            const team = rescueTeams.find((t) => t.id === task.teamId);
            const inc = incidents.find((i) => i.id === task.incidentId);
            return (
              <div key={task.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span className="text-cyan-400 font-semibold">{task.id}</span>
                    <span className="text-[#475569]">·</span>
                    <span className="text-[#E6EDF7]">{task.incidentId} ({inc?.location.placeName})</span>
                    <span className="text-[#475569]">·</span>
                    <span className="text-emerald-300">{team?.name ?? task.teamId}</span>
                    <span className="text-[#475569]">·</span>
                    <span className="text-[#8B9BB4]">Assigned {task.assignedAt} by {task.assignedBy}</span>
                  </div>
                  <div className="text-[#CBD5E1]">{task.routeSummary}</div>
                  {task.hazardWarning && (
                    <div className="text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {task.hazardWarning}
                    </div>
                  )}
                  <div className="text-[#6B7E9B]">Notes: {task.notes}</div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {TASK_STATUSES.map((st) => (
                    <button
                      key={st}
                      disabled={!canApproveOrDispatch}
                      onClick={() => updateRescueTaskStatus(task.id, st)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer transition-colors disabled:opacity-40 ${
                        task.status === st
                          ? st === 'Completed'
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                            : st === 'Cancelled'
                              ? 'bg-red-600/20 border-red-500 text-red-300'
                              : 'bg-cyan-600/25 border-cyan-500 text-cyan-300'
                          : 'bg-[#090E17] border-[#1E2B40] text-[#8B9BB4] hover:text-[#E6EDF7]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
