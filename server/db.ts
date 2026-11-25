import Database from 'better-sqlite3';
import path from 'path';
import type {
  Batch,
  Classroom,
  DayOfWeek,
  Faculty,
  GenerationRun,
  Subject,
  TimeSlot,
  TimetableEntry,
} from '../src/types.ts';
import { detectScheduleConflicts, generateSchedule } from './dsa/scheduler.ts';

const DB_PATH = path.resolve(process.cwd(), 'timetable.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS faculty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      email TEXT NOT NULL,
      max_hours_per_day INTEGER NOT NULL DEFAULT 4,
      unavailable_slots TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 3,
      hours_per_week INTEGER NOT NULL DEFAULT 3,
      type TEXT NOT NULL CHECK(type IN ('Theory', 'Lab')),
      faculty_id INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      program TEXT NOT NULL,
      semester INTEGER NOT NULL DEFAULT 1,
      strength INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS batch_subjects (
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      PRIMARY KEY (batch_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      building TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 60,
      type TEXT NOT NULL CHECK(type IN ('Lecture', 'Lab'))
    );

    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      period_index INTEGER NOT NULL,
      label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_break INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      algorithm TEXT NOT NULL,
      vertices INTEGER NOT NULL,
      edges INTEGER NOT NULL,
      backtracks INTEGER NOT NULL,
      execution_ms REAL NOT NULL,
      placed_sessions INTEGER NOT NULL,
      total_sessions INTEGER NOT NULL,
      conflicts_detected INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timetable_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      faculty_id INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
      classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      time_slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
      generation_run_id INTEGER REFERENCES generation_runs(id) ON DELETE SET NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM faculty').get() as { cnt: number };
  if (count.cnt === 0) {
    seedSunstoneData();
  }
}

export function seedSunstoneData(): void {
  const clearAndSeed = db.transaction(() => {
    db.exec(`
      DELETE FROM timetable_entries;
      DELETE FROM generation_runs;
      DELETE FROM batch_subjects;
      DELETE FROM batches;
      DELETE FROM subjects;
      DELETE FROM classrooms;
      DELETE FROM time_slots;
      DELETE FROM faculty;
    `);

    const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [
      { idx: 1, label: '09:00 – 10:00', start: '09:00', end: '10:00', isBreak: 0 },
      { idx: 2, label: '10:00 – 11:00', start: '10:00', end: '11:00', isBreak: 0 },
      { idx: 3, label: '11:00 – 12:00', start: '11:00', end: '12:00', isBreak: 0 },
      { idx: 4, label: 'Lunch Break', start: '12:00', end: '13:00', isBreak: 1 },
      { idx: 5, label: '13:00 – 14:00', start: '13:00', end: '14:00', isBreak: 0 },
      { idx: 6, label: '14:00 – 15:00', start: '14:00', end: '15:00', isBreak: 0 },
      { idx: 7, label: '15:00 – 16:00', start: '15:00', end: '16:00', isBreak: 0 },
    ];

    const insertSlot = db.prepare(
      'INSERT INTO time_slots (day, period_index, label, start_time, end_time, is_break) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const slotIdLookup = new Map<string, number>();
    for (const day of days) {
      for (const p of periods) {
        const info = insertSlot.run(day, p.idx, p.label, p.start, p.end, p.isBreak);
        slotIdLookup.set(`${day}-${p.idx}`, Number(info.lastInsertRowid));
      }
    }

    const insertFaculty = db.prepare(
      'INSERT INTO faculty (name, department, email, max_hours_per_day, unavailable_slots) VALUES (?, ?, ?, ?, ?)'
    );
    const f1 = Number(
      insertFaculty.run(
        'Dr. Kratagya Sharma',
        'Computer Science',
        'kratagya.sharma@sunstone.edu.in',
        4,
        JSON.stringify([slotIdLookup.get('Monday-1'), slotIdLookup.get('Friday-7')].filter(Boolean))
      ).lastInsertRowid
    );
    const f2 = Number(
      insertFaculty.run(
        'Prof. Ananya Verma',
        'Systems & Networks',
        'ananya.verma@sunstone.edu.in',
        4,
        JSON.stringify([slotIdLookup.get('Wednesday-5')].filter(Boolean))
      ).lastInsertRowid
    );
    const f3 = Number(
      insertFaculty.run(
        'Prof. Vikram Nair',
        'Web & Cloud Engineering',
        'vikram.nair@sunstone.edu.in',
        4,
        JSON.stringify([slotIdLookup.get('Tuesday-1')].filter(Boolean))
      ).lastInsertRowid
    );
    const f4 = Number(
      insertFaculty.run(
        'Dr. Meera Iyer',
        'Data & Databases',
        'meera.iyer@sunstone.edu.in',
        4,
        JSON.stringify([slotIdLookup.get('Thursday-7')].filter(Boolean))
      ).lastInsertRowid
    );
    const f5 = Number(
      insertFaculty.run(
        'Prof. Siddharth Rao',
        'Software Engineering',
        'siddharth.rao@sunstone.edu.in',
        4,
        JSON.stringify([slotIdLookup.get('Friday-1')].filter(Boolean))
      ).lastInsertRowid
    );

    const insertSubject = db.prepare(
      'INSERT INTO subjects (code, name, credits, hours_per_week, type, faculty_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const s1 = Number(insertSubject.run('CS301', 'Data Structures & Algorithms', 4, 4, 'Theory', f1).lastInsertRowid);
    const s2 = Number(insertSubject.run('CS302L', 'DSA Practical Lab', 2, 2, 'Lab', f1).lastInsertRowid);
    const s3 = Number(insertSubject.run('CS303', 'Operating Systems', 3, 3, 'Theory', f2).lastInsertRowid);
    const s4 = Number(insertSubject.run('CS304', 'Database Management Systems', 3, 3, 'Theory', f4).lastInsertRowid);
    const s5 = Number(insertSubject.run('CS305L', 'DBMS & SQL Lab', 2, 2, 'Lab', f4).lastInsertRowid);
    const s6 = Number(insertSubject.run('CS306', 'Full-Stack Web Engineering', 3, 3, 'Theory', f3).lastInsertRowid);
    const s7 = Number(insertSubject.run('CS307', 'Software Engineering & Agile', 3, 3, 'Theory', f5).lastInsertRowid);
    const s8 = Number(insertSubject.run('CS308', 'Computer Networks', 3, 3, 'Theory', f2).lastInsertRowid);

    const insertRoom = db.prepare(
      'INSERT INTO classrooms (name, building, capacity, type) VALUES (?, ?, ?, ?)'
    );
    insertRoom.run('LH-301', 'Sunstone Block A', 70, 'Lecture');
    insertRoom.run('LH-302', 'Sunstone Block A', 65, 'Lecture');
    insertRoom.run('LH-304', 'Sunstone Block B', 55, 'Lecture');
    insertRoom.run('DSA-LAB-1', 'Tech Innovation Wing', 65, 'Lab');
    insertRoom.run('CLOUD-LAB-2', 'Tech Innovation Wing', 60, 'Lab');

    const insertBatch = db.prepare(
      'INSERT INTO batches (name, program, semester, strength) VALUES (?, ?, ?, ?)'
    );
    const b1 = Number(insertBatch.run('B.Tech CSE Sem 3 - A6', 'B.Tech CSE', 3, 60).lastInsertRowid);
    const b2 = Number(insertBatch.run('BCA Sem 3 - A1', 'BCA', 3, 55).lastInsertRowid);
    const b3 = Number(insertBatch.run('MCA Sem 1 - M1', 'MCA', 1, 48).lastInsertRowid);

    const linkBatchSubject = db.prepare('INSERT INTO batch_subjects (batch_id, subject_id) VALUES (?, ?)');
    for (const sid of [s1, s2, s3, s4, s5, s6]) linkBatchSubject.run(b1, sid);
    for (const sid of [s1, s2, s4, s6, s7, s8]) linkBatchSubject.run(b2, sid);
    for (const sid of [s3, s4, s5, s6, s7, s8]) linkBatchSubject.run(b3, sid);
  });

  clearAndSeed();

  // Generate an initial conflict-free timetable via our Backtracking CSP solver
  const input = getSchedulerInput();
  const result = generateSchedule(input, 'backtracking');
  persistGeneratedSchedule(result);
}

export function getAllFaculty(): Faculty[] {
  const rows = db.prepare('SELECT * FROM faculty ORDER BY name ASC').all() as Array<{
    id: number;
    name: string;
    department: string;
    email: string;
    max_hours_per_day: number;
    unavailable_slots: string;
  }>;
  return rows.map((r) => ({
    ...r,
    unavailable_slots: JSON.parse(r.unavailable_slots || '[]') as number[],
  }));
}

export function getAllSubjects(): Subject[] {
  return db
    .prepare(
      `SELECT s.*, f.name AS faculty_name
       FROM subjects s
       JOIN faculty f ON s.faculty_id = f.id
       ORDER BY s.code ASC`
    )
    .all() as Subject[];
}

export function getAllBatches(): Batch[] {
  const batches = db.prepare('SELECT * FROM batches ORDER BY name ASC').all() as Array<{
    id: number;
    name: string;
    program: string;
    semester: number;
    strength: number;
  }>;
  const links = db.prepare('SELECT batch_id, subject_id FROM batch_subjects').all() as Array<{
    batch_id: number;
    subject_id: number;
  }>;
  const byBatch = new Map<number, number[]>();
  for (const l of links) {
    if (!byBatch.has(l.batch_id)) byBatch.set(l.batch_id, []);
    byBatch.get(l.batch_id)!.push(l.subject_id);
  }
  return batches.map((b) => ({
    ...b,
    subject_ids: byBatch.get(b.id) ?? [],
  }));
}

export function getAllClassrooms(): Classroom[] {
  return db.prepare('SELECT * FROM classrooms ORDER BY name ASC').all() as Classroom[];
}

export function getAllTimeSlots(): TimeSlot[] {
  const rows = db
    .prepare(
      `SELECT * FROM time_slots
       ORDER BY CASE day
         WHEN 'Monday' THEN 1
         WHEN 'Tuesday' THEN 2
         WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4
         WHEN 'Friday' THEN 5
         WHEN 'Saturday' THEN 6
       END, period_index ASC`
    )
    .all() as Array<{
    id: number;
    day: DayOfWeek;
    period_index: number;
    label: string;
    start_time: string;
    end_time: string;
    is_break: number;
  }>;
  return rows.map((r) => ({ ...r, is_break: Boolean(r.is_break) }));
}

export function getAllTimetableEntries(): TimetableEntry[] {
  return db
    .prepare(
      `SELECT te.*,
              b.name AS batch_name,
              s.code AS subject_code,
              s.name AS subject_name,
              s.type AS subject_type,
              f.name AS faculty_name,
              c.name AS classroom_name,
              ts.day AS day,
              ts.period_index AS period_index,
              ts.label AS slot_label
       FROM timetable_entries te
       JOIN batches b ON te.batch_id = b.id
       JOIN subjects s ON te.subject_id = s.id
       JOIN faculty f ON te.faculty_id = f.id
       JOIN classrooms c ON te.classroom_id = c.id
       JOIN time_slots ts ON te.time_slot_id = ts.id
       ORDER BY ts.period_index ASC`
    )
    .all() as TimetableEntry[];
}

export function getLatestGenerationRun(): GenerationRun | null {
  const row = db
    .prepare('SELECT * FROM generation_runs ORDER BY id DESC LIMIT 1')
    .get() as GenerationRun | undefined;
  return row ?? null;
}

export function getSchedulerInput() {
  return {
    faculty: getAllFaculty(),
    subjects: getAllSubjects(),
    batches: getAllBatches(),
    classrooms: getAllClassrooms(),
    timeSlots: getAllTimeSlots(),
  };
}

export function persistGeneratedSchedule(result: ReturnType<typeof generateSchedule>): GenerationRun {
  const input = getSchedulerInput();

  const tx = db.transaction(() => {
    const runInfo = db
      .prepare(
        `INSERT INTO generation_runs
         (algorithm, vertices, edges, backtracks, execution_ms, placed_sessions, total_sessions, conflicts_detected, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.algorithm,
        result.vertices,
        result.edges,
        result.backtracks,
        result.execution_ms,
        result.placed_sessions,
        result.total_sessions,
        0,
        result.status
      );

    const runId = Number(runInfo.lastInsertRowid);
    db.prepare('DELETE FROM timetable_entries').run();

    const insertEntry = db.prepare(
      `INSERT INTO timetable_entries (batch_id, subject_id, faculty_id, classroom_id, time_slot_id, generation_run_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const a of result.assignments) {
      insertEntry.run(a.batch_id, a.subject_id, a.faculty_id, a.classroom_id, a.time_slot_id, runId);
    }

    const savedEntries = getAllTimetableEntries();
    const conflicts = detectScheduleConflicts(savedEntries, input);
    db.prepare('UPDATE generation_runs SET conflicts_detected = ? WHERE id = ?').run(conflicts.length, runId);

    return db.prepare('SELECT * FROM generation_runs WHERE id = ?').get(runId) as GenerationRun;
  });

  return tx();
}
