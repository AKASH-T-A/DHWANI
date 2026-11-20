import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Incident, SeverityLevel, SourceChannel, SupportedLanguage, VerificationStatus } from '../types/dhwani';
import { ConfidenceIndicator, LanguageBadge, VerificationLabel } from './CommonWidgets';

export function IncidentTable({
  incidents,
  humanReviewThreshold,
  onSelectIncident,
  compact = false,
}: {
  incidents: Incident[];
  humanReviewThreshold: number;
  onSelectIncident: (id: string) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'All'>('All');
  const [talukFilter, setTalukFilter] = useState<string>('All');
  const [languageFilter, setLanguageFilter] = useState<SupportedLanguage | 'All'>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceChannel | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'All'>('All');

  const taluks = useMemo(
    () => Array.from(new Set(incidents.map((i) => i.location.taluk).filter(Boolean))).sort(),
    [incidents]
  );

  const sources = useMemo(() => Array.from(new Set(incidents.map((i) => i.source))), [incidents]);

  const hasActiveFilters =
    search.trim() !== '' ||
    severityFilter !== 'All' ||
    talukFilter !== 'All' ||
    languageFilter !== 'All' ||
    sourceFilter !== 'All' ||
    statusFilter !== 'All';

  const clearFilters = () => {
    setSearch('');
    setSeverityFilter('All');
    setTalukFilter('All');
    setLanguageFilter('All');
    setSourceFilter('All');
    setStatusFilter('All');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...incidents]
      .filter((inc) => {
        if (severityFilter !== 'All' && inc.severity !== severityFilter) return false;
        if (talukFilter !== 'All' && inc.location.taluk !== talukFilter) return false;
        if (languageFilter !== 'All' && inc.language !== languageFilter) return false;
        if (sourceFilter !== 'All' && inc.source !== sourceFilter) return false;
        if (statusFilter !== 'All' && inc.verificationStatus !== statusFilter) return false;
        if (q) {
          const hay = `${inc.id} ${inc.title} ${inc.location.placeName} ${inc.location.taluk} ${inc.hazard} ${inc.originalMessage} ${inc.processedMessage}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.needEstimate.finalNeedScore - a.needEstimate.finalNeedScore);
  }, [incidents, search, severityFilter, talukFilter, languageFilter, sourceFilter, statusFilter]);

  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
      {/* Filter Toolbar */}
      <div className="p-3 border-b border-[#1E2B40] bg-[#111929] flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[190px]">
          <Search className="w-3.5 h-3.5 text-[#6B7E9B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, village, landmark, Kannada/English text..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] placeholder:text-[#5B6E8C] focus:outline-none focus:border-cyan-500/60"
          />
        </div>

        <select
          aria-label="Filter by severity"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityLevel | 'All')}
          className="px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
        >
          <option value="All">Severity: All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
        </select>

        <select
          aria-label="Filter by location taluk"
          value={talukFilter}
          onChange={(e) => setTalukFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
        >
          <option value="All">Location: All</option>
          {taluks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by source channel"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceChannel | 'All')}
          className="px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
        >
          <option value="All">Source: All</option>
          {sources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by language"
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value as SupportedLanguage | 'All')}
          className="px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
        >
          <option value="All">Language: All</option>
          {(['Kannada', 'Tulu', 'Malayalam', 'Konkani', 'Hindi', 'English', 'Code-mixed'] as SupportedLanguage[]).map(
            (lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            )
          )}
        </select>

        <select
          aria-label="Filter by verification status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VerificationStatus | 'All')}
          className="px-2.5 py-1.5 text-xs bg-[#090E17] border border-[#1E2B40] rounded-md text-[#CBD5E1] focus:outline-none focus:border-cyan-500/60"
        >
          <option value="All">Status: All</option>
          <option value="Verified by coordinator">Verified by coordinator</option>
          <option value="Corroborated">Corroborated</option>
          <option value="Unverified">Unverified</option>
          <option value="Conflicting evidence">Conflicting evidence</option>
          <option value="Potentially recycled image">Potentially recycled image</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-2.5 py-1.5 text-xs rounded-md bg-[#182336] hover:bg-[#22324B] border border-[#2A3D5C] text-cyan-300 font-medium whitespace-nowrap cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Body */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#6B7E9B] space-y-2">
          <div>
            No incidents match the active filters. Clear filters to view all {incidents.length} simulated incidents.
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-1.5 rounded bg-[#182336] hover:bg-[#22324B] border border-[#2A3D5C] text-cyan-300 text-xs font-medium cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E2B40] bg-[#131C2D] text-[11.5px] font-medium text-[#8B9BB4]">
                <th className="py-2.5 px-3 whitespace-nowrap">Incident ID / Time</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Location & Precision</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Hazard</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Source / Language</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Affected / Vulnerable</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Need Score</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Confidence</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182336] text-xs">
              {filtered.map((inc) => {
                const score = inc.needEstimate.finalNeedScore;
                const scoreColor =
                  score >= 85
                    ? 'text-red-400'
                    : score >= 70
                      ? 'text-amber-400'
                      : score >= 45
                        ? 'text-cyan-400'
                        : 'text-[#94A3B8]';
                return (
                  <tr
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id)}
                    className="hover:bg-[#141F33] transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-semibold text-[#E6EDF7]">{inc.id}</div>
                      <div className="font-mono text-[11px] text-[#6B7E9B] tabular-nums">{inc.receivedAt}</div>
                    </td>
                    <td className="py-2.5 px-3 max-w-[230px]">
                      <div className="text-[#E6EDF7] font-medium truncate">{inc.location.placeName}</div>
                      <div className="text-[11px] text-[#8B9BB4] truncate">
                        {inc.location.precision === 'verified'
                          ? 'Verified GPS'
                          : `±${inc.location.uncertaintyRadiusMeters}m (${inc.location.precision})`}
                        {' · '}
                        {inc.location.taluk}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="text-[#E6EDF7]">{inc.hazard}</div>
                      <div
                        className={`text-[11px] font-medium ${
                          inc.severity === 'Critical'
                            ? 'text-red-400'
                            : inc.severity === 'High'
                              ? 'text-amber-400'
                              : 'text-[#8B9BB4]'
                        }`}
                      >
                        {inc.severity}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="text-[#CBD5E1]">{inc.source}</div>
                      <LanguageBadge language={inc.language} />
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="font-mono tabular-nums text-[#E6EDF7]">
                        {inc.affectedPeople !== null ? `${inc.affectedPeople} ppl` : 'Unknown'}
                      </div>
                      <div className="text-[11px] text-amber-300/90 truncate max-w-[140px] ml-auto">
                        {inc.vulnerableGroups.length > 0 ? inc.vulnerableGroups.join(', ') : 'None noted'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className={`font-mono text-sm font-semibold tabular-nums ${scoreColor}`}>
                        {score}/100
                      </div>
                      <div className="font-mono text-[11px] text-[#6B7E9B] tabular-nums">
                        {inc.needEstimate.rawReportCount} raw rpts
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <ConfidenceIndicator
                        confidence={inc.confidence}
                        threshold={humanReviewThreshold}
                        compact={compact}
                      />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <VerificationLabel status={inc.verificationStatus} />
                      {inc.coordinatorDecision.approved && (
                        <div className="text-[11px] text-emerald-400/80">Approved</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
