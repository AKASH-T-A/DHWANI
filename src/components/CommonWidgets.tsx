import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  AuditLog,
  Incident,
  NetworkTier,
  SupportedLanguage,
  SystemActivityItem,
  VerificationStatus,
} from '../types/dhwani';

export function EmergencyMetricCard({
  label,
  value,
  subtext,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'neutral' | 'critical' | 'warning' | 'info' | 'success';
  onClick?: () => void;
}) {
  const toneText = {
    neutral: 'text-[#E6EDF7]',
    critical: 'text-red-400',
    warning: 'text-amber-400',
    info: 'text-cyan-400',
    success: 'text-emerald-400',
  }[tone];

  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left w-full bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 transition-colors ${
        onClick ? 'hover:border-[#2F4568] hover:bg-[#131C2D] cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium text-[#8B9BB4] truncate">{label}</div>
      <div className={`mt-1.5 text-2xl font-mono font-semibold tabular-nums tracking-tight ${toneText}`}>
        {value}
      </div>
      {subtext && <div className="mt-1 text-xs text-[#6B7E9B] truncate">{subtext}</div>}
    </Wrapper>
  );
}

/** Clean typographic metadata label (zero-pill discipline) */
export function LanguageBadge({ language }: { language: SupportedLanguage }) {
  const shortMap: Record<SupportedLanguage, string> = {
    Kannada: 'KN · Kannada',
    Tulu: 'TCY · Tulu',
    Malayalam: 'ML · Malayalam',
    Konkani: 'KOK · Konkani',
    Hindi: 'HI · Hindi',
    English: 'EN · English',
    'Code-mixed': 'MIX · Code-mixed',
  };
  return (
    <span className="font-mono text-xs text-cyan-300/90 whitespace-nowrap">
      {shortMap[language] ?? language}
    </span>
  );
}

export function VerificationLabel({ status }: { status: VerificationStatus }) {
  const styles: Record<VerificationStatus, string> = {
    'Verified by coordinator': 'text-emerald-400',
    Corroborated: 'text-cyan-400',
    Unverified: 'text-[#94A3B8]',
    'Conflicting evidence': 'text-red-400',
    'Potentially recycled image': 'text-amber-400',
  };
  return <span className={`text-xs font-medium whitespace-nowrap ${styles[status]}`}>{status}</span>;
}

export function ConfidenceIndicator({
  confidence,
  threshold = 0.7,
  compact = false,
}: {
  confidence: number;
  threshold?: number;
  compact?: boolean;
}) {
  const pct = Math.round(confidence * 100);
  const low = confidence < threshold;
  const barColor = low ? 'bg-amber-500' : confidence >= 0.85 ? 'bg-emerald-500' : 'bg-cyan-500';

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'min-w-[110px]'}`}>
      <div className="w-14 h-1.5 bg-[#1B2638] rounded-sm overflow-hidden shrink-0">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${low ? 'text-amber-400' : 'text-[#CBD5E1]'}`}>
        {pct}%
      </span>
      {low && !compact && (
        <span className="text-[11px] text-amber-400 whitespace-nowrap">Review</span>
      )}
    </div>
  );
}

export function ConnectivityIndicator({
  tier,
  pendingSync,
  onClick,
}: {
  tier: NetworkTier;
  pendingSync: number;
  onClick?: () => void;
}) {
  const config = {
    TIER_2_CLOUD: {
      label: 'Tier 2 · Cloud Online',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      Icon: Wifi,
    },
    TIER_1_EDGE: {
      label: 'Tier 1 · Edge Offline',
      color: 'text-amber-400 border-amber-500/35 bg-amber-500/10',
      Icon: WifiOff,
    },
    TIER_0_SMS: {
      label: 'Tier 0 · SMS-Only',
      color: 'text-red-400 border-red-500/35 bg-red-500/10',
      Icon: Radio,
    },
  }[tier];

  const Icon = config.Icon;

  return (
    <button
      onClick={onClick}
      title="Open Network Tier & Offline Mode Controls"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors hover:brightness-110 cursor-pointer ${config.color}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{config.label}</span>
      {pendingSync > 0 && (
        <span className="font-mono tabular-nums text-[11px] opacity-90">
          · {pendingSync} queued
        </span>
      )}
    </button>
  );
}

