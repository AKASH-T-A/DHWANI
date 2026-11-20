import { useMemo, useState } from 'react';
import { Layers, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type {
  DarkZone,
  HazardCategory,
  Incident,
  NetworkTier,
  ReliefCenter,
  RescueTask,
  RescueTeam,
  RoadClosure,
  SensorReading,
} from '../types/dhwani';

interface InteractiveMapProps {
  incidents: Incident[];
  darkZones: DarkZone[];
  rescueTeams: RescueTeam[];
  rescueTasks?: RescueTask[];
  sensors: SensorReading[];
  roadClosures: RoadClosure[];
  reliefCenters: ReliefCenter[];
  networkTier: NetworkTier;
  scenarioId?: 'netravati-flood' | 'kodagu-landslide';
  selectedIncidentId?: string;
  selectedDarkZoneId?: string;
  onSelectIncident?: (id: string) => void;
  onSelectDarkZone?: (id: string) => void;
  focusMode?: 'all' | 'silence-radar';
  heightClass?: string;
  showRoutes?: boolean;
}

type InspectedEntity =
  | { kind: 'team'; title: string; subtitle: string; detail: string }
  | { kind: 'sensor'; title: string; subtitle: string; detail: string }
  | { kind: 'closure'; title: string; subtitle: string; detail: string }
  | { kind: 'relief'; title: string; subtitle: string; detail: string };

const NETRAVATI_BOUNDS = {
  minLat: 12.60,
  maxLat: 13.06,
  minLng: 74.78,
  maxLng: 75.70,
};

const KODAGU_BOUNDS = {
  minLat: 12.32,
  maxLat: 12.60,
  minLng: 75.46,
  maxLng: 75.86,
};

function projectCoord(lat: number, lng: number, isKodagu: boolean): { x: number; y: number } {
  const b = isKodagu ? KODAGU_BOUNDS : NETRAVATI_BOUNDS;
  const clampedLat = Math.max(b.minLat - 0.02, Math.min(b.maxLat + 0.02, lat));
  const x = ((lng - b.minLng) / (b.maxLng - b.minLng)) * 900 + 50;
  const y = (1 - (clampedLat - b.minLat) / (b.maxLat - b.minLat)) * 460 + 30;
  return {
    x: Math.max(40, Math.min(960, x)),
    y: Math.max(30, Math.min(490, y)),
  };
}

function renderHazardMarkerShape(hazard: HazardCategory, fillColor: string) {
  switch (hazard) {
    case 'Flood':
      return <circle r="7.5" fill={fillColor} stroke="#090E17" strokeWidth="2" />;
    case 'Landslide':
      return <polygon points="0,-8.5 8,6.5 -8,6.5" fill={fillColor} stroke="#090E17" strokeWidth="1.8" />;
    case 'People trapped':
      return <polygon points="0,-8.5 8.5,0 0,8.5 -8.5,0" fill={fillColor} stroke="#090E17" strokeWidth="1.8" />;
    case 'Medical emergency':
      return (
        <g>
          <rect x="-7" y="-7" width="14" height="14" rx="3" fill={fillColor} stroke="#090E17" strokeWidth="1.8" />
          <path d="M -3.5 0 H 3.5 M 0 -3.5 V 3.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'Road blockage':
      return (
        <polygon
          points="-7,-4 0,-8 7,-4 7,4 0,8 -7,4"
          fill={fillColor}
          stroke="#090E17"
          strokeWidth="1.8"
        />
      );
    case 'Building collapse':
    case 'Missing persons':
      return <polygon points="-7.5,-6.5 7.5,-6.5 0,8" fill={fillColor} stroke="#090E17" strokeWidth="1.8" />;
    default:
      return <rect x="-6.5" y="-6.5" width="13" height="13" rx="2" fill={fillColor} stroke="#090E17" strokeWidth="1.8" />;
  }
}

export function InteractiveMap({
  incidents,
  darkZones,
  rescueTeams,
  rescueTasks = [],
  sensors,
  roadClosures,
  reliefCenters,
  networkTier,
  scenarioId,
  selectedIncidentId,
  selectedDarkZoneId,
  onSelectIncident,
  onSelectDarkZone,
  focusMode = 'all',
  heightClass = 'h-[430px]',
  showRoutes = true,
}: InteractiveMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [hazardFilter, setHazardFilter] = useState<HazardCategory | 'All'>('All');
  const [inspected, setInspected] = useState<InspectedEntity | null>(null);

  const isKodagu = useMemo(() => {
    if (scenarioId) return scenarioId === 'kodagu-landslide';
    return incidents.length > 0 && incidents[0].location.lat < 12.58;
  }, [scenarioId, incidents]);

  const [layers, setLayers] = useState({
    incidents: focusMode !== 'silence-radar',
    uncertainty: true,
    darkZones: true,
    rescueTeams: focusMode !== 'silence-radar',
    roadClosures: true,
    sensors: true,
    reliefCenters: focusMode !== 'silence-radar',
    routes: showRoutes && focusMode !== 'silence-radar',
  });

  const toggleLayer = (key: keyof typeof layers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const visibleIncidents = useMemo(
    () => (hazardFilter === 'All' ? incidents : incidents.filter((i) => i.hazard === hazardFilter)),
    [incidents, hazardFilter]
  );

  const availableHazards = useMemo(
    () => Array.from(new Set(incidents.map((i) => i.hazard))),
    [incidents]
  );

  // Regional hydrology & highway corridors adapted to active scenario
  const hydrologyPaths = useMemo(() => {
    if (isKodagu) {
      const kaveri = [
        [12.39, 75.52],
        [12.40, 75.60],
        [12.42, 75.70],
        [12.46, 75.81],
      ].map(([lat, lng]) => projectCoord(lat, lng, true));
      const harangi = [
        [12.54, 75.70],
        [12.51, 75.77],
        [12.48, 75.84],
      ].map(([lat, lng]) => projectCoord(lat, lng, true));
      const nh275 = [
        [12.445, 75.50],
        [12.435, 75.64],
        [12.425, 75.74],
        [12.448, 75.85],
      ].map(([lat, lng]) => projectCoord(lat, lng, true));
      const toD = (pts: { x: number; y: number }[]) =>
        pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      return {
        primaryRiver: toD(kaveri),
        secondaryRiver: toD(harangi),
        highway: toD(nh275),
        primaryLabel: 'Upper Kaveri / Payaswini Headwaters',
        secondaryLabel: 'Harangi Catchment',
        highwayLabel: 'NH-275 Madikeri–Mangaluru Ghat Highway',
        eastRegion: 'KODAGU RIDGE & PUSHPA GIRI SLOPES',
        westRegion: 'WESTERN GHAT ESCARPMENT (TO SULLIA)',
      };
    }

    const netravati = [
      [12.97, 75.52],
      [12.92, 75.39],
      [12.86, 75.30],
      [12.838, 75.252],
      [12.865, 75.15],
      [12.889, 75.037],
      [12.874, 74.996],
      [12.852, 74.88],
      [12.845, 74.81],
    ].map(([lat, lng]) => projectCoord(lat, lng, false));
    const kumaradhara = [
      [12.665, 75.615],
      [12.735, 75.48],
      [12.79, 75.35],
      [12.838, 75.252],
    ].map(([lat, lng]) => projectCoord(lat, lng, false));
    const nh75 = [
      [12.865, 74.84],
      [12.893, 75.04],
      [12.842, 75.25],
      [12.840, 75.388],
      [12.845, 75.56],
    ].map(([lat, lng]) => projectCoord(lat, lng, false));
    const toD = (pts: { x: number; y: number }[]) =>
      pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return {
      primaryRiver: toD(netravati),
      secondaryRiver: toD(kumaradhara),
      highway: toD(nh75),
      primaryLabel: 'Netravati River',
      secondaryLabel: 'Kumaradhara River',
      highwayLabel: 'NH-75 Corridor',
      eastRegion: 'WESTERN GHATS FOOTHILLS',
      westRegion: 'ARABIAN SEA COAST (MANGALURU)',
    };
  }, [isKodagu]);

  // Simulated route preview from nearest Available team to currently selected incident (if not already tasked)
  const previewRoute = useMemo(() => {
    if (!layers.routes || !selectedIncidentId) return null;
    const targetInc = incidents.find((i) => i.id === selectedIncidentId);
    if (!targetInc) return null;
    const alreadyTasked = rescueTasks.some(
      (t) => t.incidentId === selectedIncidentId && t.status !== 'Completed' && t.status !== 'Cancelled'
    );
    if (alreadyTasked) return null;
    const availTeams = rescueTeams.filter((t) => t.status === 'Available');
    if (availTeams.length === 0) return null;
    let nearest = availTeams[0];
    let minDist = Infinity;
    for (const t of availTeams) {
      const d = Math.hypot(t.lat - targetInc.location.lat, t.lng - targetInc.location.lng);
      if (d < minDist) {
        minDist = d;
        nearest = t;
      }
    }
    return {
      team: nearest,
      p1: projectCoord(nearest.lat, nearest.lng, isKodagu),
      p2: projectCoord(targetInc.location.lat, targetInc.location.lng, isKodagu),
    };
  }, [layers.routes, selectedIncidentId, incidents, rescueTasks, rescueTeams, isKodagu]);

  const isOffline = networkTier !== 'TIER_2_CLOUD';

  return (
    <div className="bg-[#0B121F] border border-[#1E2B40] rounded-lg overflow-hidden flex flex-col">
      {/* Map Header Bar */}
      <div className="px-4 py-2.5 border-b border-[#1E2B40] bg-[#0F1623] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#E6EDF7]">
            {focusMode === 'silence-radar'
              ? isKodagu
                ? 'Kodagu Silence Radar Geospatial Layer'
                : 'Netravati Silence Radar Geospatial Layer'
              : isKodagu
                ? 'Kodagu Landslide Operations Map'
                : 'Netravati Flood Operations Map'}
          </span>
          <span className="text-[#6B7E9B]" aria-hidden="true">·</span>
          <span className={`font-mono ${isOffline ? 'text-amber-400' : 'text-cyan-400'}`}>
            {isOffline
              ? 'Offline Vector GIS Fallback (Cached Hydrology)'
              : 'Schematic Regional GIS (Simulated Coordinates)'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
              showFilters
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-[#151F30] border-[#22324B] text-[#CBD5E1] hover:bg-[#1C293F]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Layers
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.25).toFixed(2))))}
            aria-label="Zoom in"
            className="p-1.5 rounded bg-[#151F30] border border-[#22324B] text-[#CBD5E1] hover:bg-[#1C293F] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.25).toFixed(2))))}
            aria-label="Zoom out"
            className="p-1.5 rounded bg-[#151F30] border border-[#22324B] text-[#CBD5E1] hover:bg-[#1C293F] cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setInspected(null);
            }}
            aria-label="Reset map view"
            className="p-1.5 rounded bg-[#151F30] border border-[#22324B] text-[#CBD5E1] hover:bg-[#1C293F] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible Layer & Hazard Controls */}
      {showFilters && (
        <div className="px-4 py-2 border-b border-[#1E2B40] bg-[#111929] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                ['incidents', 'Incidents'],
                ['uncertainty', 'Uncertainty Zones'],
                ['darkZones', 'Dark Zones'],
                ['rescueTeams', 'Rescue Teams'],
                ['roadClosures', 'Road Closures'],
                ['sensors', 'River & Rain Gauges'],
                ['reliefCenters', 'Relief Centers'],
                ['routes', 'Simulated Routes'],
              ] as [keyof typeof layers, string][]
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => toggleLayer(key)}
                  className="accent-cyan-500 rounded cursor-pointer"
                />
                {label}
              </label>
            ))}
          </div>

          <select
            aria-label="Filter map incidents by hazard type"
            value={hazardFilter}
            onChange={(e) => setHazardFilter(e.target.value as HazardCategory | 'All')}
            className="px-2 py-1 text-xs bg-[#090E17] border border-[#1E2B40] rounded text-[#CBD5E1]"
          >
            <option value="All">Hazard Shape: All</option>
            {availableHazards.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Interactive SVG GIS Viewport */}
      <div
        className={`relative w-full ${heightClass} overflow-hidden select-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={(e) => {
          setDragging(true);
          setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }}
        onMouseMove={(e) => {
          if (!dragging) return;
          setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <svg
          viewBox="0 0 1000 520"
          className="w-full h-full bg-[#070D17]"
          role="img"
          aria-label={isKodagu ? 'Interactive Kodagu Landslide GIS Map' : 'Interactive Netravati Flood Disaster GIS Map'}
          onClick={() => setInspected(null)}
        >
          <defs>
            <pattern id="gis-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#132035" strokeWidth="0.7" />
            </pattern>
            <radialGradient id="darkzone-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.30" />
              <stop offset="70%" stopColor="#EF4444" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: '500px 260px' }}>
            {/* Topographic Coordinate Grid */}
            <rect x="-200" y="-200" width="1400" height="920" fill="url(#gis-grid)" />

            {/* Subtle Western Ghats Elevation Contours */}
            <path
              d="M 780 20 Q 750 180 810 340 T 760 510"
              fill="none"
              stroke="#1B2A42"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <path
              d="M 850 10 Q 820 190 885 360 T 840 510"
              fill="none"
              stroke="#1E304B"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text x="720" y="34" fill="#445A7A" fontSize="10" fontFamily="JetBrains Mono">
              {hydrologyPaths.eastRegion}
            </text>
            <text x="54" y="492" fill="#3B5577" fontSize="10" fontFamily="JetBrains Mono">
              {hydrologyPaths.westRegion}
            </text>

            {/* Inundation / Catchment Corridors */}
            <path d={hydrologyPaths.primaryRiver} fill="none" stroke="#0E4A68" strokeWidth="24" strokeLinecap="round" opacity="0.26" />
            <path d={hydrologyPaths.secondaryRiver} fill="none" stroke="#0E4A68" strokeWidth="16" strokeLinecap="round" opacity="0.24" />

            {/* River Channels */}
            <path d={hydrologyPaths.primaryRiver} fill="none" stroke="#0EA5E9" strokeWidth="3.2" strokeLinecap="round" />
            <path d={hydrologyPaths.secondaryRiver} fill="none" stroke="#38BDF8" strokeWidth="2.3" strokeLinecap="round" />

            <text x={isKodagu ? 360 : 415} y={isKodagu ? 390 : 218} fill="#38BDF8" fontSize="10" fontFamily="JetBrains Mono" opacity="0.85">
              {hydrologyPaths.primaryLabel}
            </text>
            <text x={isKodagu ? 670 : 645} y={isKodagu ? 175 : 348} fill="#38BDF8" fontSize="10" fontFamily="JetBrains Mono" opacity="0.85">
              {hydrologyPaths.secondaryLabel}
            </text>

            {/* Primary Highway Corridor */}
            <path d={hydrologyPaths.highway} fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={isKodagu ? 340 : 420} y={isKodagu ? 320 : 274} fill="#64748B" fontSize="9.5" fontFamily="JetBrains Mono">
              {hydrologyPaths.highwayLabel}
            </text>

            {/* Simulated Rescue Routes (Active Dispatches) */}
            {layers.routes &&
              rescueTasks
                .filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
                .map((task) => {
                  const team = rescueTeams.find((rt) => rt.id === task.teamId);
                  const inc = incidents.find((i) => i.id === task.incidentId);
                  if (!team || !inc) return null;
                  const p1 = projectCoord(team.lat, team.lng, isKodagu);
                  const p2 = projectCoord(inc.location.lat, inc.location.lng, isKodagu);
                  return (
                    <g key={task.id}>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#10B981"
                        strokeWidth="2.2"
                        strokeDasharray="5 4"
                      />
                    </g>
                  );
                })}

            {/* Simulated Route Preview for Selected Unassigned Incident */}
            {previewRoute && (
              <line
                x1={previewRoute.p1.x}
                y1={previewRoute.p1.y}
                x2={previewRoute.p2.x}
                y2={previewRoute.p2.y}
                stroke="#38BDF8"
                strokeWidth="1.6"
                strokeDasharray="3 4"
                opacity="0.75"
              />
            )}

            {/* Dark Zones (Silence Radar) */}
            {layers.darkZones &&
              darkZones.map((dz) => {
                const pos = projectCoord(dz.lat, dz.lng, isKodagu);
                const isSelected = selectedDarkZoneId === dz.id;
                const isVerifiedSafe =
                  dz.verificationOutcome === 'Verified Safe (Outage Only)' || dz.riskLevel === 'Low';
                const isEscalated = dz.verificationOutcome === 'Emergency Confirmed (Escalated)';
                const strokeColor = isVerifiedSafe
                  ? '#10B981'
                  : isEscalated || dz.riskLevel === 'Critical'
                    ? '#EF4444'
                    : '#F59E0B';
                const textColor = isVerifiedSafe
                  ? '#6EE7B7'
                  : isEscalated || dz.riskLevel === 'Critical'
                    ? '#FCA5A5'
                    : '#FDE68A';
                const subTextColor = isVerifiedSafe
                  ? '#34D399'
                  : isEscalated || dz.riskLevel === 'Critical'
                    ? '#F87171'
                    : '#FBBF24';
                const statusTag = isVerifiedSafe
                  ? 'VERIFIED SAFE'
                  : isEscalated
                    ? `ESCALATED${dz.linkedIncidentId ? ` ${dz.linkedIncidentId}` : ''}`
                    : 'SILENCE ANOMALY';
                const radius = isVerifiedSafe ? 36 : dz.riskLevel === 'Critical' ? 54 : 42;
                return (
                  <g
                    key={dz.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected(null);
                      onSelectDarkZone?.(dz.id);
                    }}
                  >
                    {!isVerifiedSafe && <circle r={radius} fill="url(#darkzone-grad)" />}
                    <circle
                      r={radius * 0.68}
                      fill={isVerifiedSafe ? 'rgba(16, 185, 129, 0.08)' : 'none'}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? '2.4' : '1.4'}
                      strokeDasharray={isVerifiedSafe ? 'none' : '4 3'}
                    />
                    <circle
                      r="5"
                      fill={strokeColor}
                      stroke="#090E17"
                      strokeWidth="1.5"
                    />
                    <text
                      y={-radius * 0.75}
                      textAnchor="middle"
                      fill={textColor}
                      fontSize="10.5"
                      fontWeight="600"
                      fontFamily="Plus Jakarta Sans"
                    >
                      {dz.villageName}
                    </text>
                    <text
                      y={-radius * 0.75 + 12}
                      textAnchor="middle"
                      fill={subTextColor}
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                    >
                      {statusTag} · {dz.actualReports}/{dz.expectedReports} rpts · {dz.connectivityPercent}% sig
                    </text>
                  </g>
                );
              })}

            {/* Relief Centers */}
            {layers.reliefCenters &&
              reliefCenters.map((rc) => {
                const pos = projectCoord(rc.lat, rc.lng, isKodagu);
                return (
                  <g
                    key={rc.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected({
                        kind: 'relief',
                        title: rc.name,
                        subtitle: `Relief Shelter · Occupancy ${rc.occupancy}/${rc.capacity}`,
                        detail: `Available capacity: ${Math.max(0, rc.capacity - rc.occupancy)} beds (simulated shelter data).`,
                      });
                    }}
                  >
                    <rect
                      x="-6"
                      y="-6"
                      width="12"
                      height="12"
                      rx="2"
                      fill="#065F46"
                      stroke="#34D399"
                      strokeWidth="1.4"
                    />
                    <path d="M -3 0 H 3 M 0 -3 V 3" stroke="#ECFDF5" strokeWidth="1.5" />
                    <text y="16" textAnchor="middle" fill="#6EE7B7" fontSize="9" fontFamily="Public Sans">
                      {rc.name.split(',')[0].slice(0, 22)}
                    </text>
                  </g>
                );
              })}

            {/* River & Rainfall Sensors */}
            {layers.sensors &&
              sensors.map((sen) => {
                const pos = projectCoord(sen.lat, sen.lng, isKodagu);
                const danger = sen.status === 'Danger';
                return (
                  <g
                    key={sen.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected({
                        kind: 'sensor',
                        title: sen.name,
                        subtitle: `${sen.type} · ${sen.status} (${sen.value} ${sen.unit})`,
                        detail: `Danger threshold: ${sen.dangerThreshold} ${sen.unit} · Trend: ${sen.trend} · Updated ${sen.updatedAt} (simulated gauge telemetry).`,
                      });
                    }}
                  >
                    <polygon
                      points="0,-7 7,0 0,7 -7,0"
                      fill={danger ? '#7F1D1D' : '#0E3A53'}
                      stroke={danger ? '#F87171' : '#38BDF8'}
                      strokeWidth="1.4"
                    />
                    <text
                      x="10"
                      y="3"
                      fill={danger ? '#FCA5A5' : '#7DD3FC'}
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                    >
                      {sen.value}
                      {sen.unit}
                    </text>
                  </g>
                );
              })}

            {/* Road Closures */}
            {layers.roadClosures &&
              roadClosures.map((rc) => {
                const pos = projectCoord(rc.lat, rc.lng, isKodagu);
                return (
                  <g
                    key={rc.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected({
                        kind: 'closure',
                        title: rc.roadName,
                        subtitle: `Road Status: ${rc.severity}`,
                        detail: `${rc.reason} — rescue routing avoids this corridor.`,
                      });
                    }}
                  >
                    <circle r="6.5" fill="#451A03" stroke="#F97316" strokeWidth="1.5" />
                    <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" stroke="#FDBA74" strokeWidth="1.5" />
                  </g>
                );
              })}

            {/* Rescue Teams */}
            {layers.rescueTeams &&
              rescueTeams.map((team) => {
                const pos = projectCoord(team.lat, team.lng, isKodagu);
                return (
                  <g
                    key={team.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected({
                        kind: 'team',
                        title: `${team.name} (${team.id})`,
                        subtitle: `${team.type} · ${team.status} · ${team.personnelCount} personnel`,
                        detail: `Location: ${team.currentLocation} · Resources: ${team.availableResources.join(', ')}`,
                      });
                    }}
                  >
                    <polygon
                      points="0,-7 6.5,5 -6.5,5"
                      fill={team.status === 'Available' ? '#047857' : '#0284C7'}
                      stroke="#E6EDF7"
                      strokeWidth="1.2"
                    />
                    <text y="15" textAnchor="middle" fill="#A7F3D0" fontSize="8.8" fontFamily="JetBrains Mono">
                      {team.id.replace('TEAM-', '')}
                    </text>
                  </g>
                );
              })}

            {/* Incident Markers (Distinct Hazard Shapes + Location Uncertainty Polygons) */}
            {layers.incidents &&
              visibleIncidents.map((inc) => {
                const pos = projectCoord(inc.location.lat, inc.location.lng, isKodagu);
                const isSelected = selectedIncidentId === inc.id;
                const score = inc.needEstimate.finalNeedScore;
                const fillColor =
                  score >= 85 ? '#EF4444' : score >= 70 ? '#F97316' : score >= 45 ? '#06B6D4' : '#64748B';
                const uncRadiusPx =
                  inc.location.precision === 'verified'
                    ? 10
                    : inc.location.precision === 'approximate'
                      ? Math.min(34, Math.max(18, inc.location.uncertaintyRadiusMeters / 35))
                      : Math.min(48, Math.max(28, inc.location.uncertaintyRadiusMeters / 35));

                return (
                  <g
                    key={inc.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspected(null);
                      onSelectIncident?.(inc.id);
                    }}
                  >
                    {/* Visual distinction between Verified GPS, Approximate Landmark, and Uncertain Area */}
                    {layers.uncertainty && inc.location.precision !== 'verified' && (
                      <circle
                        r={uncRadiusPx}
                        fill={fillColor}
                        fillOpacity="0.12"
                        stroke={fillColor}
                        strokeWidth={isSelected ? '1.8' : '1.1'}
                        strokeDasharray={inc.location.precision === 'uncertain' ? '2 3' : '5 3'}
                      />
                    )}

                    {/* Selected focus ring */}
                    {isSelected && (
                      <circle r="13.5" fill="none" stroke="#E6EDF7" strokeWidth="1.8" />
                    )}

                    {/* Distinct hazard shape */}
                    {renderHazardMarkerShape(inc.hazard, fillColor)}

                    <text
                      y="-11"
                      textAnchor="middle"
                      fill="#E6EDF7"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="JetBrains Mono"
                    >
                      {inc.id.replace('INC-', '')} ({score})
                    </text>
                    <text
                      y="19"
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="9"
                      fontFamily="Public Sans"
                    >
                      {inc.location.placeName.slice(0, 22)}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>

        {/* Entity Detail Popover when clicking Team / Sensor / Closure / Relief Center */}
        {inspected && (
          <div className="absolute top-3 right-3 max-w-[290px] bg-[#0F1623]/95 border border-cyan-500/40 rounded-lg p-3 shadow-xl text-xs z-10">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-[#E6EDF7]">{inspected.title}</div>
              <button
                type="button"
                aria-label="Close map detail"
                onClick={() => setInspected(null)}
                className="text-[#8B9BB4] hover:text-[#E6EDF7] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[11px] font-mono text-cyan-400 mt-0.5">{inspected.subtitle}</div>
            <p className="text-[11.5px] text-[#CBD5E1] mt-1.5 leading-relaxed">{inspected.detail}</p>
          </div>
        )}

        {/* Bottom-left Map Legend & Honesty Notice */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="bg-[#090E17]/90 border border-[#1E2B40] rounded px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#CBD5E1] pointer-events-auto">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              Flood
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-orange-500 inline-block" />
              Landslide
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-red-500 rotate-45 inline-block" />
              Trapped
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-orange-400 bg-orange-500/30 inline-block" />
              Approx. Zone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-dashed border-red-400 bg-red-500/20 inline-block" />
              Dark Zone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-emerald-400 inline-block" />
              Rescue Team
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-orange-600/80 rounded-full inline-block" />
              Road Closure
            </span>
          </div>

          <div className="bg-[#090E17]/90 border border-[#1E2B40] rounded px-2.5 py-1 text-[10.5px] font-mono text-[#8B9BB4] flex items-center gap-1.5">
            <Maximize2 className="w-3 h-3 text-cyan-400" />
            Simulated demo coordinates — approximate landmarks never shown as verified GPS
          </div>
        </div>
      </div>
    </div>
  );
}

export function SilenceRadarMap(props: Omit<InteractiveMapProps, 'focusMode'>) {
  return <InteractiveMap {...props} focusMode="silence-radar" />;
}
