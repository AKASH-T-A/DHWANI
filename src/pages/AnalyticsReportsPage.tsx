import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useDhwani } from '../store/DhwaniContext';

export function AnalyticsReportsPage() {
  const { incidents, reports, darkZones, followUps, rescueTasks, demoStats, scenarioMeta } = useDhwani();
  const [talukFilter, setTalukFilter] = useState<string>('All');
  const [timeWindow, setTimeWindow] = useState<'Last 30 min (Surge)' | 'Last 2 hours' | 'Full Scenario Window'>(
    'Last 30 min (Surge)'
  );

  const taluks = useMemo(
    () => ['All', ...Array.from(new Set(incidents.map((i) => i.location.taluk)))],
    [incidents]
  );

  const filteredIncidents = useMemo(
    () =>
      talukFilter === 'All'
        ? incidents
        : incidents.filter((i) => i.location.taluk === talukFilter),
    [incidents, talukFilter]
  );

  const filteredIncidentIds = useMemo(
    () => new Set(filteredIncidents.map((i) => i.id)),
    [filteredIncidents]
  );

  const filteredReports = useMemo(
    () => reports.filter((r) => filteredIncidentIds.has(r.incidentId)),
    [reports, filteredIncidentIds]
  );

  // Dynamically compute incoming vs fused timeline from live demoStats + taluk share + timeWindow
  const incomingTimelineData = useMemo(() => {
    const share = incidents.length > 0 ? filteredIncidents.length / incidents.length : 1;
    const totalRaw = Math.max(filteredIncidents.reduce((s, i) => s + i.needEstimate.rawReportCount, 0), Math.round(demoStats.totalRawMessages30m * share));
    const totalFused = Math.max(filteredIncidents.length, Math.round(demoStats.uniqueIncidentsAfterFusion * share));

    const profiles: Record<typeof timeWindow, { labels: string[]; weights: number[] }> = {
      'Last 30 min (Surge)': {
        labels: ['02:30', '02:35', '02:40', '02:45', '02:50', '02:55', '03:00'],
        weights: [0.12, 0.21, 0.34, 0.56, 0.78, 0.91, 1.0],
      },
      'Last 2 hours': {
        labels: ['01:00', '01:20', '01:40', '02:00', '02:20', '02:40', '03:00'],
        weights: [0.04, 0.08, 0.14, 0.24, 0.42, 0.72, 1.0],
      },
      'Full Scenario Window': {
        labels: ['00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00'],
        weights: [0.02, 0.05, 0.09, 0.16, 0.28, 0.61, 1.0],
      },
    };

    const { labels, weights } = profiles[timeWindow];
    return labels.map((time, idx) => {
      const w = weights[idx];
      return {
        time,
        raw: Math.max(1, Math.round(totalRaw * w)),
        fused: Math.max(1, Math.round(totalFused * Math.min(1, Math.pow(w, 0.72)))),
      };
    });
  }, [timeWindow, demoStats, incidents.length, filteredIncidents]);

  const dedupReductionPct = useMemo(() => {
    if (demoStats.totalRawMessages30m <= 0) return 0;
    return Math.round(
      ((demoStats.totalRawMessages30m - demoStats.uniqueIncidentsAfterFusion) /
        demoStats.totalRawMessages30m) *
        100
    );
  }, [demoStats]);

  const hazardData = useMemo(() => {
    const map = new Map<string, number>();
    filteredIncidents.forEach((i) => map.set(i.hazard, (map.get(i.hazard) ?? 0) + 1));
    return Array.from(map.entries()).map(([hazard, count]) => ({ hazard, count }));
  }, [filteredIncidents]);

  const languageData = useMemo(() => {
    const map = new Map<string, number>();
    filteredIncidents.forEach((i) => map.set(i.language, (map.get(i.language) ?? 0) + 1));
    return Array.from(map.entries()).map(([language, count]) => ({ language, count }));
  }, [filteredIncidents]);

  const sourceChannelData = useMemo(() => {
    const map = new Map<string, number>();
    filteredReports.forEach((r) => map.set(r.sourceChannel, (map.get(r.sourceChannel) ?? 0) + 1));
    if (map.size === 0) {
      filteredIncidents.forEach((i) => map.set(i.source, (map.get(i.source) ?? 0) + 1));
    }
    return Array.from(map.entries()).map(([channel, count]) => ({
      channel: channel.length > 16 ? `${channel.slice(0, 15)}…` : channel,
      count,
    }));
  }, [filteredReports, filteredIncidents]);

  const verificationData = useMemo(() => {
    const map = new Map<string, number>();
    filteredIncidents.forEach((i) =>
      map.set(i.verificationStatus, (map.get(i.verificationStatus) ?? 0) + 1)
    );
    return Array.from(map.entries()).map(([status, count]) => ({
      status: status.replace('Verified by coordinator', 'Verified').replace('Potentially recycled image', 'Recycled Img'),
      count,
    }));
  }, [filteredIncidents]);

  const needDistributionData = useMemo(() => {
    const buckets = [
      { band: 'Low (0–44)', count: 0 },
      { band: 'Moderate (45–69)', count: 0 },
      { band: 'High (70–84)', count: 0 },
      { band: 'Critical (85–100)', count: 0 },
    ];
    filteredIncidents.forEach((i) => {
      const s = i.needEstimate.finalNeedScore;
      if (s >= 85) buckets[3].count += 1;
      else if (s >= 70) buckets[2].count += 1;
      else if (s >= 45) buckets[1].count += 1;
      else buckets[0].count += 1;
    });
    return buckets;
  }, [filteredIncidents]);

  const biasChartData = useMemo(
    () =>
      filteredIncidents.map((i) => ({
        location: i.location.placeName.split(' ')[0],
        rawMessages: i.needEstimate.rawReportCount,
        adjustedNeed: i.needEstimate.finalNeedScore,
      })),
    [filteredIncidents]
  );

  const areaEquityData = useMemo(() => {
    const urban = filteredIncidents.filter((i) => i.areaType === 'Urban');
    const remote = filteredIncidents.filter((i) => i.areaType === 'Remote village');
    const avg = (arr: typeof filteredIncidents) =>
      arr.length ? Math.round(arr.reduce((s, x) => s + x.needEstimate.finalNeedScore, 0) / arr.length) : 0;
    const avgRaw = (arr: typeof filteredIncidents) =>
      arr.length ? Math.round(arr.reduce((s, x) => s + x.needEstimate.rawReportCount, 0) / arr.length) : 0;
    return [
      { group: 'Urban Wards', avgRawReports: avgRaw(urban), avgDhwaniScore: avg(urban) },
      { group: 'Remote Villages', avgRawReports: avgRaw(remote), avgDhwaniScore: avg(remote) },
    ];
  }, [filteredIncidents]);

  const handleExportCsv = () => {
    const headers = [
      'Incident ID',
      'Received Time',
      'Location',
      'Taluk',
      'Area Type',
      'Hazard',
      'Severity',
      'Language',
      'Source',
      'Raw Reports',
      'Bias-Corrected Need Score',
      'Confidence',
      'Verification Status',
      'Approved',
    ];
    const rows = filteredIncidents.map((i) => [
      i.id,
      i.receivedAt,
      `"${i.location.placeName}"`,
      i.location.taluk,
      i.areaType,
      i.hazard,
      i.severity,
      i.language,
      i.source,
      i.needEstimate.rawReportCount,
      i.needEstimate.finalNeedScore,
      Math.round(i.confidence * 100) + '%',
      `"${i.verificationStatus}"`,
      i.coordinatorDecision.approved ? 'Yes' : 'No',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dhwani-situation-report-${scenarioMeta.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const completedRescues = rescueTasks.filter((t) => t.status === 'Completed').length;
  const answeredFollowUps = followUps.filter((f) => f.status === 'Information updated').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF7]">
            Analytics, Equity Metrics &amp; Situation Reports
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Live charts computed from active application state ({scenarioMeta.name}). Project performance targets are explicitly separated from simulated prototype metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select analytics time window"
            value={timeWindow}
            onChange={(e) =>
              setTimeWindow(e.target.value as 'Last 30 min (Surge)' | 'Last 2 hours' | 'Full Scenario Window')
            }
            className="px-2.5 py-1.5 text-xs bg-[#0F1623] border border-[#1E2B40] rounded-md text-[#CBD5E1]"
          >
            <option value="Last 30 min (Surge)">Last 30 min (Surge)</option>
            <option value="Last 2 hours">Last 2 hours</option>
            <option value="Full Scenario Window">Full Scenario Window</option>
          </select>

          <select
            aria-label="Filter analytics by taluk"
            value={talukFilter}
            onChange={(e) => setTalukFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-[#0F1623] border border-[#1E2B40] rounded-md text-[#CBD5E1]"
          >
            {taluks.map((t) => (
              <option key={t} value={t}>
                Taluk: {t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#151F30] hover:bg-[#1E2D45] border border-[#243652] text-[#E6EDF7] text-xs font-medium cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Project Performance TARGETS vs Prototype State */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#182336]">
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF7]">
              Project Engineering Targets (Design Benchmarks — Not Claimed Production Results)
            </h2>
            <p className="text-xs text-[#8B9BB4] mt-0.5">
              Displayed strictly separately from simulated hackathon prototype counters.
            </p>
          </div>
          <span className="text-xs font-mono text-amber-400">PROJECT TARGETS</span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[#6B7E9B] font-mono">TARGET · LATENCY</div>
            <div className="mt-1 font-mono text-lg font-semibold text-cyan-400">&lt; 10 seconds</div>
            <div className="mt-1 text-[#94A3B8]">To structure, locate, and rank an incoming report.</div>
          </div>
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[#6B7E9B] font-mono">TARGET · DEDUPLICATION</div>
            <div className="mt-1 font-mono text-lg font-semibold text-cyan-400">≥ 60% reduction</div>
            <div className="mt-1 text-[#94A3B8]">
              Demo workload reduction:{' '}
              <span className="font-mono text-emerald-400">{dedupReductionPct}%</span> ({demoStats.totalRawMessages30m} msgs →{' '}
              {demoStats.uniqueIncidentsAfterFusion} fused).
            </div>
          </div>
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[#6B7E9B] font-mono">TARGET · GEO-ACCURACY</div>
            <div className="mt-1 font-mono text-lg font-semibold text-cyan-400">&lt; 1 km median error</div>
            <div className="mt-1 text-[#94A3B8]">For landmark-only reports without GPS coordinates.</div>
          </div>
          <div className="p-3.5 rounded bg-[#090E17] border border-[#182336]">
            <div className="text-[#6B7E9B] font-mono">TARGET · ATTENTION EQUITY</div>
            <div className="mt-1 font-mono text-lg font-semibold text-cyan-400">≤ 1.2x ratio</div>
            <div className="mt-1 text-[#94A3B8]">Remote village vs urban time-to-attention parity.</div>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Incoming Surge & Raw vs Bias-Corrected Need */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7]">
            Incoming Reports vs Fused Unique Incidents ({timeWindow})
          </h3>
          <p className="text-xs text-[#6B7E9B] mb-3">
            Computed from active scenario counters ({dedupReductionPct}% duplicate suppression across selected scope).
          </p>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={incomingTimelineData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="time" tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="raw" name="Cumulative Raw Messages" stroke="#F97316" fill="#F97316" fillOpacity={0.18} />
                <Area type="monotone" dataKey="fused" name="Unique Fused Incidents" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.28} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7]">
            Reporting-Bias Comparison: Raw Volume vs Adjusted Need
          </h3>
          <p className="text-xs text-[#6B7E9B] mb-3">
            Highlights how remote low-report areas outrank high-volume urban waterlogging.
          </p>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={biasChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="location" tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="rawMessages" name="Raw Reports" fill="#475569" radius={[3, 3, 0, 0]} />
                <Bar dataKey="adjustedNeed" name="Bias-Corrected Need Score" fill="#06B6D4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Hazard Breakdown, Languages, Urban vs Remote Equity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Incidents by Hazard Type</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hazardData} layout="vertical" margin={{ top: 0, right: 12, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis type="number" tick={{ fill: '#8B9BB4', fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="hazard" tick={{ fill: '#CBD5E1', fontSize: 10.5 }} width={95} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Bar dataKey="count" name="Incidents" fill="#F97316" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Incidents by Language</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={languageData} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="language" tick={{ fill: '#8B9BB4', fontSize: 10.5 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Bar dataKey="count" name="Incidents" fill="#38BDF8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Urban vs Remote Attention Equity</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaEquityData} margin={{ top: 4, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="group" tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '10.5px' }} />
                <Bar dataKey="avgRawReports" name="Avg Raw Reports" fill="#64748B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="avgDhwaniScore" name="Avg DHWANI Priority" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 3: Source Channels, Verification Outcomes, Need Score Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Reports by Source Channel</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceChannelData} layout="vertical" margin={{ top: 0, right: 12, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis type="number" tick={{ fill: '#8B9BB4', fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="channel" tick={{ fill: '#CBD5E1', fontSize: 10 }} width={95} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Bar dataKey="count" name="Reports" fill="#06B6D4" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Verification Outcomes</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={verificationData} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="status" tick={{ fill: '#8B9BB4', fontSize: 10 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Bar dataKey="count" name="Incidents" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#E6EDF7] mb-3">Need Score Distribution</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={needDistributionData} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#182336" />
                <XAxis dataKey="band" tick={{ fill: '#8B9BB4', fontSize: 10 }} />
                <YAxis tick={{ fill: '#8B9BB4', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1623', border: '1px solid #243652', fontSize: '12px' }} />
                <Bar dataKey="count" name="Incidents" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Dark Zone Detection & Verification History Table */}
      <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2B40] bg-[#131C2D] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#E6EDF7]">
            Dark Zone Detection &amp; Verification Outreach History ({darkZones.length} Flagged)
          </h3>
          <span className="text-xs font-mono text-[#8B9BB4]">Silence Radar Telemetry</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E2B40] bg-[#111929] text-[11px] text-[#8B9BB4]">
                <th className="py-2 px-3">Village / Taluk</th>
                <th className="py-2 px-3">Risk Level</th>
                <th className="py-2 px-3 text-right">Actual / Expected</th>
                <th className="py-2 px-3 text-right">Connectivity</th>
                <th className="py-2 px-3 text-right">Silent Duration</th>
                <th className="py-2 px-3 text-right">Outreach Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182336]">
              {darkZones.map((dz) => (
                <tr key={dz.id}>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#E6EDF7]">{dz.villageName}</div>
                    <div className="text-[11px] text-[#6B7E9B]">{dz.taluk} · Pop. {dz.population.toLocaleString()}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    <span className={dz.riskLevel === 'Critical' ? 'text-red-400' : 'text-amber-400'}>
                      {dz.riskLevel}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-400">
                    {dz.actualReports} / {dz.expectedReports}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300">
                    {dz.connectivityPercent}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#CBD5E1]">
                    {dz.minutesSilent} min
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-cyan-400">
                    {dz.actions.length} logged
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operational Summary Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 text-xs">
        <div className="p-4 rounded-lg bg-[#0F1623] border border-[#1E2B40]">
          <div className="text-[#8B9BB4]">Active Triage Effectiveness</div>
          <div className="mt-1 font-mono text-lg font-semibold text-cyan-400 tabular-nums">
            {answeredFollowUps} / {followUps.length} answered in session
          </div>
          <div className="text-[#6B7E9B] mt-0.5">{demoStats.locationsImproved} scenario locations narrowed</div>
        </div>
        <div className="p-4 rounded-lg bg-[#0F1623] border border-[#1E2B40]">
          <div className="text-[#8B9BB4]">Dark Zone Monitoring</div>
          <div className="mt-1 font-mono text-lg font-semibold text-red-400 tabular-nums">
            {darkZones.length} villages flagged
          </div>
          <div className="text-[#6B7E9B] mt-0.5">
            {darkZones.reduce((s, d) => s + d.actions.length, 0)} verification checks initiated
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[#0F1623] border border-[#1E2B40]">
          <div className="text-[#8B9BB4]">Rescue Task Completion</div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-400 tabular-nums">
            {completedRescues} / {rescueTasks.length} completed
          </div>
          <div className="text-[#6B7E9B] mt-0.5">Simulated dispatch queue</div>
        </div>
        <div className="p-4 rounded-lg bg-[#0F1623] border border-[#1E2B40]">
          <div className="text-[#8B9BB4]">Rumour &amp; Image Defence</div>
          <div className="mt-1 font-mono text-lg font-semibold text-amber-400 tabular-nums">
            {demoStats.rumoursDownWeighted + demoStats.recycledPhotosDownWeighted} flagged
          </div>
          <div className="text-[#6B7E9B] mt-0.5">
            {demoStats.rumoursDownWeighted} rumours · {demoStats.recycledPhotosDownWeighted} pHash recycled
          </div>
        </div>
      </div>
    </div>
  );
}
