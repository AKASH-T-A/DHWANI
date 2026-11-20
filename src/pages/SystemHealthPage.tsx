import { RefreshCw, Radio, Server, Wifi, WifiOff } from 'lucide-react';
import { SystemHealthCard } from '../components/CommonWidgets';
import { ARCHITECTURE_CAPABILITY_MATRIX } from '../services/dhwaniApi';
import { useDhwani } from '../store/DhwaniContext';
import type { NetworkTier } from '../types/dhwani';

const TIERS: {
  id: NetworkTier;
  title: string;
  subtitle: string;
  details: string[];
  Icon: typeof Wifi;
}[] = [
  {
    id: 'TIER_2_CLOUD',
    title: 'Tier 2 — Cloud Mode',
    subtitle: 'Full Online Control Room Operation',
    details: [
      'Server-side Cloud AI (Gemini gemini-4-hydrogen)',
      'All 11 simulated ingestion channels active',
      'Live multi-agency synchronization & remote dashboards',
      'Automated cloud archival and full Active Triage',
    ],
    Icon: Wifi,
  },
  {
    id: 'TIER_1_EDGE',
    title: 'Tier 1 — Edge Laptop Mode',
    subtitle: 'Simulated Internet Failure — Local Operation Continues',
    details: [
      'Cloud AI disabled; local rule/edge extraction active (Llama/Qwen interface simulated)',
      'Offline cached vector GIS hydrology map continues seamlessly',
      'Local browser persistence preserves all coordinator overrides & dispatches',
      'Buffers new actions into offline sync queue until uplink returns',
    ],
    Icon: WifiOff,
  },
  {
    id: 'TIER_0_SMS',
    title: 'Tier 0 — SMS-Only Mode',
    subtitle: 'Severe Connectivity Loss — Minimal GSM Fallback',
    details: [
      'GSM modem SMS architecture (simulated interface)',
      'Deterministic multilingual keyword extraction & rule-based scoring',
      '1/2 keypad SMS Active Triage templates only',
      'Zero external cloud dependencies; minimal power/bandwidth footprint',
    ],
    Icon: Radio,
  },
];

