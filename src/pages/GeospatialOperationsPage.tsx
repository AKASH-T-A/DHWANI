import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, Navigation, Waves } from 'lucide-react';
import { InteractiveMap } from '../components/InteractiveMap';
import { useDhwani } from '../store/DhwaniContext';

export function GeospatialOperationsPage() {
  const {
    incidents,
    darkZones,
    rescueTeams,
    rescueTasks,
    scenarioMeta,
    systemStatus,
    selectedIncidentId,
    setSelectedIncidentId,
    openIncidentDetail,
    setActiveModule,
  } = useDhwani();

  const [selectedDzId, setSelectedDzId] = useState<string | undefined>(undefined);

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) ?? incidents[0];
  const selectedDarkZone = darkZones.find((d) => d.id === selectedDzId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF7]">
            Geospatial Operations &amp; {scenarioMeta.id === 'kodagu-landslide' ? 'Ghat Landslide GIS' : 'Flood Corridor GIS'}
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Distinguishes verified GPS pins from approximate landmark uncertainty zones, monitors {scenarioMeta.region} gauges, road closures, relief shelters, and simulated OR-Tools rescue routes.
          </p>
        </div>
        <div className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5">
          Route suggestions are simulated — never assumed safe without field road verification
        </div>
      </div>

      {/* Main GIS Map + Selected Entity Inspector */}
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
            selectedIncidentId={selectedIncident?.id}
            selectedDarkZoneId={selectedDzId}
            onSelectIncident={(id) => {
              setSelectedIncidentId(id);
              setSelectedDzId(undefined);
            }}
            onSelectDarkZone={(id) => setSelectedDzId(id)}
            heightClass="h-[540px]"
            showRoutes
          />
        </div>

        {/* Right Inspector Panel */}
        <div className="xl:col-span-4 space-y-4">
          {selectedDarkZone ? (
            <div className="bg-[#0F1623] border border-red-500/40 rounded-lg p-4 space-y-3">
              <div className="text-xs font-mono text-red-400">
                DARK ZONE SELECTED · {selectedDarkZone.id}
              </div>
              <h2 className="text-base font-semibold text-[#E6EDF7]">
                {selectedDarkZone.villageName}
              </h2>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                {selectedDarkZone.explanation}
              </p>
              <div className="text-xs font-mono text-amber-300">
                Road Status: {selectedDarkZone.roadStatus}
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('silence-radar')}
                className="w-full py-2 rounded-md bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-medium cursor-pointer"
              >
                Open Silence Radar Verification →
              </button>
            </div>
          ) : selectedIncident ? (
            <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-400">{selectedIncident.id}</span>
                <span className="text-orange-400 font-semibold">
                  Need {selectedIncident.needEstimate.finalNeedScore}/100
                </span>
              </div>
              <h2 className="text-base font-semibold text-[#E6EDF7]">{selectedIncident.title}</h2>
              <p className="text-xs text-[#94A3B8] leading-relaxed">{selectedIncident.summary}</p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-[#090E17] border border-[#182336]">
                  <div className="text-[10px] text-[#6B7E9B] font-sans">Precision</div>
                  <div className="text-[#E6EDF7] capitalize mt-0.5">
                    {selectedIncident.location.precision}
                  </div>
                </div>
                <div className="p-2 rounded bg-[#090E17] border border-[#182336]">
                  <div className="text-[10px] text-[#6B7E9B] font-sans">Uncertainty</div>
                  <div className="text-amber-300 mt-0.5">
                    ±{selectedIncident.location.uncertaintyRadiusMeters}m
                  </div>
                </div>
              </div>

              <div className="p-3 rounded bg-[#0B121F] border border-[#182336] text-xs space-y-1">
                <div className="font-medium text-cyan-300 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" />
                  Simulated OR-Tools Route Suggestion
                </div>
                <div className="text-[#CBD5E1]">
                  {scenarioMeta.id === 'kodagu-landslide'
                    ? `Madikeri staging → ${selectedIncident.location.placeName} via SH-88 ridge bypass (~18–26 min simulated).`
                    : `Nearest staging corridor → ${selectedIncident.location.placeName} via high-elevation taluk bypass (~14–22 min simulated).`}
                </div>
                <div className="text-amber-300/90 text-[11px] flex items-start gap-1 pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Unverified road safety: check road closures before physical movement.
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openIncidentDetail(selectedIncident.id, 'incident-intelligence')}
                  className="flex-1 py-2 rounded-md bg-[#151F30] hover:bg-[#1E2E47] border border-[#243652] text-xs text-[#E6EDF7] font-medium cursor-pointer"
                >
                  Glass-Box Intel
                </button>
                <button
                  onClick={() => openIncidentDetail(selectedIncident.id, 'rescue-coordination')}
                  className="flex-1 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-medium cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  Dispatch <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {/* River Gauges & Rainfall Stations */}
          <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#E6EDF7] flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-cyan-400" />
              River Gauges & Rainfall Sensors
            </h3>
            <div className="divide-y divide-[#182336]">
              {scenarioMeta.sensors.map((s) => (
                <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="text-[#E6EDF7] font-medium">{s.name}</div>
                    <div className="text-[11px] text-[#6B7E9B]">{s.trend} · Threshold {s.dangerThreshold}{s.unit}</div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className={s.status === 'Danger' ? 'text-red-400 font-semibold' : s.status === 'Warning' ? 'text-amber-400' : 'text-emerald-400'}>
                      {s.value} {s.unit}
                    </div>
                    <div className="text-[10.5px] text-[#6B7E9B]">{s.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Road Closures & Relief Centers */}
          <div className="bg-[#0F1623] border border-[#1E2B40] rounded-lg p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#E6EDF7]">Active Road Closures & Relief Centers</h3>
            <div className="space-y-1.5 text-xs">
              {scenarioMeta.roadClosures.map((rc) => (
                <div key={rc.id} className="p-2 rounded bg-[#090E17] border border-orange-500/25">
                  <div className="text-orange-300 font-medium">{rc.roadName}</div>
                  <div className="text-[11px] text-[#94A3B8]">{rc.reason} ({rc.severity})</div>
                </div>
              ))}
              {scenarioMeta.reliefCenters.map((rel) => (
                <div key={rel.id} className="p-2 rounded bg-[#090E17] border border-emerald-500/25 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-emerald-300 font-medium">{rel.name}</div>
                    <div className="text-[11px] text-[#8B9BB4]">{rel.facilities.slice(0, 3).join(' · ')}</div>
                  </div>
                  <span className="font-mono text-[11px] text-[#CBD5E1] tabular-nums shrink-0">
                    {rel.occupancy}/{rel.capacity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
