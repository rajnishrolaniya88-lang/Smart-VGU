import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  getAllBatches,
  getAllClassrooms,
  getAllFaculty,
  getAllSubjects,
  getAllTimeSlots,
  getAllTimetableEntries,
  getLatestGenerationRun,
  getSchedulerInput,
  initDatabase,
  persistGeneratedSchedule,
  seedSunstoneData,
} from './server/db.ts';
import {
  buildSessionConflictGraph,
  checkCandidateSlot,
  detectScheduleConflicts,
  generateSchedule,
} from './server/dsa/scheduler.ts';
import type { AlgorithmBenchmark, SchedulingAlgorithm } from './src/types.ts';

dotenv.config();

initDatabase();

function buildBootstrapPayload() {
  const input = getSchedulerInput();
  const entries = getAllTimetableEntries();
  const latestRun = getLatestGenerationRun();
  const conflicts = detectScheduleConflicts(entries, input);
  const { graph } = buildSessionConflictGraph(input);

  return {
    ...input,
    entries,
    latestRun,
    conflicts,
    graphSnapshot: graph.toSnapshot(),
  };
}

function parsePositiveInt(val: unknown): number | null {
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    res.json(buildBootstrapPayload());
  });

  // --- Faculty CRUD ---
  app.post('/api/faculty', (req: Request, res: Response) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const maxHours = parsePositiveInt(req.body.max_hours_per_day ?? 4);
    const unavailable = Array.isArray(req.body.unavailable_slots)
      ? req.body.unavailable_slots.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (!name || !department || !email || !maxHours || maxHours > 8) {
      res.status(400).json({ error: 'Valid name, department, email, and max_hours_per_day (1-8) are required.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO faculty (name, department, email, max_hours_per_day, unavailable_slots) VALUES (?, ?, ?, ?, ?)')
      .run(name, department, email, maxHours, JSON.stringify(unavailable));

    res.status(201).json({ id: Number(info.lastInsertRowid), ...buildBootstrapPayload() });
  });

  app.put('/api/faculty/:id/availability', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid faculty ID.' });
      return;
    }
    const unavailable = Array.isArray(req.body.unavailable_slots)
      ? req.body.unavailable_slots.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    db.prepare('UPDATE faculty SET unavailable_slots = ? WHERE id = ?').run(JSON.stringify(unavailable), id);
    res.json(buildBootstrapPayload());
  });

  app.delete('/api/faculty/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid faculty ID.' });
      return;
    }
    db.prepare('DELETE FROM faculty WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  // --- Subjects CRUD ---
  app.post('/api/subjects', (req: Request, res: Response) => {
    const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const credits = parsePositiveInt(req.body.credits ?? 3);
    const hours = parsePositiveInt(req.body.hours_per_week ?? 3);
    const type = req.body.type === 'Lab' ? 'Lab' : req.body.type === 'Theory' ? 'Theory' : null;
    const facultyId = parsePositiveInt(req.body.faculty_id);

    if (!code || !name || !credits || !hours || hours > 10 || !type || !facultyId) {
      res.status(400).json({ error: 'Valid subject code, name, credits, hours (1-10), type, and faculty are required.' });
      return;
    }

    const facultyExists = db.prepare('SELECT id FROM faculty WHERE id = ?').get(facultyId);
    if (!facultyExists) {
      res.status(404).json({ error: 'Assigned faculty member not found.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO subjects (code, name, credits, hours_per_week, type, faculty_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(code, name, credits, hours, type, facultyId);

    res.status(201).json({ id: Number(info.lastInsertRowid), ...buildBootstrapPayload() });
  });

  app.delete('/api/subjects/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid subject ID.' });
      return;
    }
    db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  // --- Batches CRUD ---
  app.post('/api/batches', (req: Request, res: Response) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const program = typeof req.body.program === 'string' ? req.body.program.trim() : '';
    const semester = parsePositiveInt(req.body.semester ?? 1);
    const strength = parsePositiveInt(req.body.strength ?? 50);
    const subjectIds = Array.isArray(req.body.subject_ids)
      ? req.body.subject_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (!name || !program || !semester || !strength || strength > 300) {
      res.status(400).json({ error: 'Valid batch name, program, semester, and strength (1-300) are required.' });
      return;
    }

    const tx = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO batches (name, program, semester, strength) VALUES (?, ?, ?, ?)')
        .run(name, program, semester, strength);
      const batchId = Number(info.lastInsertRowid);
      const linkStmt = db.prepare('INSERT OR IGNORE INTO batch_subjects (batch_id, subject_id) VALUES (?, ?)');
      for (const sid of subjectIds) {
        linkStmt.run(batchId, sid);
      }
      return batchId;
    });

    const batchId = tx();
    res.status(201).json({ id: batchId, ...buildBootstrapPayload() });
  });

  app.put('/api/batches/:id/subjects', (req: Request, res: Response) => {
    const batchId = parsePositiveInt(req.params.id);
    if (!batchId) {
      res.status(400).json({ error: 'Invalid batch ID.' });
      return;
    }
    const subjectIds = Array.isArray(req.body.subject_ids)
      ? req.body.subject_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM batch_subjects WHERE batch_id = ?').run(batchId);
      const linkStmt = db.prepare('INSERT OR IGNORE INTO batch_subjects (batch_id, subject_id) VALUES (?, ?)');
      for (const sid of subjectIds) {
        linkStmt.run(batchId, sid);
      }
    });
    tx();
    res.json(buildBootstrapPayload());
  });

  app.delete('/api/batches/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid batch ID.' });
      return;
    }
    db.prepare('DELETE FROM batches WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  // --- Classrooms CRUD ---
  app.post('/api/classrooms', (req: Request, res: Response) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const building = typeof req.body.building === 'string' ? req.body.building.trim() : '';
    const capacity = parsePositiveInt(req.body.capacity ?? 60);
    const type = req.body.type === 'Lab' ? 'Lab' : req.body.type === 'Lecture' ? 'Lecture' : null;

    if (!name || !building || !capacity || capacity > 500 || !type) {
      res.status(400).json({ error: 'Valid classroom name, building, capacity (1-500), and type are required.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO classrooms (name, building, capacity, type) VALUES (?, ?, ?, ?)')
      .run(name, building, capacity, type);

    res.status(201).json({ id: Number(info.lastInsertRowid), ...buildBootstrapPayload() });
  });

  app.delete('/api/classrooms/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid classroom ID.' });
      return;
    }
    db.prepare('DELETE FROM classrooms WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  // --- Time Slots CRUD ---
  app.post('/api/timeslots', (req: Request, res: Response) => {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = typeof req.body.day === 'string' && validDays.includes(req.body.day) ? req.body.day : null;
    const periodIndex = parsePositiveInt(req.body.period_index);
    const startTime = typeof req.body.start_time === 'string' ? req.body.start_time.trim() : '';
    const endTime = typeof req.body.end_time === 'string' ? req.body.end_time.trim() : '';
    const isBreak = Boolean(req.body.is_break);
    const label =
      typeof req.body.label === 'string' && req.body.label.trim()
        ? req.body.label.trim()
        : `${startTime} – ${endTime}`;

    if (!day || !periodIndex || periodIndex > 12 || !startTime || !endTime) {
      res.status(400).json({ error: 'Valid day, period_index (1-12), start_time, and end_time are required.' });
      return;
    }

    const info = db
      .prepare('INSERT INTO time_slots (day, period_index, label, start_time, end_time, is_break) VALUES (?, ?, ?, ?, ?, ?)')
      .run(day, periodIndex, label, startTime, endTime, isBreak ? 1 : 0);

    res.status(201).json({ id: Number(info.lastInsertRowid), ...buildBootstrapPayload() });
  });

  app.delete('/api/timeslots/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid time slot ID.' });
      return;
    }
    db.prepare('DELETE FROM time_slots WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  // --- DSA Scheduling & Conflict Endpoints ---
  app.post('/api/timetable/generate', (req: Request, res: Response) => {
    const algorithm: SchedulingAlgorithm = req.body.algorithm === 'greedy' ? 'greedy' : 'backtracking';
    const input = getSchedulerInput();
    const result = generateSchedule(input, algorithm);
    const savedRun = persistGeneratedSchedule(result);

    res.json({
      run: savedRun,
      ...buildBootstrapPayload(),
    });
  });

  app.post('/api/timetable/benchmark', (_req: Request, res: Response) => {
    const input = getSchedulerInput();
    const greedy = generateSchedule(input, 'greedy');
    const backtracking = generateSchedule(input, 'backtracking');

    const benchmarks: AlgorithmBenchmark[] = [
      {
        algorithm: 'greedy',
        vertices: greedy.vertices,
        edges: greedy.edges,
        backtracks: greedy.backtracks,
        execution_ms: greedy.execution_ms,
        placed_sessions: greedy.placed_sessions,
        total_sessions: greedy.total_sessions,
        conflicts_detected: greedy.conflicts_detected,
        status: greedy.status,
      },
      {
        algorithm: 'backtracking',
        vertices: backtracking.vertices,
        edges: backtracking.edges,
        backtracks: backtracking.backtracks,
        execution_ms: backtracking.execution_ms,
        placed_sessions: backtracking.placed_sessions,
        total_sessions: backtracking.total_sessions,
        conflicts_detected: backtracking.conflicts_detected,
        status: backtracking.status,
      },
    ];

    res.json({ benchmarks });
  });

  app.post('/api/timetable/check-conflict', (req: Request, res: Response) => {
    const id = req.body.id ? parsePositiveInt(req.body.id) ?? undefined : undefined;
    const batchId = parsePositiveInt(req.body.batch_id);
    const subjectId = parsePositiveInt(req.body.subject_id);
    const facultyId = parsePositiveInt(req.body.faculty_id);
    const classroomId = parsePositiveInt(req.body.classroom_id);
    const timeSlotId = parsePositiveInt(req.body.time_slot_id);

    if (!batchId || !subjectId || !facultyId || !classroomId || !timeSlotId) {
      res.status(400).json({ error: 'All scheduling fields are required for conflict inspection.' });
      return;
    }

    const input = getSchedulerInput();
    const existing = getAllTimetableEntries();
    const conflicts = checkCandidateSlot(
      {
        id,
        batch_id: batchId,
        subject_id: subjectId,
        faculty_id: facultyId,
        classroom_id: classroomId,
        time_slot_id: timeSlotId,
      },
      existing,
      input
    );

    res.json({ conflicts });
  });

  app.patch('/api/timetable/entries/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    const classroomId = parsePositiveInt(req.body.classroom_id);
    const timeSlotId = parsePositiveInt(req.body.time_slot_id);
    const allowConflicts = Boolean(req.body.force);

    if (!id || !classroomId || !timeSlotId) {
      res.status(400).json({ error: 'Valid entry ID, classroom_id, and time_slot_id are required.' });
      return;
    }

    const current = db.prepare('SELECT * FROM timetable_entries WHERE id = ?').get(id) as
      | {
          id: number;
          batch_id: number;
          subject_id: number;
          faculty_id: number;
          classroom_id: number;
          time_slot_id: number;
        }
      | undefined;

    if (!current) {
      res.status(404).json({ error: 'Timetable entry not found.' });
      return;
    }

    const input = getSchedulerInput();
    const existing = getAllTimetableEntries();
    const conflicts = checkCandidateSlot(
      {
        id,
        batch_id: current.batch_id,
        subject_id: current.subject_id,
        faculty_id: current.faculty_id,
        classroom_id: classroomId,
        time_slot_id: timeSlotId,
      },
      existing,
      input
    );

    const hardConflicts = conflicts.filter((c) => c.severity === 'hard');
    if (hardConflicts.length > 0 && !allowConflicts) {
      res.status(409).json({
        error: hardConflicts[0].message,
        conflicts,
      });
      return;
    }

    db.prepare('UPDATE timetable_entries SET classroom_id = ?, time_slot_id = ? WHERE id = ?').run(
      classroomId,
      timeSlotId,
      id
    );

    res.json(buildBootstrapPayload());
  });

  app.post('/api/timetable/entries', (req: Request, res: Response) => {
    const batchId = parsePositiveInt(req.body.batch_id);
    const subjectId = parsePositiveInt(req.body.subject_id);
    const classroomId = parsePositiveInt(req.body.classroom_id);
    const timeSlotId = parsePositiveInt(req.body.time_slot_id);
    const allowConflicts = Boolean(req.body.force);

    if (!batchId || !subjectId || !classroomId || !timeSlotId) {
      res.status(400).json({ error: 'batch_id, subject_id, classroom_id, and time_slot_id are required.' });
      return;
    }

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
      | { id: number; faculty_id: number }
      | undefined;
    if (!subject) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    const input = getSchedulerInput();
    const existing = getAllTimetableEntries();
    const conflicts = checkCandidateSlot(
      {
        batch_id: batchId,
        subject_id: subjectId,
        faculty_id: subject.faculty_id,
        classroom_id: classroomId,
        time_slot_id: timeSlotId,
      },
      existing,
      input
    );

    const hardConflicts = conflicts.filter((c) => c.severity === 'hard');
    if (hardConflicts.length > 0 && !allowConflicts) {
      res.status(409).json({ error: hardConflicts[0].message, conflicts });
      return;
    }

    db.prepare(
      'INSERT INTO timetable_entries (batch_id, subject_id, faculty_id, classroom_id, time_slot_id, generation_run_id) VALUES (?, ?, ?, ?, ?, NULL)'
    ).run(batchId, subjectId, subject.faculty_id, classroomId, timeSlotId);

    res.status(201).json(buildBootstrapPayload());
  });

  app.delete('/api/timetable/entries/:id', (req: Request, res: Response) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid timetable entry ID.' });
      return;
    }
    db.prepare('DELETE FROM timetable_entries WHERE id = ?').run(id);
    res.json(buildBootstrapPayload());
  });

  app.post('/api/seed/reset', (_req: Request, res: Response) => {
    seedSunstoneData();
    res.json(buildBootstrapPayload());
  });

  // Explicit error handler so stack traces never leak
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chronos Academic server running on http://localhost:${PORT}`);
  });
}

startServer();
