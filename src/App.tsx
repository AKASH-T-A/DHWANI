import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BrainCircuit,
  FileSearch,
  LayoutDashboard,
  LifeBuoy,
  Map,
  Menu,
  MessageSquareMore,
  PlayCircle,
  Radar,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { ConnectivityIndicator } from './components/CommonWidgets';
import { DhwaniLogo } from './components/DhwaniLogo';
import { ActiveTriagePage } from './pages/ActiveTriagePage';
import { AnalyticsReportsPage } from './pages/AnalyticsReportsPage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { EvidenceVerificationPage } from './pages/EvidenceVerificationPage';
import { GeospatialOperationsPage } from './pages/GeospatialOperationsPage';
import { IncidentIntelligencePage } from './pages/IncidentIntelligencePage';
import { LiveDemoPage } from './pages/LiveDemoPage';
import { LiveIncidentFeedPage } from './pages/LiveIncidentFeedPage';
import { RescueCoordinationPage } from './pages/RescueCoordinationPage';
import { SettingsPage } from './pages/SettingsPage';
import { SilenceRadarPage } from './pages/SilenceRadarPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import { DhwaniProvider, useDhwani } from './store/DhwaniContext';
import type { CoordinatorRole, DisasterScenarioId, NavigationModule } from './types/dhwani';

const NAV_ITEMS: {
  id: NavigationModule;
  label: string;
  Icon: typeof LayoutDashboard;
  group: 'Operations' | 'Intelligence' | 'System';
}[] = [
  { id: 'command-center', label: 'Command Center', Icon: LayoutDashboard, group: 'Operations' },
  { id: 'live-demo', label: 'Live Demo Replay', Icon: PlayCircle, group: 'Operations' },
  { id: 'live-feed', label: 'Live Incident Feed', Icon: Radio, group: 'Operations' },
  { id: 'incident-intelligence', label: 'Incident Intelligence', Icon: BrainCircuit, group: 'Intelligence' },
  { id: 'silence-radar', label: 'Silence Radar', Icon: Radar, group: 'Intelligence' },
  { id: 'active-triage', label: 'Active Triage', Icon: MessageSquareMore, group: 'Intelligence' },
  { id: 'evidence-verification', label: 'Evidence & Verification', Icon: FileSearch, group: 'Intelligence' },
  { id: 'geospatial', label: 'Geospatial Operations', Icon: Map, group: 'Operations' },
  { id: 'rescue-coordination', label: 'Rescue Coordination', Icon: LifeBuoy, group: 'Operations' },
  { id: 'analytics', label: 'Analytics & Reports', Icon: BarChart3, group: 'System' },
  { id: 'system-health', label: 'System Health', Icon: Activity, group: 'System' },
  { id: 'settings', label: 'Settings', Icon: Settings, group: 'System' },
];

const SIGNIN_ROLES: CoordinatorRole[] = [
  'District Emergency Coordinator',
  'Rescue Dispatch Officer',
  'Triage Intelligence Analyst',
  'Read-Only Observer',
];

