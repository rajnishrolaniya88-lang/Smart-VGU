import { useMemo, useState } from 'react';
import { CalendarOff, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  Batch,
  Classroom,
  ClassroomType,
  DayOfWeek,
  Faculty,
  Subject,
  SubjectType,
  TimeSlot,
} from '../types.ts';

interface ResourcesViewProps {
  faculty: Faculty[];
  subjects: Subject[];
  batches: Batch[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  onRefreshPayload: (payload: unknown) => void;
}

type ResourceTab = 'faculty' | 'subjects' | 'batches' | 'classrooms' | 'timeslots';

export function ResourcesView({
  faculty,
  subjects,
  batches,
  classrooms,
  timeSlots,
  onRefreshPayload,
}: ResourcesViewProps) {
  const [activeTab, setActiveTab] = useState<ResourceTab>('faculty');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Availability Modal State
  const [availabilityFaculty, setAvailabilityFaculty] = useState<Faculty | null>(null);
  const [pendingUnavailable, setPendingUnavailable] = useState<number[]>([]);

  // Batch Subject Editor Modal
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [pendingBatchSubjects, setPendingBatchSubjects] = useState<number[]>([]);

  // Form States
  const [facName, setFacName] = useState('');
  const [facDept, setFacDept] = useState('Computer Science');
  const [facEmail, setFacEmail] = useState('');
  const [facMaxHours, setFacMaxHours] = useState(4);

  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCredits, setSubCredits] = useState(3);
  const [subHours, setSubHours] = useState(3);
  const [subType, setSubType] = useState<SubjectType>('Theory');
  const [subFacultyId, setSubFacultyId] = useState<number>(faculty[0]?.id ?? 0);

  const [batchName, setBatchName] = useState('');
  const [batchProgram, setBatchProgram] = useState('B.Tech CSE');
  const [batchSemester, setBatchSemester] = useState(3);
  const [batchStrength, setBatchStrength] = useState(60);
  const [batchSubjectIds, setBatchSubjectIds] = useState<number[]>([]);

  const [roomName, setRoomName] = useState('');
  const [roomBuilding, setRoomBuilding] = useState('Sunstone Block A');
  const [roomCapacity, setRoomCapacity] = useState(65);
  const [roomType, setRoomType] = useState<ClassroomType>('Lecture');

  const [slotDay, setSlotDay] = useState<DayOfWeek>('Saturday');
  const [slotPeriod, setSlotPeriod] = useState(1);
  const [slotStart, setSlotStart] = useState('09:00');
  const [slotEnd, setSlotEnd] = useState('10:00');

  const q = searchQuery.trim().toLowerCase();

