import { MapPin, Users } from 'lucide-react';
import type { RescueTeam } from '../types/dhwani';

export function RescueTeamCard({
  team,
  selected = false,
  onSelect,
}: {
  team: RescueTeam;
  selected?: boolean;
  onSelect?: (teamId: string) => void;
}) {
  const statusColor =
    team.status === 'Available'
      ? 'text-emerald-400'
      : team.status === 'En route' || team.status === 'On site'
        ? 'text-cyan-400'
        : 'text-amber-400';

  const Wrapper = onSelect ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onSelect ? () => onSelect(team.id) : undefined}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        selected
          ? 'bg-[#132238] border-cyan-500/60'
          : 'bg-[#0F1623] border-[#1E2B40] hover:border-[#2E4263]'
      } ${onSelect ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-mono text-[#8B9BB4]">
            {team.id} · {team.type}
          </div>
          <h4 className="mt-0.5 text-sm font-semibold text-[#E6EDF7]">{team.name}</h4>
        </div>
        <span className={`text-xs font-medium whitespace-nowrap ${statusColor}`}>
          {team.status}
          {team.etaMinutes ? ` (${team.etaMinutes}m)` : ''}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-[#6B7E9B]" />
          {team.currentLocation}
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
          <Users className="w-3.5 h-3.5 text-[#6B7E9B]" />
          {team.personnelCount} crew
        </span>
      </div>

      <div className="mt-2.5 text-xs text-[#8B9BB4]">
        Equipment: <span className="text-[#CBD5E1]">{team.availableResources.join(' · ')}</span>
      </div>

      {team.assignedIncidentId && (
        <div className="mt-2 pt-2 border-t border-[#182336] text-xs font-mono text-cyan-300">
          Assigned Incident: {team.assignedIncidentId}
        </div>
      )}
    </Wrapper>
  );
}