function DhwaniShell() {
  const {
    activeModule,
    setActiveModule,
    scenarioId,
    switchScenario,
    systemStatus,
    setNetworkTier,
    syncOfflineQueue,
    coordinator,
    setCoordinatorProfile,
    activityFeed,
    darkZones,
    followUps,
    openIncidentDetail,
  } = useDhwani();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [seenActivityCount, setSeenActivityCount] = useState(0);

  // Coordinator Authentication Modal state (shown only when session locked via Settings)
  const [authName, setAuthName] = useState(coordinator.name);
  const [authStation, setAuthStation] = useState(coordinator.station);
  const [authBadge, setAuthBadge] = useState('DK-EOC-204');
  const [authRole, setAuthRole] = useState<CoordinatorRole>(coordinator.role);

  const unreadCount = Math.max(0, activityFeed.length - seenActivityCount);
  const pendingFollowUps = followUps.filter((f) => f.status !== 'Information updated').length;

  const renderPage = () => {
    switch (activeModule) {
      case 'command-center':
        return <CommandCenterPage />;
      case 'live-demo':
        return <LiveDemoPage />;
      case 'live-feed':
        return <LiveIncidentFeedPage />;
      case 'incident-intelligence':
        return <IncidentIntelligencePage />;
      case 'silence-radar':
        return <SilenceRadarPage />;
      case 'active-triage':
        return <ActiveTriagePage />;
      case 'evidence-verification':
        return <EvidenceVerificationPage />;
      case 'geospatial':
        return <GeospatialOperationsPage />;
      case 'rescue-coordination':
        return <RescueCoordinationPage />;
      case 'analytics':
        return <AnalyticsReportsPage />;
      case 'system-health':
        return <SystemHealthPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B111D] border-r border-[#182336]">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-[#182336] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setActiveModule('command-center');
            setMobileNavOpen(false);
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer min-w-0"
        >
          <DhwaniLogo size={30} />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-[#E6EDF7] leading-none">
              DHWANI
            </div>
            <div className="text-[10.5px] text-[#7D91AE] truncate mt-0.5">
              Every voice heard
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 text-[#8B9BB4] hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile-only Scenario Selector inside drawer */}
      <div className="sm:hidden px-3 pt-3">
        <label className="block text-[10.5px] font-mono text-[#6B7E9B] mb-1">DISASTER SCENARIO</label>
        <select
          aria-label="Select mobile disaster scenario"
          value={scenarioId}
          onChange={(e) => {
            switchScenario(e.target.value as DisasterScenarioId);
            setMobileNavOpen(false);
          }}
          className="w-full px-2.5 py-1.5 text-xs bg-[#0F1623] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
        >
          <option value="netravati-flood">Netravati River Flood — Coastal Karnataka</option>
          <option value="kodagu-landslide">Western Ghats Landslide — Kodagu District</option>
        </select>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeModule === id;
          const badgeCount =
            id === 'silence-radar'
              ? darkZones.length
              : id === 'active-triage'
                ? pendingFollowUps
                : null;

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveModule(id);
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#152238] text-[#E6EDF7]'
                  : 'text-[#8B9BB4] hover:text-[#E6EDF7] hover:bg-[#111929]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-cyan-400' : id === 'live-demo' ? 'text-orange-400' : 'text-[#64748B]'
                  }`}
                />
                <span className="truncate">{label}</span>
              </span>
              {badgeCount !== null && badgeCount > 0 && (
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    id === 'silence-radar' ? 'text-red-400' : 'text-amber-400'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Coordinator Profile Footer */}
      <div className="p-3 border-t border-[#182336] shrink-0">
        <button
          type="button"
          onClick={() => {
            setActiveModule('settings');
            setMobileNavOpen(false);
          }}
          className="w-full p-2.5 rounded-md bg-[#0F1623] hover:bg-[#141E30] border border-[#1E2B40] flex items-center gap-2.5 text-left cursor-pointer transition-colors"
        >
          <div className="w-8 h-8 rounded-md bg-[#17263D] border border-[#243857] flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#E6EDF7] truncate">{coordinator.name}</div>
            <div className="text-[10.5px] text-[#7D91AE] truncate">{coordinator.role}</div>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090E17] text-[#E6EDF7] flex">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-[248px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[260px] h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-black/65"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      {/* Click-away backdrop for top-bar popovers */}
      {(notifOpen || networkMenuOpen) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setNotifOpen(false);
            setNetworkMenuOpen(false);
          }}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Command Bar */}
        <header className="sticky top-0 z-30 h-14 bg-[#0B111D]/95 backdrop-blur-xs border-b border-[#182336] px-4 lg:px-6 flex items-center justify-between gap-3">
          {/* Left: Mobile Menu + Scenario Selector + Prominent Demo Mode Indicator */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded bg-[#131C2D] border border-[#1E2B40] text-[#CBD5E1] cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0">
              DEMO MODE · SIMULATED DATA
            </span>

            <select
              aria-label="Select global disaster scenario"
              value={scenarioId}
              onChange={(e) => switchScenario(e.target.value as DisasterScenarioId)}
              className="hidden sm:block px-2.5 py-1.5 text-xs bg-[#0F1623] border border-[#1E2B40] rounded-md text-[#E6EDF7] max-w-[290px] truncate cursor-pointer focus:outline-none focus:border-cyan-500/60"
            >
              <option value="netravati-flood">Netravati River Flood — Coastal Karnataka</option>
              <option value="kodagu-landslide">Western Ghats Landslide — Kodagu District</option>
            </select>
          </div>

          {/* Right: Demo Network Control Dropdown + Notification Center */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative">
              <ConnectivityIndicator
                tier={systemStatus.networkTier}
                pendingSync={systemStatus.pendingOfflineSyncCount}
                onClick={() => {
                  setNetworkMenuOpen((o) => !o);
                  setNotifOpen(false);
                }}
              />

              {networkMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-[#0F1623] border border-[#243652] rounded-lg shadow-xl z-40 overflow-hidden text-xs">
                  <div className="px-3.5 py-2.5 border-b border-[#182336] flex items-center justify-between">
                    <span className="font-semibold text-[#E6EDF7]">Demo Network Control</span>
                    <span className="font-mono text-[10.5px] text-cyan-400">
                      {systemStatus.networkTier.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setNetworkTier('TIER_2_CLOUD', 'Top Bar Demo Network Control');
                        setNetworkMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors ${
                        systemStatus.networkTier === 'TIER_2_CLOUD'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'text-[#CBD5E1] hover:bg-[#152033]'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-medium">Online — Tier 2 Cloud Mode</div>
                        <div className="text-[10.5px] text-[#8B9BB4]">Gemini API + full channels active</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNetworkTier('TIER_1_EDGE', 'Top Bar Demo Network Control');
                        setNetworkMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors ${
                        systemStatus.networkTier === 'TIER_1_EDGE'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'text-[#CBD5E1] hover:bg-[#152033]'
                      }`}
                    >
                      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-medium">Simulate Internet Failure (Tier 1 Edge)</div>
                        <div className="text-[10.5px] text-[#8B9BB4]">Local extraction, SMS &amp; offline GIS</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNetworkTier('TIER_0_SMS', 'Top Bar Demo Network Control');
                        setNetworkMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors ${
                        systemStatus.networkTier === 'TIER_0_SMS'
                          ? 'bg-red-500/15 text-red-300'
                          : 'text-[#CBD5E1] hover:bg-[#152033]'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <div>
                        <div className="font-medium">Severe Outage (Tier 0 SMS-Only)</div>
                        <div className="text-[10.5px] text-[#8B9BB4]">GSM SMS/IVR + keyword fallback</div>
                      </div>
                    </button>

                    {systemStatus.pendingOfflineSyncCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (systemStatus.networkTier !== 'TIER_2_CLOUD') {
                            setNetworkTier('TIER_2_CLOUD', 'Top Bar Restore & Sync');
                          } else {
                            syncOfflineQueue();
                          }
                          setNetworkMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                        Restore &amp; Sync Queue ({systemStatus.pendingOfflineSyncCount} pending)
                      </button>
                    )}

                    <div className="pt-1 border-t border-[#182336]">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModule('system-health');
                          setNetworkMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded text-cyan-400 hover:bg-[#152033] cursor-pointer"
                      >
                        Open System Health &amp; Offline Architecture →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !notifOpen;
                  setNotifOpen(nextOpen);
                  setNetworkMenuOpen(false);
                  if (nextOpen) setSeenActivityCount(activityFeed.length);
                }}
                aria-label="Notifications"
                className="relative p-2 rounded-md bg-[#0F1623] hover:bg-[#152033] border border-[#1E2B40] text-[#CBD5E1] cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-orange-600 text-[10px] font-mono text-white flex items-center justify-center tabular-nums">
                    {Math.min(9, unreadCount)}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0F1623] border border-[#243652] rounded-lg shadow-xl z-40 overflow-hidden">
                  <div className="px-3.5 py-2.5 border-b border-[#182336] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#E6EDF7]">
                      Control Room Alerts ({activityFeed.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-[#6B7E9B] hover:text-[#E6EDF7] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#182336]">
                    {activityFeed.slice(0, 8).map((act) => (
                      <div
                        key={act.id}
                        onClick={() => {
                          if (act.incidentId) {
                            openIncidentDetail(act.incidentId, 'incident-intelligence');
                          }
                          setNotifOpen(false);
                        }}
                        className="p-3 hover:bg-[#131C2D] cursor-pointer text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-cyan-300 truncate">{act.title}</span>
                          <span className="font-mono text-[10.5px] text-[#6B7E9B] shrink-0">
                            {act.timestamp}
                          </span>
                        </div>
                        <p className="mt-1 text-[#94A3B8] line-clamp-2">{act.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Offline Banner whenever not in Cloud Mode */}
        {systemStatus.networkTier !== 'TIER_2_CLOUD' && (
          <div className="bg-amber-500/15 border-b border-amber-500/35 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <div>
              <strong>
                {systemStatus.networkTier === 'TIER_1_EDGE'
                  ? 'TIER 1 — EDGE LAPTOP MODE ACTIVE (SIMULATED OFFLINE):'
                  : 'TIER 0 — SMS-ONLY MODE ACTIVE (SEVERE LINK LOSS):'}
              </strong>{' '}
              Cloud AI &amp; external feeds paused. Offline Vector GIS, local extraction, and local record queuing remain operational.
            </div>
            <button
              type="button"
              onClick={() => setNetworkTier('TIER_2_CLOUD', 'Banner Restore Control')}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium whitespace-nowrap cursor-pointer"
            >
              Restore Internet (Tier 2)
            </button>
          </div>
        )}

        {/* Viewport Workspace */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>

      {/* Coordinator Authentication Sign-In Modal (shown only when session is explicitly locked) */}
      {!coordinator.authenticated && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0F1623] border border-[#243652] rounded-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-[#182336]">
              <DhwaniLogo size={34} />
              <div>
                <h2 className="text-base font-semibold text-[#E6EDF7]">
                  DHWANI Control Room Sign-In
                </h2>
                <p className="text-xs text-[#8B9BB4]">
                  Simulated Coordinator Authentication &amp; Role Assignment
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8B9BB4] mb-1">Coordinator Full Name</label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8B9BB4] mb-1">Control Room Station</label>
                  <input
                    type="text"
                    value={authStation}
                    onChange={(e) => setAuthStation(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
                  />
                </div>
                <div>
                  <label className="block text-[#8B9BB4] mb-1">Operator Badge ID</label>
                  <input
                    type="text"
                    value={authBadge}
                    onChange={(e) => setAuthBadge(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[#8B9BB4] mb-1">Assigned Operational Role (RBAC)</label>
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value as CoordinatorRole)}
                  className="w-full px-3 py-2 bg-[#090E17] border border-[#1E2B40] rounded-md text-[#E6EDF7]"
                >
                  {SIGNIN_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={!authName.trim() || !authStation.trim()}
              onClick={() =>
                setCoordinatorProfile({
                  name: authName.trim(),
                  station: authStation.trim(),
                  role: authRole,
                  authenticated: true,
                })
              }
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
            >
              <ShieldCheck className="w-4 h-4" />
              Authenticate Control Room Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <DhwaniProvider>
      <DhwaniShell />
    </DhwaniProvider>
  );
}
