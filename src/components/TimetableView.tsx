import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Plus, Printer } from 'lucide-react';
import type {
  Batch,
  Classroom,
  ConflictDetail,
  DayOfWeek,
  Faculty,
  GenerationRun,
  SchedulingAlgorithm,
  Subject,
  TimeSlot,
  TimetableEntry,
} from '../types.ts';
import { SlotModal } from './SlotModal.tsx';

interface TimetableViewProps {
  batches: Batch[];
  faculty: Faculty[];
  subjects: Subject[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  entries: TimetableEntry[];
  conflicts: ConflictDetail[];
  latestRun: GenerationRun | null;
  algorithm: SchedulingAlgorithm;
  onAlgorithmChange: (alg: SchedulingAlgorithm) => void;
  onRefreshPayload: (payload: unknown) => void;
}

type ViewDimension = 'batch' | 'faculty' | 'classroom';

const DAY_ORDER: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TimetableView({
  batches,
  faculty,
  subjects,
  classrooms,
  timeSlots,
  entries,
  conflicts,
  latestRun,
  algorithm,
  onAlgorithmChange,
  onRefreshPayload,
}: TimetableViewProps) {
  const [dimension, setDimension] = useState<ViewDimension>('batch');
  const [selectedId, setSelectedId] = useState<number>(batches[0]?.id ?? 0);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'edit' | 'create';
    entry: TimetableEntry | null;
    slotId: number | null;
  }>({ open: false, mode: 'edit', entry: null, slotId: null });

  const activeEntityList = useMemo(() => {
    if (dimension === 'batch') return batches;
    if (dimension === 'faculty') return faculty;
    return classrooms;
  }, [dimension, batches, faculty, classrooms]);

  const effectiveSelectedId = useMemo(() => {
    if (activeEntityList.some((item) => item.id === selectedId)) return selectedId;
    return activeEntityList[0]?.id ?? 0;
  }, [activeEntityList, selectedId]);

  const selectedEntity = activeEntityList.find((e) => e.id === effectiveSelectedId);

  const days = useMemo(() => {
    const present = new Set(timeSlots.map((t) => t.day));
    return DAY_ORDER.filter((d) => present.has(d));
  }, [timeSlots]);

  const periodRows = useMemo(() => {
    const map = new Map<number, { period_index: number; label: string; is_break: boolean }>();
    for (const ts of timeSlots) {
      if (!map.has(ts.period_index)) {
        map.set(ts.period_index, {
          period_index: ts.period_index,
          label: ts.label,
          is_break: ts.is_break,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.period_index - b.period_index);
  }, [timeSlots]);

  const slotByDayAndPeriod = useMemo(() => {
    const map = new Map<string, TimeSlot>();
    for (const ts of timeSlots) {
      map.set(`${ts.day}-${ts.period_index}`, ts);
    }
    return map;
  }, [timeSlots]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (dimension === 'batch') return entry.batch_id === effectiveSelectedId;
      if (dimension === 'faculty') return entry.faculty_id === effectiveSelectedId;
      return entry.classroom_id === effectiveSelectedId;
    });
  }, [entries, dimension, effectiveSelectedId]);

