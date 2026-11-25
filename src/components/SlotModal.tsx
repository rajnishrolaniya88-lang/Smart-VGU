import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, X } from 'lucide-react';
import type {
  Batch,
  Classroom,
  ConflictDetail,
  Subject,
  TimeSlot,
  TimetableEntry,
} from '../types.ts';

interface SlotModalProps {
  mode: 'edit' | 'create';
  entry: TimetableEntry | null;
  initialSlotId: number | null;
  defaultBatchId: number | null;
  batches: Batch[];
  subjects: Subject[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  onClose: () => void;
  onUpdated: (payload: unknown) => void;
}

export function SlotModal({
  mode,
  entry,
  initialSlotId,
  defaultBatchId,
  batches,
  subjects,
  classrooms,
  timeSlots,
  onClose,
  onUpdated,
}: SlotModalProps) {
  const activeSlots = timeSlots.filter((ts) => !ts.is_break);

  const [batchId, setBatchId] = useState<number>(
    entry?.batch_id ?? defaultBatchId ?? batches[0]?.id ?? 0
  );
  const [subjectId, setSubjectId] = useState<number>(
    entry?.subject_id ?? subjects[0]?.id ?? 0
  );
  const [classroomId, setClassroomId] = useState<number>(
    entry?.classroom_id ?? classrooms[0]?.id ?? 0
  );
  const [timeSlotId, setTimeSlotId] = useState<number>(
    entry?.time_slot_id ?? initialSlotId ?? activeSlots[0]?.id ?? 0
  );

  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const facultyId = entry?.faculty_id ?? selectedSubject?.faculty_id ?? 0;

  useEffect(() => {
    if (!batchId || !subjectId || !facultyId || !classroomId || !timeSlotId) return;

    let cancelled = false;
    setChecking(true);
    fetch('/api/timetable/check-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: mode === 'edit' ? entry?.id : undefined,
        batch_id: batchId,
        subject_id: subjectId,
        faculty_id: facultyId,
        classroom_id: classroomId,
        time_slot_id: timeSlotId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
        }
      })
      .catch(() => {
        if (!cancelled) setConflicts([]);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, entry?.id, batchId, subjectId, facultyId, classroomId, timeSlotId]);

  const hardConflicts = conflicts.filter((c) => c.severity === 'hard');

  const handleSave = async (force = false) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const url =
        mode === 'edit' && entry
          ? `/api/timetable/entries/${entry.id}`
          : '/api/timetable/entries';
      const method = mode === 'edit' ? 'PATCH' : 'POST';

      const body =
        mode === 'edit'
          ? { classroom_id: classroomId, time_slot_id: timeSlotId, force }
          : {
              batch_id: batchId,
              subject_id: subjectId,
              classroom_id: classroomId,
              time_slot_id: timeSlotId,
              force,
            };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not update timetable entry.');
        return;
      }
      onUpdated(data);
      onClose();
    } catch {
      setErrorMsg('Network error while saving timetable slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/timetable/entries/${entry.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onUpdated(data);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="slot-modal-title" className="text-base font-semibold text-slate-900">
              {mode === 'edit' ? 'Modify Scheduled Class' : 'Assign Class Manually'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Live constraint verification checks batch, faculty, and classroom availability.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-600"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {mode === 'edit' && entry ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="font-semibold text-slate-900">
                <span className="font-mono">{entry.subject_code}</span> · {entry.subject_name}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {entry.batch_name} · {entry.faculty_name}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-700">
                Student Batch
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(Number(e.target.value))}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.strength})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700">
                Subject & Faculty
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(Number(e.target.value))}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-700">
              Time Slot
              <select
                value={timeSlotId}
                onChange={(e) => setTimeSlotId(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {activeSlots.map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.day} · {ts.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-700">
              Classroom / Lab
              <select
                value={classroomId}
                onChange={(e) => setClassroomId(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type} · Cap {c.capacity})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Constraint Check</span>
              {checking ? (
                <span className="text-slate-500">Checking...</span>
              ) : conflicts.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Conflict-Free
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Found
                </span>
              )}
            </div>

            {conflicts.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5 text-xs text-red-700">
                {conflicts.map((c) => (
                  <li key={c.id} className="rounded bg-red-50 px-2.5 py-1.5">
                    <span className="font-semibold">{c.category}:</span> {c.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                No faculty, batch, room, or capacity violations detected for this selection.
              </p>
            )}
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          {mode === 'edit' && entry ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Class
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>

            {hardConflicts.length > 0 ? (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {saving ? 'Saving...' : 'Force Assign Anyway'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