export function IncidentPriorityCard({
  incident,
  rank,
  onSelect,
}: {
  incident: Incident;
  rank: number;
  onSelect: (id: string) => void;
}) {
  const score = incident.needEstimate.finalNeedScore;
  const scoreTone =
    score >= 85 ? 'text-red-400' : score >= 70 ? 'text-amber-400' : 'text-cyan-400';

  return (
    <button
      onClick={() => onSelect(incident.id)}
      className="w-full text-left p-3.5 bg-[#0F1623] border border-[#1E2B40] rounded-lg hover:border-[#324A6E] hover:bg-[#131C2D] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#8B9BB4]">
            <span className="font-mono font-semibold text-[#E6EDF7]">#{rank}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{incident.id}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{incident.location.placeName}</span>
          </div>
          <h4 className="mt-1 text-sm font-semibold text-[#E6EDF7] leading-snug line-clamp-1">
            {incident.title}
          </h4>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono text-lg font-semibold tabular-nums leading-none ${scoreTone}`}>
            {score}
            <span className="text-xs text-[#6B7E9B]">/100</span>
          </div>
          <div className="mt-1 text-[11px] text-[#6B7E9B] font-mono tabular-nums">
            {incident.needEstimate.rawReportCount} raw rpts
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8B9BB4]">
        <span>{incident.hazard}</span>
        <span aria-hidden="true">·</span>
        <LanguageBadge language={incident.language} />
        <span aria-hidden="true">·</span>
        <VerificationLabel status={incident.verificationStatus} />
        {incident.flaggedForHumanReview && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-medium">Needs Human Review</span>
          </>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-[#182336] flex items-center justify-between gap-2 text-xs text-[#94A3B8]">
        <span className="truncate">
          Top driver: {incident.needEstimate.factors[0]?.label ?? 'Hazard severity'} (
          {incident.needEstimate.factors[0]?.points > 0 ? '+' : ''}
          {incident.needEstimate.factors[0]?.points ?? 0})
        </span>
        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-[#6B7E9B]" />
      </div>
    </button>
  );
}

export function TimelineEvent({
  item,
  onSelectIncident,
}: {
  item: SystemActivityItem;
  onSelectIncident?: (id: string) => void;
}) {
  const toneMap: Record<SystemActivityItem['type'], string> = {
    ai_extract: 'text-cyan-400',
    incident_new: 'text-orange-400',
    duplicate_merge: 'text-sky-400',
    verification: 'text-emerald-400',
    followup: 'text-amber-400',
    dark_zone: 'text-red-400',
    coordinator: 'text-emerald-300',
    network: 'text-amber-300',
  };

  return (
    <div className="py-2.5 border-b border-[#182336] last:border-b-0 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[#6B7E9B] tabular-nums shrink-0">{item.timestamp}</span>
          <span className={`font-medium truncate ${toneMap[item.type]}`}>{item.title}</span>
        </div>
        <p className="mt-1 text-xs text-[#94A3B8] leading-relaxed">{item.detail}</p>
      </div>
      {item.incidentId && onSelectIncident && (
        <button
          onClick={() => onSelectIncident(item.incidentId!)}
          className="text-xs font-mono text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {item.incidentId}
        </button>
      )}
    </div>
  );
}

export function AuditLogTable({
  logs,
  search = '',
}: {
  logs: AuditLog[];
  search?: string;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? logs.filter(
        (l) =>
          l.summary.toLowerCase().includes(q) ||
          l.actor.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (l.targetId && l.targetId.toLowerCase().includes(q))
      )
    : logs;

  if (filtered.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-[#6B7E9B] border border-[#1E2B40] rounded-lg bg-[#0F1623]">
        No audit entries match the current filter.
      </div>
    );
  }

  return (
    <div className="border border-[#1E2B40] rounded-lg overflow-hidden bg-[#0F1623]">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E2B40] bg-[#131C2D] text-xs font-medium text-[#8B9BB4]">
              <th className="py-2.5 px-3 whitespace-nowrap">Timestamp</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Actor / Role</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Target</th>
              <th className="py-2.5 px-3">Action Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182336] text-xs">
            {filtered.map((log) => (
              <tr key={log.id} className="hover:bg-[#131C2D]/60">
                <td className="py-2.5 px-3 font-mono text-[#8B9BB4] tabular-nums whitespace-nowrap">
                  {log.timestamp}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className="text-[#E6EDF7] font-medium">{log.actor}</div>
                  <div className="text-[11px] text-[#6B7E9B]">{log.role}</div>
                </td>
                <td className="py-2.5 px-3 text-cyan-300/90 whitespace-nowrap">{log.category}</td>
                <td className="py-2.5 px-3 font-mono text-[#CBD5E1] whitespace-nowrap">
                  {log.targetId ?? '—'}
                </td>
                <td className="py-2.5 px-3 text-[#CBD5E1] leading-relaxed">{log.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SystemHealthCard({
  title,
  statusLabel,
  available,
  description,
  modeNote,
}: {
  title: string;
  statusLabel: string;
  available: boolean;
  description: string;
  modeNote?: string;
}) {
  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#E6EDF7]">{title}</h4>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
            available ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {available ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {statusLabel}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-[#94A3B8] leading-relaxed">{description}</p>
      {modeNote && <div className="mt-2 pt-2 border-t border-[#182336] text-[11px] font-mono text-[#6B7E9B]">{modeNote}</div>}
    </div>
  );
}

export function ScenarioReplayControls({
  replayStep,
  totalSteps,
  isReplaying,
  networkTier,
  onStart,
  onPause,
  onResume,
  onNext,
  onReset,
  onToggleOffline,
}: {
  replayStep: number;
  totalSteps: number;
  isReplaying: boolean;
  networkTier: NetworkTier;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onReset: () => void;
  onToggleOffline: () => void;
}) {
  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="text-xs font-mono text-[#8B9BB4] tabular-nums">
          Event <span className="text-[#E6EDF7] font-semibold">{replayStep}</span> / {totalSteps}
        </div>
        <div className="w-36 h-1.5 bg-[#1B2638] rounded-sm overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all duration-300"
            style={{ width: `${(replayStep / totalSteps) * 100}%` }}
          />
        </div>
        <span className="text-xs text-[#8B9BB4] flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {isReplaying ? 'Auto-playing' : replayStep === totalSteps ? 'Completed' : replayStep === 0 ? 'Ready' : 'Paused'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {replayStep === 0 ? (
          <button
            onClick={onStart}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Start Demo
          </button>
        ) : isReplaying ? (
          <button
            onClick={onPause}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        ) : (
          <button
            onClick={onResume}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}

        <button
          onClick={onNext}
          disabled={replayStep >= totalSteps}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#151F30] hover:bg-[#1D2B42] border border-[#243652] text-[#E6EDF7] text-xs font-medium whitespace-nowrap disabled:opacity-40 cursor-pointer transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Next Event
        </button>

        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#151F30] hover:bg-[#1D2B42] border border-[#243652] text-[#CBD5E1] text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>

        <button
          onClick={onToggleOffline}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
            networkTier === 'TIER_2_CLOUD'
              ? 'bg-red-500/10 border-red-500/35 text-red-300 hover:bg-red-500/20'
              : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
          }`}
        >
          {networkTier === 'TIER_2_CLOUD' ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5" />
              Simulate Internet Failure
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5" />
              Restore Internet
            </>
          )}
        </button>
      </div>
    </div>
  );
}
