import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Database,
  GitBranch,
  Menu,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { DsaInspectorView } from './components/DsaInspectorView.tsx';
import { ResourcesView } from './components/ResourcesView.tsx';
import { TimetableView } from './components/TimetableView.tsx';
import type { BootstrapPayload, SchedulingAlgorithm } from './types.ts';

type WorkspaceSection = 'timetable' | 'resources' | 'dsa';

export default function App() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('timetable');
  const [algorithm, setAlgorithm] = useState<SchedulingAlgorithm>('backtracking');
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load timetable workspace');
      const json = (await res.json()) as BootstrapPayload;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach scheduling server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const handlePayloadUpdate = (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'batches' in payload) {
      setData(payload as BootstrapPayload);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ algorithm }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Schedule generation failed.');
        return;
      }
      handlePayloadUpdate(json);
      setActiveSection('timetable');
    } catch {
      setError('Failed to connect to scheduling engine.');
    } finally {
      setGenerating(false);
    }
  };

  const handleResetPreset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/seed/reset', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        handlePayloadUpdate(json);
      }
    } finally {
      setResetting(false);
    }
  };

  const sectionLabel =
    activeSection === 'timetable'
      ? 'Timetable Matrix'
      : activeSection === 'resources'
        ? 'Resources & Constraints'
        : 'DSA & Conflict Graph';

  const navItems: Array<{ id: WorkspaceSection; label: string; icon: typeof CalendarDays }> = [
    { id: 'timetable', label: 'Timetable Matrix', icon: CalendarDays },
    { id: 'resources', label: 'Resources & Constraints', icon: Database },
    { id: 'dsa', label: 'DSA & Conflict Graph', icon: GitBranch },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white lg:flex">
        <div>
          <div className="flex h-16 items-center border-b border-slate-200 px-6">
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Chronos Academic
            </span>
          </div>

          <nav className="space-y-1 p-4" aria-label="Primary Workspace">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {data && (
            <div className="mx-4 mt-4 border-t border-slate-200 pt-4">
              <div className="px-2 text-xs font-semibold text-slate-500">Sunstone Campus Pool</div>
              <dl className="mt-2.5 space-y-2 px-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Student Batches</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-800">
                    {data.batches.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Faculty Members</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-800">
                    {data.faculty.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Subjects</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-800">
                    {data.subjects.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Rooms & Labs</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-800">
                    {data.classrooms.length}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={handleResetPreset}
            disabled={resetting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetting ? 'Restoring Preset...' : 'Reset Sunstone Data'}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex w-64 flex-col justify-between bg-white shadow-xl">
            <div>
              <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
                <span className="font-display text-base font-bold text-slate-900">
                  Chronos Academic
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1 p-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => {
                  handleResetPreset();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Sunstone Data
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 truncate text-sm">
              <span className="hidden text-slate-400 sm:inline">Sunstone Campus</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <h1 className="truncate font-semibold text-slate-900">{sectionLabel}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Scheduling...' : 'Generate Timetable'}
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-8">
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-medium text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={loadBootstrap}
                className="rounded border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          )}

          {loading || !data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
                  />
                ))}
              </div>
              <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : (
            <>
              {activeSection === 'timetable' && (
                <TimetableView
                  batches={data.batches}
                  faculty={data.faculty}
                  subjects={data.subjects}
                  classrooms={data.classrooms}
                  timeSlots={data.timeSlots}
                  entries={data.entries}
                  conflicts={data.conflicts}
                  latestRun={data.latestRun}
                  algorithm={algorithm}
                  onAlgorithmChange={setAlgorithm}
                  onRefreshPayload={handlePayloadUpdate}
                />
              )}

              {activeSection === 'resources' && (
                <ResourcesView
                  faculty={data.faculty}
                  subjects={data.subjects}
                  batches={data.batches}
                  classrooms={data.classrooms}
                  timeSlots={data.timeSlots}
                  onRefreshPayload={handlePayloadUpdate}
                />
              )}

              {activeSection === 'dsa' && (
                <DsaInspectorView
                  graphSnapshot={data.graphSnapshot}
                  latestRun={data.latestRun}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