export function SystemHealthPage() {
  const { systemStatus, setNetworkTier, syncOfflineQueue } = useDhwani();
  const tier = systemStatus.networkTier;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            RESILIENT 3-TIER ARCHITECTURE · KEEPS WORKING WHEN THE NETWORK FAILS
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#E6EDF7]">
            System Health, Offline Operating Tiers & Sync Status
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8] max-w-3xl">
            Switch between Tier 2 (Cloud), Tier 1 (Edge Laptop), and Tier 0 (SMS-Only) to test how DHWANI degrades gracefully without losing operational state. Local Llama/Qwen and GSM modem transitions are transparently simulated in this web prototype.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tier === 'TIER_2_CLOUD' && systemStatus.pendingOfflineSyncCount > 0 && (
            <button
              onClick={syncOfflineQueue}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync {systemStatus.pendingOfflineSyncCount} Queued Records
            </button>
          )}
          <div className="px-3 py-2 rounded-md bg-[#0F1623] border border-[#1E2B40] text-xs font-mono text-[#CBD5E1] tabular-nums">
            Last Sync: {systemStatus.lastSyncedAt} · Offline Queue: {systemStatus.pendingOfflineSyncCount}
          </div>
        </div>
      </div>

      {/* 3-Tier Interactive Switcher */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {TIERS.map(({ id, title, subtitle, details, Icon }) => {
          const active = tier === id;
          const borderColor = active
            ? id === 'TIER_2_CLOUD'
              ? 'border-emerald-500/60 bg-[#0D1E22]'
              : id === 'TIER_1_EDGE'
                ? 'border-amber-500/60 bg-[#1D1911]'
                : 'border-red-500/60 bg-[#201216]'
            : 'border-[#1E2B40] bg-[#0F1623] hover:border-[#2E4263]';

          return (
            <div key={id} className={`rounded-lg border p-5 flex flex-col justify-between transition-colors ${borderColor}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-semibold text-[#E6EDF7]">{title}</h2>
                  </div>
                  {active && (
                    <span className="text-[11px] font-mono font-semibold text-emerald-400">
                      ACTIVE TIER
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-[#8B9BB4]">{subtitle}</div>
                <ul className="mt-3 space-y-1.5 text-xs text-[#CBD5E1] list-disc pl-4">
                  {details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setNetworkTier(id, 'System Health Control')}
                disabled={active}
                className={`mt-4 w-full py-2 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#151F30] text-[#6B7E9B] cursor-default'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {active ? 'Currently Active' : `Activate ${title.split('—')[0].trim()}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Live Capability Availability Matrix */}
      <div>
        <h2 className="text-sm font-semibold text-[#E6EDF7] mb-3">
          Live Capability Status for {tier.replace(/_/g, ' ')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <SystemHealthCard
            title="Cloud Gemini AI (gemini-4-hydrogen)"
            available={tier === 'TIER_2_CLOUD' && systemStatus.geminiAvailable}
            statusLabel={
              tier !== 'TIER_2_CLOUD'
                ? 'Bypassed (Offline Tier)'
                : systemStatus.geminiAvailable
                  ? 'Connected · Validated Proxy'
                  : 'Key Not Set (Fallback Active)'
            }
            description="Server-side multilingual extraction, vulnerable-person & missing-info detection, cross-lingual duplicate similarity analysis, and Active Triage generation."
            modeNote="Every response passes runtime schema & anti-fabrication validation; local rule-based fallback activates transparently if offline or unavailable."
          />
          <SystemHealthCard
            title="Local Edge Extraction & Scoring"
            available
            statusLabel={tier === 'TIER_1_EDGE' ? 'Primary Active (Simulated)' : 'Warm Standby'}
            description="Deterministic Kannada/Tulu/Malayalam/Hindi/English keyword extraction and explainable Need Score engine."
            modeNote="Architecture ready for quantized Llama/Qwen edge runtime."
          />
          <SystemHealthCard
            title="Offline Vector GIS & Hydrology Map"
            available
            statusLabel={tier === 'TIER_2_CLOUD' ? 'Active (Cached)' : 'Primary Offline Map'}
            description="Netravati river corridors, uncertainty polygons, Dark Zones, and road closures render without external tile servers."
            modeNote="Zero external map tile dependency during backhaul outages."
          />
          <SystemHealthCard
            title="WhatsApp / Telegram / Social Webhooks"
            available={tier === 'TIER_2_CLOUD'}
            statusLabel={tier === 'TIER_2_CLOUD' ? 'Simulated Online' : 'Disabled Offline'}
            description="Internet-dependent messaging channels pause automatically during backhaul outage."
            modeNote="SMS and Missed-call IVR queues remain prioritized."
          />
          <SystemHealthCard
            title="GSM SMS & Missed-Call IVR Gateway"
            available
            statusLabel={tier === 'TIER_0_SMS' ? 'Primary Lifeline (Simulated)' : 'Ready (Simulated)'}
            description="Low-bandwidth 1/2 keypad Active Triage and Silence Radar wellness broadcasts."
            modeNote="Interface compatible with local Gammu GSM USB modem."
          />
          <SystemHealthCard
            title="Local Persistence & Sync Queue"
            available
            statusLabel={
              systemStatus.pendingOfflineSyncCount > 0
                ? `${systemStatus.pendingOfflineSyncCount} Local Changes Queued`
                : 'Synchronized'
            }
            description="All incident edits, approvals, overrides, and dispatches persist locally in browser storage without data loss."
            modeNote="Prototype limitation: browser LocalStorage (Production target: PostgreSQL/PostGIS)."
          />
        </div>
      </div>

      {/* Honest Architectural Separation Matrix */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-[#E6EDF7]">
            Transparent Prototype Architecture Boundary
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E2B40] bg-[#111929] text-[#8B9BB4]">
                <th className="py-2.5 px-4">Component</th>
                <th className="py-2.5 px-4">Target Production Stack</th>
                <th className="py-2.5 px-4">Prototype Status</th>
                <th className="py-2.5 px-4">Implementation Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182336]">
              {ARCHITECTURE_CAPABILITY_MATRIX.map((row) => (
                <tr key={row.id} className="hover:bg-[#131C2D]/60">
                  <td className="py-2.5 px-4 font-medium text-[#E6EDF7]">{row.component}</td>
                  <td className="py-2.5 px-4 font-mono text-[#94A3B8]">{row.targetStack}</td>
                  <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                    <span
                      className={
                        row.status === 'Implemented'
                          ? 'text-emerald-400'
                          : row.status === 'Simulated'
                            ? 'text-amber-400'
                            : row.status === 'Integration-Ready'
                              ? 'text-cyan-400'
                              : 'text-[#8B9BB4]'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[#CBD5E1]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