  const entriesBySlotId = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    for (const e of filteredEntries) {
      if (!map.has(e.time_slot_id)) map.set(e.time_slot_id, []);
      map.get(e.time_slot_id)!.push(e);
    }
    return map;
  }, [filteredEntries]);

  const conflictEntryIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of conflicts) {
      for (const eid of c.entry_ids) set.add(eid);
    }
    return set;
  }, [conflicts]);

  const handleExportCsv = () => {
    const header = ['Day', 'Time', 'Batch', 'Subject Code', 'Subject Name', 'Type', 'Faculty', 'Classroom'];
    const rows = filteredEntries
      .slice()
      .sort((a, b) => {
        const dayDiff = DAY_ORDER.indexOf(a.day ?? 'Monday') - DAY_ORDER.indexOf(b.day ?? 'Monday');
        if (dayDiff !== 0) return dayDiff;
        return (a.period_index ?? 0) - (b.period_index ?? 0);
      })
      .map((e) => [
        e.day ?? '',
        e.slot_label ?? '',
        e.batch_name ?? '',
        e.subject_code ?? '',
        e.subject_name ?? '',
        e.subject_type ?? '',
        e.faculty_name ?? '',
        e.classroom_name ?? '',
      ]);

    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = (selectedEntity?.name ?? 'timetable').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `timetable-${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Scheduled Classes</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {entries.length}
            {latestRun ? (
              <span className="text-sm font-normal text-slate-400"> / {latestRun.total_sessions}</span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {batches.length} batches · {classrooms.length} rooms
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Conflict Status</div>
          <div className="mt-1 flex items-center gap-2">
            {conflicts.length === 0 ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-700">0</span>
                <span className="text-xs font-medium text-emerald-700">Conflict-Free</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="font-mono text-2xl font-semibold tabular-nums text-red-700">
                  {conflicts.length}
                </span>
                <span className="text-xs font-medium text-red-700">Active Alerts</span>
              </>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">Faculty, room & batch verified</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Solver Execution</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {latestRun ? `${latestRun.execution_ms} ms` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {latestRun
              ? `${latestRun.algorithm === 'backtracking' ? 'Backtracking CSP' : 'Greedy'} · ${latestRun.backtracks} backtracks`
              : 'Run generator to compute'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-medium text-slate-500">Conflict Graph</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {latestRun ? `${latestRun.vertices}V / ${latestRun.edges}E` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">Vertices & mutual-exclusion edges</div>
        </div>
      </div>

      {/* Workspace Filter & Export Toolbar */}
      <div className="no-print flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(['batch', 'faculty', 'classroom'] as const).map((dim) => (
              <button
                key={dim}
                type="button"
                onClick={() => setDimension(dim)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  dimension === dim
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dim === 'batch' ? 'By Batch' : dim === 'faculty' ? 'By Faculty' : 'By Classroom'}
              </button>
            ))}
          </div>

          <select
            aria-label="Select schedule entity"
            value={effectiveSelectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
          >
            {activeEntityList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Solver:</span>
            <select
              aria-label="Scheduling algorithm"
              value={algorithm}
              onChange={(e) => onAlgorithmChange(e.target.value as SchedulingAlgorithm)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 focus:border-indigo-600 focus:outline-none"
            >
              <option value="backtracking">MRV Min-Heap + Backtracking</option>
              <option value="greedy">Greedy Graph Coloring</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              setModalState({ open: true, mode: 'create', entry: null, slotId: null })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Slot
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Timetable
          </button>
        </div>
      </div>

      {/* Active Conflict List */}
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span>Detected Scheduling Conflicts ({conflicts.length})</span>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <div className="text-slate-800">
                  <span className="font-semibold text-red-700">{conflict.category}:</span>{' '}
                  {conflict.message}
                </div>
                <span className="font-mono text-slate-500">
                  {conflict.severity === 'hard' ? 'Hard Constraint' : 'Soft Warning'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Timetable Grid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {selectedEntity ? selectedEntity.name : 'Weekly Timetable'}
            </h2>
            <p className="text-xs text-slate-500">
              Click any scheduled class or empty cell to edit or verify constraints.
            </p>
          </div>
          <div className="font-mono text-xs tabular-nums text-slate-500">
            {filteredEntries.length} sessions scheduled
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="w-36 px-4 py-3 text-xs font-semibold text-slate-600">Time Slot</th>
                {days.map((day) => (
                  <th
                    key={day}
                    className="border-l border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {periodRows.map((period) => {
                if (period.is_break) {
                  return (
                    <tr key={period.period_index} className="bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-500">
                        {period.label}
                      </td>
                      <td
                        colSpan={days.length}
                        className="border-l border-slate-200 px-4 py-2.5 text-center text-xs font-medium text-slate-500"
                      >
                        Midday Lunch & Campus Break (12:00 – 13:00)
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={period.period_index} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                      <div className="font-medium text-slate-900">Period {period.period_index}</div>
                      <div className="mt-0.5 text-slate-500">{period.label}</div>
                    </td>
                    {days.map((day) => {
                      const slot = slotByDayAndPeriod.get(`${day}-${period.period_index}`);
                      const cellEntries = slot ? entriesBySlotId.get(slot.id) ?? [] : [];

                      if (!slot) {
                        return (
                          <td
                            key={day}
                            className="border-l border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-400"
                          >
                            Unavailable
                          </td>
                        );
                      }

                      if (cellEntries.length === 0) {
                        return (
                          <td key={day} className="border-l border-slate-200 p-2">
                            <button
                              type="button"
                              onClick={() =>
                                setModalState({
                                  open: true,
                                  mode: 'create',
                                  entry: null,
                                  slotId: slot.id,
                                })
                              }
                              className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700"
                            >
                              Free Slot
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td key={day} className="border-l border-slate-200 p-2">
                          <div className="space-y-2">
                            {cellEntries.map((item) => {
                              const hasConflict = conflictEntryIds.has(item.id);
                              const isLab = item.subject_type === 'Lab';

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setModalState({
                                      open: true,
                                      mode: 'edit',
                                      entry: item,
                                      slotId: slot.id,
                                    })
                                  }
                                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                                    hasConflict
                                      ? 'border-red-400 bg-red-50 hover:bg-red-100/70'
                                      : isLab
                                        ? 'border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50'
                                        : 'border-slate-200 bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-mono font-semibold text-slate-900">
                                      {item.subject_code}
                                    </span>
                                    <span className="font-mono text-slate-500">
                                      {item.classroom_name}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate text-xs font-medium text-slate-800">
                                    {item.subject_name}
                                  </div>
                                  <div className="mt-1 truncate text-[11px] text-slate-500">
                                    {dimension === 'batch'
                                      ? item.faculty_name
                                      : dimension === 'faculty'
                                        ? item.batch_name
                                        : `${item.batch_name} · ${item.faculty_name}`}
                                  </div>
                                  {hasConflict && (
                                    <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                      <AlertTriangle className="h-3 w-3" />
                                      Conflict
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalState.open && (
        <SlotModal
          mode={modalState.mode}
          entry={modalState.entry}
          initialSlotId={modalState.slotId}
          defaultBatchId={dimension === 'batch' ? effectiveSelectedId : batches[0]?.id ?? null}
          batches={batches}
          subjects={subjects}
          classrooms={classrooms}
          timeSlots={timeSlots}
          onClose={() => setModalState((prev) => ({ ...prev, open: false }))}
          onUpdated={onRefreshPayload}
        />
      )}
    </div>
  );
}
