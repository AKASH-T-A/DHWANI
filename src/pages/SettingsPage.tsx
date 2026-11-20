import { useEffect, useState } from 'react';
import { Lock, LogOut, RotateCcw, Save, Search, Shield, UserCheck } from 'lucide-react';
import { AuditLogTable } from '../components/CommonWidgets';
import { useDhwani } from '../store/DhwaniContext';
import type { CoordinatorRole } from '../types/dhwani';

const ROLES: { role: CoordinatorRole; permissions: string }[] = [
  {
    role: 'District Emergency Coordinator',
    permissions: 'Full control: Approve priorities, override scores, merge/split incidents, authorize simulated rescue dispatches.',
  },
  {
    role: 'Rescue Dispatch Officer',
    permissions: 'Operational dispatch: Authorize simulated rescue assignments, update task statuses, and approve incidents.',
  },
  {
    role: 'Triage Intelligence Analyst',
    permissions: 'Analysis & triage: Process incoming reports, send Active Triage questions, inspect Evidence Graph (cannot authorize rescue dispatch).',
  },
  {
    role: 'Read-Only Observer',
    permissions: 'Monitoring only: View Command Center, maps, analytics, and audit logs without modifying priorities or dispatches.',
  },
];

export function SettingsPage() {
  const {
    coordinator,
    setCoordinatorProfile,
    systemStatus,
    setPiiRedaction,
    setHumanReviewThreshold,
    auditLogs,
    resetDemoState,
  } = useDhwani();

  const [nameInput, setNameInput] = useState(coordinator.name);
  const [stationInput, setStationInput] = useState(coordinator.station);
  const [auditSearch, setAuditSearch] = useState('');
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    setNameInput(coordinator.name);
    setStationInput(coordinator.station);
  }, [coordinator.name, coordinator.station]);

  const handleSaveProfile = () => {
    if (!nameInput.trim() || !stationInput.trim()) return;
    setCoordinatorProfile({
      name: nameInput.trim(),
      station: stationInput.trim(),
    });
    setSavedNote(`Coordinator profile updated: ${nameInput.trim()} (${stationInput.trim()}).`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF7]">
            Settings, Responsible AI Controls &amp; Audit Log
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Role-based access controls, Digital Personal Data Protection Act (2023) privacy settings, AI human-review thresholds, and full immutable coordinator audit trail.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetDemoState();
            setSavedNote('Demo dataset and local browser storage reset to initial Netravati 2:47 AM state.');
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-red-300 text-xs font-medium cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Simulated Demo Data
        </button>
      </div>

      {savedNote && (
        <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          {savedNote}
        </div>
      )}

      {/* Row 1: Coordinator Auth & RBAC + Responsible AI & DPDP Privacy */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* RBAC Coordinator Session */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-[#182336] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Coordinator Authentication &amp; Role-Based Access (RBAC)
            </h2>
            <button
              type="button"
              onClick={() => setCoordinatorProfile({ authenticated: false })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-[11px] font-medium text-amber-300 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              Lock / Switch Session
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Coordinator Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8B9BB4] mb-1">Control Room Station</label>
              <input
                type="text"
                value={stationInput}
                onChange={(e) => setStationInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-emerald-400">
              Authenticated Session · {coordinator.role}
            </span>
            <button
              type="button"
              disabled={
                !nameInput.trim() ||
                !stationInput.trim() ||
                (nameInput.trim() === coordinator.name && stationInput.trim() === coordinator.station)
              }
              onClick={handleSaveProfile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              Save Profile
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-[#8B9BB4]">Active Operational Role (Enforces UI Permissions):</div>
            {ROLES.map(({ role, permissions }) => {
              const selected = coordinator.role === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setCoordinatorProfile({ name: nameInput.trim() || coordinator.name, station: stationInput.trim() || coordinator.station, role });
                    setSavedNote(`Switched active role to ${role}.`);
                  }}
                  className={`w-full text-left p-3 rounded-md border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#132238] border-cyan-500/50'
                      : 'bg-[#090E17] border-[#182336] hover:border-[#2C4061]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#E6EDF7]">{role}</span>
                    {selected && <span className="font-mono text-cyan-400">Active</span>}
                  </div>
                  <div className="mt-1 text-[11.5px] text-[#94A3B8]">{permissions}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Responsible AI & DPDP Act 2023 Safeguards */}
        <div className="xl:col-span-6 bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-[#182336]">
            <h2 className="text-sm font-semibold text-[#E6EDF7] flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              Responsible AI & DPDP Act (2023) Privacy Safeguards
            </h2>
          </div>

          {/* PII Redaction Toggle */}
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336] flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-[#E6EDF7]">
                Personally Identifiable Information (PII) Redaction
              </div>
              <p className="text-[11.5px] text-[#94A3B8] mt-0.5">
                Masks citizen phone numbers and identifiers in Evidence & Feed tables following India&apos;s Digital Personal Data Protection Act, 2023.
              </p>
            </div>
            <button
              onClick={() => setPiiRedaction(!systemStatus.piiRedactionEnabled)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-medium shrink-0 cursor-pointer ${
                systemStatus.piiRedactionEnabled
                  ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300'
                  : 'bg-[#151F30] border border-[#243652] text-[#8B9BB4]'
              }`}
            >
              {systemStatus.piiRedactionEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Human Review Threshold */}
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#E6EDF7]">
                AI Confidence Threshold for Mandatory Human Review
              </span>
              <span className="font-mono text-amber-400 tabular-nums">
                {Math.round(systemStatus.humanReviewThreshold * 100)}% (0.{Math.round(systemStatus.humanReviewThreshold * 100)})
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={90}
              step={5}
              value={Math.round(systemStatus.humanReviewThreshold * 100)}
              onChange={(e) => setHumanReviewThreshold(Number(e.target.value) / 100)}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11.5px] text-[#94A3B8]">
              Any incident with AI extraction confidence below this threshold is automatically flagged for coordinator inspection before action.
            </p>
          </div>

          {/* Non-Negotiable Safeguards Summary */}
          <div className="p-3.5 rounded bg-[#0B121F] border border-[#182336] space-y-2 text-xs">
            <div className="font-semibold text-[#E6EDF7] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Enforced System Invariants
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[#94A3B8]">
              <li>API keys are strictly server-side (Express proxy); zero credentials in client code.</li>
              <li>AI never independently issues a real rescue dispatch; human approval is mandatory.</li>
              <li>Landmark-only locations remain marked approximate/uncertain — GPS is never fabricated.</li>
              <li>Silence Radar flags potential risk indicators requiring verification, not automatic proof.</li>
              <li>Perceptual-hash image matches are flagged for review, never declared fake automatically.</li>
              <li>Prototype persistence uses browser LocalStorage; production target is PostgreSQL + PostGIS.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Immutable Audit Log */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Coordinator & System Audit Log ({auditLogs.length} entries)
            </h2>
            <p className="text-xs text-[#6B7E9B]">
              Chronological record of every AI extraction, duplicate merge, priority override, approval, and dispatch.
            </p>
          </div>
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-[#6B7E9B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter audit log by actor, ID, action..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0F1623] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
            />
          </div>
        </div>
        <AuditLogTable logs={auditLogs} search={auditSearch} />
      </div>
    </div>
  );
}
