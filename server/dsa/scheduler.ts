import type {
  Batch,
  Classroom,
  ConflictDetail,
  ConflictGraphSnapshot,
  Faculty,
  SchedulingAlgorithm,
  Subject,
  TimeSlot,
  TimetableEntry,
} from '../../src/types.ts';
import { ConflictGraph, type SessionVertex } from './conflictGraph.ts';
import { MinHeap } from './minHeap.ts';

export interface SchedulerInput {
  faculty: Faculty[];
  subjects: Subject[];
  batches: Batch[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
}

export interface GeneratedAssignment {
  batch_id: number;
  subject_id: number;
  faculty_id: number;
  classroom_id: number;
  time_slot_id: number;
}

export interface SchedulerResult {
  algorithm: SchedulingAlgorithm;
  assignments: GeneratedAssignment[];
  vertices: number;
  edges: number;
  backtracks: number;
  execution_ms: number;
  placed_sessions: number;
  total_sessions: number;
  conflicts_detected: number;
  status: 'Optimal' | 'Partial' | 'Failed';
  graphSnapshot: ConflictGraphSnapshot;
}

interface CandidateMove {
  timeSlot: TimeSlot;
  classroom: Classroom;
}

/**
 * Expands (Batch x Assigned Subject x Weekly Hours) into discrete SessionVertices
 * and builds the explicit Conflict Graph.
 */
export function buildSessionConflictGraph(input: SchedulerInput): {
  graph: ConflictGraph;
  sessions: SessionVertex[];
} {
  const subjectMap = new Map<number, Subject>(input.subjects.map((s) => [s.id, s]));
  const facultyMap = new Map<number, Faculty>(input.faculty.map((f) => [f.id, f]));
  const graph = new ConflictGraph();
  const sessions: SessionVertex[] = [];

  for (const batch of input.batches) {
    for (const subjectId of batch.subject_ids) {
      const subject = subjectMap.get(subjectId);
      if (!subject) continue;
      const faculty = facultyMap.get(subject.faculty_id);
      if (!faculty) continue;

      for (let idx = 1; idx <= subject.hours_per_week; idx++) {
        const vertex: SessionVertex = {
          id: `b${batch.id}-s${subject.id}-k${idx}`,
          batchId: batch.id,
          batchName: batch.name,
          batchStrength: batch.strength,
          subjectId: subject.id,
          subjectCode: subject.code,
          subjectName: subject.name,
          subjectType: subject.type,
          facultyId: faculty.id,
          facultyName: faculty.name,
          sessionIndex: idx,
        };
        sessions.push(vertex);
        graph.addVertex(vertex);
      }
    }
  }

  graph.buildConflictEdges();
  return { graph, sessions };
}

/**
 * Constraint Satisfaction & Recursive Backtracking Timetable Solver.
 *
 * Uses:
 * 1. ConflictGraph (Adjacency List) to model batch/faculty mutual exclusions
 * 2. MinHeap Priority Queue for MRV (Minimum Remaining Values) + Degree Heuristic ordering
 * 3. Recursive Backtracking with forward constraint validation & least-loaded day balancing
 *
 * Time Complexity:
 * - Worst case O((T * R)^V) pruned aggressively via MRV, degree ordering & bit/set lookups
 * - Typical college instance solves in < 15ms
 * Space Complexity: O(V + E + T * R) for recursion stack and occupancy hash sets
 */
export function generateSchedule(
  input: SchedulerInput,
  algorithm: SchedulingAlgorithm = 'backtracking'
): SchedulerResult {
  const startTime = performance.now();
  const { graph, sessions } = buildSessionConflictGraph(input);
  const vertices = graph.getVertexCount();
  const edges = graph.getEdgeCount();
  const graphSnapshot = graph.toSnapshot();

  const activeSlots = input.timeSlots.filter((ts) => !ts.is_break);
  const facultyMap = new Map<number, Faculty>(input.faculty.map((f) => [f.id, f]));

  if (sessions.length === 0 || activeSlots.length === 0 || input.classrooms.length === 0) {
    return {
      algorithm,
      assignments: [],
      vertices,
      edges,
      backtracks: 0,
      execution_ms: Number((performance.now() - startTime).toFixed(2)),
      placed_sessions: 0,
      total_sessions: sessions.length,
      conflicts_detected: 0,
      status: sessions.length === 0 ? 'Optimal' : 'Failed',
      graphSnapshot,
    };
  }

  // Precompute valid (timeSlot, classroom) domain per session
  const domainMap = new Map<string, CandidateMove[]>();
  for (const session of sessions) {
    const faculty = facultyMap.get(session.facultyId);
    const unavailable = new Set(faculty?.unavailable_slots ?? []);

    // Filter classrooms matching capacity and room type (Lab sessions require Lab rooms)
    const compatibleRooms = input.classrooms
      .filter((room) => {
        const capacityOk = room.capacity >= session.batchStrength;
        const typeOk = session.subjectType === 'Lab' ? room.type === 'Lab' : room.type === 'Lecture';
        return capacityOk && typeOk;
      })
      .sort((a, b) => a.capacity - b.capacity); // Best-fit room capacity

    const moves: CandidateMove[] = [];
    for (const ts of activeSlots) {
      if (unavailable.has(ts.id)) continue;
      for (const room of compatibleRooms) {
        moves.push({ timeSlot: ts, classroom: room });
      }
    }
    domainMap.set(session.id, moves);
  }

  // Order variables using custom MinHeap Priority Queue (MRV + Lab priority + Conflict Degree)
  const priorityQueue = new MinHeap<SessionVertex>((a, b) => {
    const domA = domainMap.get(a.id)?.length ?? 0;
    const domB = domainMap.get(b.id)?.length ?? 0;
    if (domA !== domB) return domA - domB; // Fewer legal candidates first (MRV)

    if (a.subjectType !== b.subjectType) {
      return a.subjectType === 'Lab' ? -1 : 1; // Labs are harder to place
    }

    return graph.getDegree(b.id) - graph.getDegree(a.id); // Higher degree first
  });

  for (const s of sessions) {
    priorityQueue.push(s);
  }

  const orderedSessions: SessionVertex[] = [];
  while (!priorityQueue.isEmpty()) {
    const next = priorityQueue.pop();
    if (next) orderedSessions.push(next);
  }

  // Fast O(1) occupancy sets
  const batchBusy = new Set<string>(); // `${batchId}-${slotId}`
  const facultyBusy = new Set<string>(); // `${facultyId}-${slotId}`
  const roomBusy = new Set<string>(); // `${roomId}-${slotId}`
  const batchDayCount = new Map<string, number>(); // `${batchId}-${day}`
  const batchSubjectDayCount = new Map<string, number>(); // `${batchId}-${subjectId}-${day}`
  const facultyDayCount = new Map<string, number>(); // `${facultyId}-${day}`

  const canPlace = (session: SessionVertex, move: CandidateMove, allowSameSubjectTwicePerDay: boolean): boolean => {
    const slotId = move.timeSlot.id;
    const day = move.timeSlot.day;

    if (batchBusy.has(`${session.batchId}-${slotId}`)) return false;
    if (facultyBusy.has(`${session.facultyId}-${slotId}`)) return false;
    if (roomBusy.has(`${move.classroom.id}-${slotId}`)) return false;

    const faculty = facultyMap.get(session.facultyId);
    const maxPerDay = faculty?.max_hours_per_day ?? 4;
    const currentFacDay = facultyDayCount.get(`${session.facultyId}-${day}`) ?? 0;
    if (currentFacDay >= maxPerDay) return false;

    if (!allowSameSubjectTwicePerDay) {
      const sameSubToday = batchSubjectDayCount.get(`${session.batchId}-${session.subjectId}-${day}`) ?? 0;
      if (sameSubToday >= 1) return false;
    }

    return true;
  };

  const place = (session: SessionVertex, move: CandidateMove): void => {
    const slotId = move.timeSlot.id;
    const day = move.timeSlot.day;
    batchBusy.add(`${session.batchId}-${slotId}`);
    facultyBusy.add(`${session.facultyId}-${slotId}`);
    roomBusy.add(`${move.classroom.id}-${slotId}`);
    batchDayCount.set(`${session.batchId}-${day}`, (batchDayCount.get(`${session.batchId}-${day}`) ?? 0) + 1);
    batchSubjectDayCount.set(
      `${session.batchId}-${session.subjectId}-${day}`,
      (batchSubjectDayCount.get(`${session.batchId}-${session.subjectId}-${day}`) ?? 0) + 1
    );
    facultyDayCount.set(`${session.facultyId}-${day}`, (facultyDayCount.get(`${session.facultyId}-${day}`) ?? 0) + 1);
  };

  const unplace = (session: SessionVertex, move: CandidateMove): void => {
    const slotId = move.timeSlot.id;
    const day = move.timeSlot.day;
    batchBusy.delete(`${session.batchId}-${slotId}`);
    facultyBusy.delete(`${session.facultyId}-${slotId}`);
    roomBusy.delete(`${move.classroom.id}-${slotId}`);
    batchDayCount.set(`${session.batchId}-${day}`, (batchDayCount.get(`${session.batchId}-${day}`) ?? 1) - 1);
    batchSubjectDayCount.set(
      `${session.batchId}-${session.subjectId}-${day}`,
      (batchSubjectDayCount.get(`${session.batchId}-${session.subjectId}-${day}`) ?? 1) - 1
    );
    facultyDayCount.set(`${session.facultyId}-${day}`, (facultyDayCount.get(`${session.facultyId}-${day}`) ?? 1) - 1);
  };

  // Sort candidate moves dynamically to spread batch lectures evenly across Monday-Friday
  const rankMoves = (session: SessionVertex, rawMoves: CandidateMove[]): CandidateMove[] => {
    return [...rawMoves].sort((a, b) => {
      const loadA = batchDayCount.get(`${session.batchId}-${a.timeSlot.day}`) ?? 0;
      const loadB = batchDayCount.get(`${session.batchId}-${b.timeSlot.day}`) ?? 0;
      if (loadA !== loadB) return loadA - loadB;
      if (a.timeSlot.period_index !== b.timeSlot.period_index) {
        return a.timeSlot.period_index - b.timeSlot.period_index;
      }
      return a.classroom.capacity - b.classroom.capacity;
    });
  };

  let backtracks = 0;
  const assignments: GeneratedAssignment[] = [];

  if (algorithm === 'greedy') {
    // Greedy First-Fit Graph Coloring baseline (no backtracking on dead ends)
    for (const session of orderedSessions) {
      const rawMoves = domainMap.get(session.id) ?? [];
      const ranked = rankMoves(session, rawMoves);
      let placedMove: CandidateMove | null = null;

      for (const move of ranked) {
        if (canPlace(session, move, false)) {
          placedMove = move;
          break;
        }
      }
      if (!placedMove) {
        for (const move of ranked) {
          if (canPlace(session, move, true)) {
            placedMove = move;
            break;
          }
        }
      }

      if (placedMove) {
        place(session, placedMove);
        assignments.push({
          batch_id: session.batchId,
          subject_id: session.subjectId,
          faculty_id: session.facultyId,
          classroom_id: placedMove.classroom.id,
          time_slot_id: placedMove.timeSlot.id,
        });
      }
    }
  } else {
    // Recursive Backtracking CSP Solver with safety step limit
    const MAX_BACKTRACKS = 12000;
    const solutionMoves: Array<CandidateMove | null> = new Array(orderedSessions.length).fill(null);

    const backtrack = (index: number, allowSameSubjectTwicePerDay: boolean): boolean => {
      if (index === orderedSessions.length) return true;
      if (backtracks >= MAX_BACKTRACKS) return false;

      const session = orderedSessions[index];
      const rawMoves = domainMap.get(session.id) ?? [];
      const candidates = rankMoves(session, rawMoves);

      for (const move of candidates) {
        if (canPlace(session, move, allowSameSubjectTwicePerDay)) {
          place(session, move);
          solutionMoves[index] = move;

          if (backtrack(index + 1, allowSameSubjectTwicePerDay)) {
            return true;
          }

          unplace(session, move);
          solutionMoves[index] = null;
          backtracks++;
          if (backtracks >= MAX_BACKTRACKS) return false;
        }
      }

      return false;
    };

    let solved = backtrack(0, false);
    if (!solved) {
      // Relax soft preference (allow 2 sessions of same subject on 1 day if needed)
      backtracks = 0;
      batchBusy.clear();
      facultyBusy.clear();
      roomBusy.clear();
      batchDayCount.clear();
      batchSubjectDayCount.clear();
      facultyDayCount.clear();
      solutionMoves.fill(null);
      solved = backtrack(0, true);
    }

    if (solved) {
      for (let i = 0; i < orderedSessions.length; i++) {
        const move = solutionMoves[i];
        const s = orderedSessions[i];
        if (move) {
          assignments.push({
            batch_id: s.batchId,
            subject_id: s.subjectId,
            faculty_id: s.facultyId,
            classroom_id: move.classroom.id,
            time_slot_id: move.timeSlot.id,
          });
        }
      }
    } else {
      // Partial best-effort greedy fallback if constraints are mathematically impossible
      batchBusy.clear();
      facultyBusy.clear();
      roomBusy.clear();
      batchDayCount.clear();
      batchSubjectDayCount.clear();
      facultyDayCount.clear();

      for (const session of orderedSessions) {
        const candidates = rankMoves(session, domainMap.get(session.id) ?? []);
        for (const move of candidates) {
          if (canPlace(session, move, true)) {
            place(session, move);
            assignments.push({
              batch_id: session.batchId,
              subject_id: session.subjectId,
              faculty_id: session.facultyId,
              classroom_id: move.classroom.id,
              time_slot_id: move.timeSlot.id,
            });
            break;
          }
        }
      }
    }
  }

  const execution_ms = Number((performance.now() - startTime).toFixed(2));
  const placed_sessions = assignments.length;
  const total_sessions = orderedSessions.length;
  const status: 'Optimal' | 'Partial' | 'Failed' =
    placed_sessions === total_sessions ? 'Optimal' : placed_sessions > 0 ? 'Partial' : 'Failed';

  return {
    algorithm,
    assignments,
    vertices,
    edges,
    backtracks,
    execution_ms,
    placed_sessions,
    total_sessions,
    conflicts_detected: 0,
    status,
    graphSnapshot,
  };
}

/**
 * Scans all persisted timetable entries in O(N) using Hash Maps to detect
 * any hard or soft constraint violations (e.g., after manual edits).
 */
export function detectScheduleConflicts(
  entries: TimetableEntry[],
  input: SchedulerInput
): ConflictDetail[] {
  const conflicts: ConflictDetail[] = [];
  const facultyMap = new Map(input.faculty.map((f) => [f.id, f]));
  const batchMap = new Map(input.batches.map((b) => [b.id, b]));
  const roomMap = new Map(input.classrooms.map((r) => [r.id, r]));
  const subjectMap = new Map(input.subjects.map((s) => [s.id, s]));
  const slotMap = new Map(input.timeSlots.map((ts) => [ts.id, ts]));

  const byFacultySlot = new Map<string, TimetableEntry[]>();
  const byRoomSlot = new Map<string, TimetableEntry[]>();
  const byBatchSlot = new Map<string, TimetableEntry[]>();
  const byFacultyDay = new Map<string, TimetableEntry[]>();

  for (const entry of entries) {
    const fKey = `${entry.faculty_id}-${entry.time_slot_id}`;
    const rKey = `${entry.classroom_id}-${entry.time_slot_id}`;
    const bKey = `${entry.batch_id}-${entry.time_slot_id}`;

    if (!byFacultySlot.has(fKey)) byFacultySlot.set(fKey, []);
    byFacultySlot.get(fKey)!.push(entry);

    if (!byRoomSlot.has(rKey)) byRoomSlot.set(rKey, []);
    byRoomSlot.get(rKey)!.push(entry);

    if (!byBatchSlot.has(bKey)) byBatchSlot.set(bKey, []);
    byBatchSlot.get(bKey)!.push(entry);

    const slot = slotMap.get(entry.time_slot_id);
    const faculty = facultyMap.get(entry.faculty_id);
    const batch = batchMap.get(entry.batch_id);
    const room = roomMap.get(entry.classroom_id);
    const subject = subjectMap.get(entry.subject_id);

    if (slot) {
      const fdKey = `${entry.faculty_id}-${slot.day}`;
      if (!byFacultyDay.has(fdKey)) byFacultyDay.set(fdKey, []);
      byFacultyDay.get(fdKey)!.push(entry);
    }

    if (faculty && faculty.unavailable_slots.includes(entry.time_slot_id)) {
      conflicts.push({
        id: `unavail-${entry.id}`,
        severity: 'hard',
        category: 'Faculty Unavailable',
        message: `${faculty.name} is marked unavailable during ${slot?.day ?? ''} ${slot?.label ?? ''}.`,
        time_slot_id: entry.time_slot_id,
        entry_ids: [entry.id],
      });
    }

    if (batch && room && batch.strength > room.capacity) {
      conflicts.push({
        id: `cap-${entry.id}`,
        severity: 'hard',
        category: 'Capacity Exceeded',
        message: `${batch.name} (${batch.strength} students) exceeds ${room.name} capacity (${room.capacity}).`,
        time_slot_id: entry.time_slot_id,
        entry_ids: [entry.id],
      });
    }

    if (subject && room && subject.type === 'Lab' && room.type !== 'Lab') {
      conflicts.push({
        id: `type-${entry.id}`,
        severity: 'hard',
        category: 'Room Type Mismatch',
        message: `Lab subject ${subject.code} is assigned to Lecture Hall ${room.name}.`,
        time_slot_id: entry.time_slot_id,
        entry_ids: [entry.id],
      });
    }
  }

  for (const [, group] of byFacultySlot.entries()) {
    if (group.length > 1) {
      const first = group[0];
      const faculty = facultyMap.get(first.faculty_id);
      const slot = slotMap.get(first.time_slot_id);
      conflicts.push({
        id: `fac-${first.faculty_id}-${first.time_slot_id}`,
        severity: 'hard',
        category: 'Faculty Overlap',
        message: `${faculty?.name ?? 'Faculty'} is double-booked at ${slot?.day ?? ''} ${slot?.label ?? ''}.`,
        time_slot_id: first.time_slot_id,
        entry_ids: group.map((g) => g.id),
      });
    }
  }

  for (const [, group] of byRoomSlot.entries()) {
    if (group.length > 1) {
      const first = group[0];
      const room = roomMap.get(first.classroom_id);
      const slot = slotMap.get(first.time_slot_id);
      conflicts.push({
        id: `room-${first.classroom_id}-${first.time_slot_id}`,
        severity: 'hard',
        category: 'Classroom Overlap',
        message: `${room?.name ?? 'Classroom'} is double-booked at ${slot?.day ?? ''} ${slot?.label ?? ''}.`,
        time_slot_id: first.time_slot_id,
        entry_ids: group.map((g) => g.id),
      });
    }
  }

  for (const [, group] of byBatchSlot.entries()) {
    if (group.length > 1) {
      const first = group[0];
      const batch = batchMap.get(first.batch_id);
      const slot = slotMap.get(first.time_slot_id);
      conflicts.push({
        id: `batch-${first.batch_id}-${first.time_slot_id}`,
        severity: 'hard',
        category: 'Batch Overlap',
        message: `${batch?.name ?? 'Batch'} has ${group.length} overlapping classes at ${slot?.day ?? ''} ${slot?.label ?? ''}.`,
        time_slot_id: first.time_slot_id,
        entry_ids: group.map((g) => g.id),
      });
    }
  }

  for (const [, group] of byFacultyDay.entries()) {
    const first = group[0];
    const faculty = facultyMap.get(first.faculty_id);
    const slot = slotMap.get(first.time_slot_id);
    if (faculty && group.length > faculty.max_hours_per_day) {
      conflicts.push({
        id: `load-${first.faculty_id}-${slot?.day ?? ''}`,
        severity: 'soft',
        category: 'Daily Load Exceeded',
        message: `${faculty.name} has ${group.length} classes on ${slot?.day ?? ''} (max ${faculty.max_hours_per_day}/day).`,
        time_slot_id: first.time_slot_id,
        entry_ids: group.map((g) => g.id),
      });
    }
  }

  return conflicts;
}

/**
 * Checks whether moving or inserting a candidate entry causes any conflicts.
 */
export function checkCandidateSlot(
  candidate: {
    id?: number;
    batch_id: number;
    subject_id: number;
    faculty_id: number;
    classroom_id: number;
    time_slot_id: number;
  },
  existingEntries: TimetableEntry[],
  input: SchedulerInput
): ConflictDetail[] {
  const simulated: TimetableEntry[] = [
    ...existingEntries.filter((e) => e.id !== candidate.id),
    {
      id: candidate.id ?? -1,
      batch_id: candidate.batch_id,
      subject_id: candidate.subject_id,
      faculty_id: candidate.faculty_id,
      classroom_id: candidate.classroom_id,
      time_slot_id: candidate.time_slot_id,
      generation_run_id: null,
    },
  ];

  const allConflicts = detectScheduleConflicts(simulated, input);
  const targetId = candidate.id ?? -1;
  return allConflicts.filter((c) => c.entry_ids.includes(targetId));
}
