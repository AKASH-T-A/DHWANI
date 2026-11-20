import type { EmergencyReport, EvidenceRecord, Incident } from '../types/dhwani';

export function EvidenceGraph({
  incident,
  reports,
  evidenceRecords,
}: {
  incident: Incident;
  reports: EmergencyReport[];
  evidenceRecords: EvidenceRecord[];
}) {
  const incidentReports = reports.filter((r) => r.incidentId === incident.id);
  const incidentEvidence = evidenceRecords.filter((e) => e.incidentId === incident.id);

  // Build deterministic node coordinates for clear left-to-right provenance graph:
  // Column 1: Primary & independent sources -> Column 2: Forwarded chains & verification checks -> Column 3: Unified Incident Node
  const primaryReports = incidentReports.filter((r) => !r.forwardedFromId).slice(0, 4);
  const forwardedReports = incidentReports.filter((r) => Boolean(r.forwardedFromId)).slice(0, 3);
  const checkNodes = incidentEvidence
    .filter(
      (e) =>
        e.type === 'sensor_corroboration' ||
        e.type === 'conflicting_claim' ||
        e.type === 'recycled_image_check' ||
        e.type === 'duplicate_merge' ||
        e.type === 'coordinator_verification'
    )
    .slice(0, 3);

  // Map primary report IDs to their exact vertical midpoint so forward arrows connect accurately
  const primaryCenterY = new Map<string, number>();
  primaryReports.forEach((rep, idx) => {
    const y = 42 + idx * 68;
    primaryCenterY.set(rep.id, y + 27);
  });

  const col1Bottom = 42 + Math.max(1, primaryReports.length) * 68;
  const col2StartChecks = 46 + forwardedReports.length * 68;
  const col2Bottom = col2StartChecks + checkNodes.length * 60 + 14;
  const svgHeight = Math.max(270, col1Bottom + 16, col2Bottom + 12);
  const targetY = Math.round(svgHeight / 2 - 48);
  const targetMidY = targetY + 48;

  return (
    <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
        <div>
          <h3 className="text-sm font-semibold text-[#E6EDF7]">
            Evidence Provenance & Duplicate Fusion Graph
          </h3>
          <p className="text-xs text-[#8B9BB4] mt-0.5">
            Shows how multiple reports, forward chains, and sensor signals fuse into a single incident ({incident.id}) without inflating counts.
          </p>
        </div>
        <div className="text-xs font-mono text-[#8B9BB4] tabular-nums">
          {incidentReports.length} linked reports · {incident.duplicateCount} duplicates suppressed
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 820 ${svgHeight}`}
          className="w-full min-w-[640px] bg-[#090F1A] rounded border border-[#182336]"
          style={{ height: `${Math.min(360, svgHeight)}px` }}
        >
          <defs>
            <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
            </marker>
            <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
            </marker>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
            </marker>
            <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
            </marker>
          </defs>

          {/* Column Headers */}
          <text x="30" y="24" fill="#6B7E9B" fontSize="10" fontFamily="JetBrains Mono">
            1. ORIGIN & INDEPENDENT SIGNALS
          </text>
          <text x="305" y="24" fill="#6B7E9B" fontSize="10" fontFamily="JetBrains Mono">
            2. FORWARD CHAINS & VERIFICATION CHECKS
          </text>
          <text x="595" y="24" fill="#6B7E9B" fontSize="10" fontFamily="JetBrains Mono">
            3. FUSED INCIDENT RECORD
          </text>

          {/* Central Fused Incident Target Node */}
          <g transform={`translate(595, ${targetY})`}>
            <rect width="198" height="96" rx="8" fill="#132238" stroke="#38BDF8" strokeWidth="1.6" />
            <text x="14" y="24" fill="#38BDF8" fontSize="11" fontFamily="JetBrains Mono" fontWeight="600">
              {incident.id}
            </text>
            <text x="14" y="44" fill="#E6EDF7" fontSize="11.5" fontWeight="600">
              {incident.location.placeName.slice(0, 24)}
            </text>
            <text x="14" y="63" fill="#94A3B8" fontSize="10">
              Status: {incident.verificationStatus.slice(0, 23)}
            </text>
            <text x="14" y="81" fill="#F97316" fontSize="10.5" fontFamily="JetBrains Mono">
              Need Score: {incident.needEstimate.finalNeedScore}/100
            </text>
          </g>

          {/* Column 1: Primary Reports */}
          {primaryReports.map((rep, idx) => {
            const y = 42 + idx * 68;
            const hasForward = forwardedReports.some((f) => f.forwardedFromId === rep.id);
            return (
              <g key={rep.id}>
                <rect x="28" y={y} width="215" height="54" rx="6" fill="#0F1827" stroke="#263B59" strokeWidth="1.2" />
                <text x="40" y={y + 17} fill="#7DD3FC" fontSize="10" fontFamily="JetBrains Mono">
                  {rep.id} · {rep.sourceChannel.slice(0, 18)}
                </text>
                <text x="40" y={y + 33} fill="#E6EDF7" fontSize="10">
                  {rep.translatedMessage.slice(0, 29)}…
                </text>
                <text x="40" y={y + 46} fill="#8B9BB4" fontSize="9.5" fontFamily="JetBrains Mono">
                  {rep.language} · sim {Math.round(rep.similarityScore * 100)}%
                </text>

                {!hasForward && (
                  <path
                    d={`M 243 ${y + 27} C 380 ${y + 27}, 470 ${targetMidY}, 592 ${targetMidY}`}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="1.3"
                    markerEnd="url(#arrow-cyan)"
                    opacity="0.7"
                  />
                )}
              </g>
            );
          })}

          {/* Column 2 Top: Forwarded Reports linked to their actual origin Y */}
          {forwardedReports.map((fwd, idx) => {
            const y = 46 + idx * 68;
            const originY = (fwd.forwardedFromId && primaryCenterY.get(fwd.forwardedFromId)) ?? (primaryReports.length > 0 ? 69 : y + 27);
            return (
              <g key={fwd.id}>
                <path
                  d={`M 243 ${originY} C 275 ${originY}, 275 ${y + 27}, 302 ${y + 27}`}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.4"
                  strokeDasharray="4 3"
                  markerEnd="url(#arrow-amber)"
                />
                <rect x="305" y={y} width="225" height="54" rx="6" fill="#1C1917" stroke="#D97706" strokeWidth="1.2" />
                <text x="317" y={y + 17} fill="#FBBF24" fontSize="10" fontFamily="JetBrains Mono">
                  FWD CHAIN (depth {fwd.forwardChainDepth}) · {fwd.id}
                </text>
                <text x="317" y={y + 33} fill="#FDE68A" fontSize="10">
                  Originates from {fwd.forwardedFromId}
                </text>
                <text x="317" y={y + 46} fill="#A8A29E" fontSize="9.2">
                  Down-weighted — merged, not double-counted
                </text>
                <path
                  d={`M 530 ${y + 27} C 562 ${y + 27}, 562 ${targetMidY}, 592 ${targetMidY}`}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.3"
                  strokeDasharray="3 3"
                  markerEnd="url(#arrow-amber)"
                />
              </g>
            );
          })}

          {/* Column 2 Bottom: Sensor / Conflict / Image / Merge / Coordinator Verification Nodes */}
          {checkNodes.map((ev, idx) => {
            const y = col2StartChecks + idx * 60;
            const isConflict = ev.type === 'conflicting_claim' || ev.type === 'recycled_image_check';
            const isNeutral = ev.type === 'duplicate_merge';
            const fill = isConflict ? '#231319' : isNeutral ? '#141C2B' : '#0D2220';
            const stroke = isConflict ? '#EF4444' : isNeutral ? '#38BDF8' : '#10B981';
            const textColor = isConflict ? '#FCA5A5' : isNeutral ? '#7DD3FC' : '#6EE7B7';
            const marker = isConflict
              ? 'url(#arrow-red)'
              : isNeutral
                ? 'url(#arrow-cyan)'
                : 'url(#arrow-emerald)';
            return (
              <g key={ev.id}>
                <rect x="305" y={y} width="225" height="50" rx="6" fill={fill} stroke={stroke} strokeWidth="1.2" />
                <text x="317" y={y + 17} fill={textColor} fontSize="10" fontFamily="JetBrains Mono">
                  {ev.label.slice(0, 31)}
                </text>
                <text x="317" y={y + 34} fill="#CBD5E1" fontSize="9.5">
                  {ev.detail.slice(0, 36)}…
                </text>
                <path
                  d={`M 530 ${y + 25} C 565 ${y + 25}, 565 ${targetMidY + 12}, 592 ${targetMidY + 12}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.4"
                  markerEnd={marker}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