  const filteredFaculty = useMemo(
    () =>
      faculty.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.department.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q)
      ),
    [faculty, q]
  );

  const filteredSubjects = useMemo(
    () =>
      subjects.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.faculty_name ?? '').toLowerCase().includes(q)
      ),
    [subjects, q]
  );

  const filteredBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.program.toLowerCase().includes(q)
      ),
    [batches, q]
  );

  const filteredRooms = useMemo(
    () =>
      classrooms.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.building.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q)
      ),
    [classrooms, q]
  );

  const filteredSlots = useMemo(
    () =>
      timeSlots.filter(
        (ts) =>
          ts.day.toLowerCase().includes(q) ||
          ts.label.toLowerCase().includes(q)
      ),
    [timeSlots, q]
  );

  const apiMutate = async (url: string, method: string, body?: unknown) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Action failed.');
        return false;
      }
      onRefreshPayload(data);
      return true;
    } catch {
      setErrorMsg('Network error communicating with backend.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await apiMutate('/api/faculty', 'POST', {
      name: facName,
      department: facDept,
      email: facEmail,
      max_hours_per_day: facMaxHours,
    });
    if (ok) {
      setFacName('');
      setFacEmail('');
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await apiMutate('/api/subjects', 'POST', {
      code: subCode,
      name: subName,
      credits: subCredits,
      hours_per_week: subHours,
      type: subType,
      faculty_id: subFacultyId || faculty[0]?.id,
    });
    if (ok) {
      setSubCode('');
      setSubName('');
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await apiMutate('/api/batches', 'POST', {
      name: batchName,
      program: batchProgram,
      semester: batchSemester,
      strength: batchStrength,
      subject_ids: batchSubjectIds,
    });
    if (ok) {
      setBatchName('');
      setBatchSubjectIds([]);
    }
  };

  const handleAddClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await apiMutate('/api/classrooms', 'POST', {
      name: roomName,
      building: roomBuilding,
      capacity: roomCapacity,
      type: roomType,
    });
    if (ok) {
      setRoomName('');
    }
  };

  const handleAddTimeSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiMutate('/api/timeslots', 'POST', {
      day: slotDay,
      period_index: slotPeriod,
      start_time: slotStart,
      end_time: slotEnd,
      is_break: false,
    });
  };

  const openAvailabilityModal = (fac: Faculty) => {
    setAvailabilityFaculty(fac);
    setPendingUnavailable(fac.unavailable_slots);
  };

  const saveAvailability = async () => {
    if (!availabilityFaculty) return;
    const ok = await apiMutate(`/api/faculty/${availabilityFaculty.id}/availability`, 'PUT', {
      unavailable_slots: pendingUnavailable,
    });
    if (ok) setAvailabilityFaculty(null);
  };

  const openBatchSubjectsModal = (batch: Batch) => {
    setEditingBatch(batch);
    setPendingBatchSubjects(batch.subject_ids);
  };

  const saveBatchSubjects = async () => {
    if (!editingBatch) return;
    const ok = await apiMutate(`/api/batches/${editingBatch.id}/subjects`, 'PUT', {
      subject_ids: pendingBatchSubjects,
    });
    if (ok) setEditingBatch(null);
  };

  const activeTeachingSlots = timeSlots.filter((ts) => !ts.is_break);

  return (
    <div className="space-y-6">
      {/* Navigation & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'faculty', label: `Faculty (${faculty.length})` },
              { id: 'subjects', label: `Subjects (${subjects.length})` },
              { id: 'batches', label: `Batches (${batches.length})` },
              { id: 'classrooms', label: `Classrooms (${classrooms.length})` },
              { id: 'timeslots', label: `Time Slots (${activeTeachingSlots.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setErrorMsg(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter records..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Faculty Tab */}
      {activeTab === 'faculty' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddFaculty}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <label className="block text-xs font-medium text-slate-700">
              Faculty Name
              <input
                required
                value={facName}
                onChange={(e) => setFacName(e.target.value)}
                placeholder="Dr. Aarav Mehta"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Department
              <input
                required
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                value={facEmail}
                onChange={(e) => setFacEmail(e.target.value)}
                placeholder="aarav@sunstone.edu.in"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Max Hours / Day
              <input
                required
                type="number"
                min={1}
                max={8}
                value={facMaxHours}
                onChange={(e) => setFacMaxHours(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Faculty
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Max/Day</th>
                    <th className="px-4 py-3 text-right">Blocked Slots</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredFaculty.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-xs text-slate-500">
                        No faculty records match your filter. Add a faculty member above to begin.
                      </td>
                    </tr>
                  ) : (
                    filteredFaculty.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3 font-medium text-slate-900">{f.name}</td>
                        <td className="px-4 py-3 text-slate-600">{f.department}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.email}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                          {f.max_hours_per_day}h
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                          {f.unavailable_slots.length}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openAvailabilityModal(f)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                            >
                              <CalendarOff className="h-3.5 w-3.5" />
                              Availability
                            </button>
                            <button
                              type="button"
                              onClick={() => apiMutate(`/api/faculty/${f.id}`, 'DELETE')}
                              aria-label={`Delete ${f.name}`}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subjects Tab */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddSubject}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
          >
            <label className="block text-xs font-medium text-slate-700">
              Course Code
              <input
                required
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="CS401"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 lg:col-span-2">
              Subject Title
              <input
                required
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Design & Analysis of Algorithms"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Type & Hours/Wk
              <div className="mt-1.5 flex gap-2">
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value as SubjectType)}
                  className="w-1/2 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-indigo-600 focus:outline-none"
                >
                  <option value="Theory">Theory</option>
                  <option value="Lab">Lab</option>
                </select>
                <input
                  required
                  type="number"
                  min={1}
                  max={8}
                  value={subHours}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSubHours(v);
                    setSubCredits(v);
                  }}
                  className="w-1/2 rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Assigned Faculty
              <select
                value={subFacultyId || faculty[0]?.id || ''}
                onChange={(e) => setSubFacultyId(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              >
                {faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={submitting || faculty.length === 0}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Subject
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3">Code</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Faculty</th>
                    <th className="px-4 py-3 text-right">Weekly Hrs</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredSubjects.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">{s.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{s.type}</td>
                      <td className="px-4 py-3 text-slate-600">{s.faculty_name}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {s.hours_per_week}h
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => apiMutate(`/api/subjects/${s.id}`, 'DELETE')}
                          aria-label={`Delete ${s.code}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Batches Tab */}
      {activeTab === 'batches' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddBatch}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <label className="block text-xs font-medium text-slate-700">
                Batch Name
                <input
                  required
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="B.Tech CSE Sem 5 - B2"
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Program
                <input
                  required
                  value={batchProgram}
                  onChange={(e) => setBatchProgram(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Semester
                <input
                  required
                  type="number"
                  min={1}
                  max={8}
                  value={batchSemester}
                  onChange={(e) => setBatchSemester(Number(e.target.value))}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Student Strength
                <input
                  required
                  type="number"
                  min={5}
                  max={250}
                  value={batchStrength}
                  onChange={(e) => setBatchStrength(Number(e.target.value))}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Batch
              </button>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700">Assign Curriculum Subjects</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {subjects.map((sub) => {
                  const checked = batchSubjectIds.includes(sub.id);
                  return (
                    <label
                      key={sub.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        checked
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBatchSubjectIds((prev) =>
                            checked ? prev.filter((id) => id !== sub.id) : [...prev, sub.id]
                          )
                        }
                        className="accent-indigo-600"
                      />
                      <span className="font-mono font-semibold">{sub.code}</span>
                      <span>{sub.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-4 py-3">Program</th>
                    <th className="px-4 py-3 text-right">Semester</th>
                    <th className="px-4 py-3 text-right">Strength</th>
                    <th className="px-4 py-3 text-right">Subjects</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium text-slate-900">{b.name}</td>
                      <td className="px-4 py-3 text-slate-600">{b.program}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        Sem {b.semester}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {b.strength}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {b.subject_ids.length}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openBatchSubjectsModal(b)}
                            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                          >
                            Edit Subjects
                          </button>
                          <button
                            type="button"
                            onClick={() => apiMutate(`/api/batches/${b.id}`, 'DELETE')}
                            aria-label={`Delete ${b.name}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Classrooms Tab */}
      {activeTab === 'classrooms' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddClassroom}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <label className="block text-xs font-medium text-slate-700">
              Room Code
              <input
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="LH-405"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Building
              <input
                required
                value={roomBuilding}
                onChange={(e) => setRoomBuilding(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Capacity
              <input
                required
                type="number"
                min={10}
                max={400}
                value={roomCapacity}
                onChange={(e) => setRoomCapacity(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Room Type
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as ClassroomType)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              >
                <option value="Lecture">Lecture Hall</option>
                <option value="Lab">Computer Lab</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Classroom
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3">Room Code</th>
                    <th className="px-4 py-3">Building</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Capacity</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredRooms.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.building}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.type}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {r.capacity} seats
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => apiMutate(`/api/classrooms/${r.id}`, 'DELETE')}
                          aria-label={`Delete ${r.name}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Time Slots Tab */}
      {activeTab === 'timeslots' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddTimeSlot}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <label className="block text-xs font-medium text-slate-700">
              Day
              <select
                value={slotDay}
                onChange={(e) => setSlotDay(e.target.value as DayOfWeek)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
              >
                {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Period #
              <input
                required
                type="number"
                min={1}
                max={10}
                value={slotPeriod}
                onChange={(e) => setSlotPeriod(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Start Time
              <input
                required
                type="time"
                value={slotStart}
                onChange={(e) => setSlotStart(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              End Time
              <input
                required
                type="time"
                value={slotEnd}
                onChange={(e) => setSlotEnd(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-600 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Time Slot
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3">Day</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Window</th>
                    <th className="px-4 py-3">Kind</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredSlots.map((ts) => (
                    <tr key={ts.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium text-slate-900">{ts.day}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                        P{ts.period_index}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                        {ts.label}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {ts.is_break ? 'Break' : 'Teaching Slot'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => apiMutate(`/api/timeslots/${ts.id}`, 'DELETE')}
                          aria-label={`Delete ${ts.day} ${ts.label}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Availability Modal */}
      {availabilityFaculty && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Unavailable Slots · {availabilityFaculty.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Click any period to mark this faculty member unavailable during auto-scheduling.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAvailabilityFaculty(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {activeTeachingSlots.map((ts) => {
                  const blocked = pendingUnavailable.includes(ts.id);
                  return (
                    <button
                      key={ts.id}
                      type="button"
                      onClick={() =>
                        setPendingUnavailable((prev) =>
                          blocked ? prev.filter((id) => id !== ts.id) : [...prev, ts.id]
                        )
                      }
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        blocked
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">{ts.day}</div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums">{ts.label}</div>
                      <div className="mt-1 text-[11px] font-medium">
                        {blocked ? 'Blocked' : 'Available'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setAvailabilityFaculty(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAvailability}
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Save Availability
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Batch Subjects Modal */}
      {editingBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Curriculum Subjects · {editingBatch.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Select subjects assigned to this batch for timetable generation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-6">
              {subjects.map((sub) => {
                const checked = pendingBatchSubjects.includes(sub.id);
                return (
                  <label
                    key={sub.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-xs ${
                      checked ? 'border-indigo-600 bg-indigo-50/70' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setPendingBatchSubjects((prev) =>
                            checked ? prev.filter((id) => id !== sub.id) : [...prev, sub.id]
                          )
                        }
                        className="accent-indigo-600"
                      />
                      <div>
                        <span className="font-mono font-semibold text-slate-900">{sub.code}</span> ·{' '}
                        <span className="font-medium text-slate-800">{sub.name}</span>
                        <div className="text-[11px] text-slate-500">{sub.faculty_name}</div>
                      </div>
                    </div>
                    <span className="font-mono text-slate-600">
                      {sub.hours_per_week}h · {sub.type}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBatchSubjects}
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Save Curriculum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
