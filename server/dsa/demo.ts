import { getSchedulerInput, initDatabase } from '../db.ts';
import { generateSchedule } from './scheduler.ts';

/**
 * Phase 1 Standalone Evaluation Demo (Without Frontend)
 * Run via: npm run demo:dsa
 */
initDatabase();
const input = getSchedulerInput();

console.log('\n============================================================');
console.log(' Chronos Academic — Phase 1 DSA Core Verification Runner');
console.log('============================================================\n');

console.log(`Loaded Sunstone Dataset:`);
console.log(`  - Batches    : ${input.batches.length}`);
console.log(`  - Faculty    : ${input.faculty.length}`);
console.log(`  - Subjects   : ${input.subjects.length}`);
console.log(`  - Classrooms : ${input.classrooms.length}`);
console.log(`  - Time Slots : ${input.timeSlots.filter((t) => !t.is_break).length} active/week\n`);

const greedy = generateSchedule(input, 'greedy');
const backtracking = generateSchedule(input, 'backtracking');

console.log('Conflict Graph Summary:');
console.log(`  - Vertices (Sessions) : ${backtracking.vertices}`);
console.log(`  - Conflict Edges      : ${backtracking.edges}`);
console.log(`  - Chromatic Lower Bd  : ${backtracking.graphSnapshot.chromaticBound} colors\n`);

console.log('Algorithm Comparison:');
console.table([
  {
    Algorithm: 'Greedy Graph Coloring',
    Placed: `${greedy.placed_sessions}/${greedy.total_sessions}`,
    Backtracks: greedy.backtracks,
    'Time (ms)': greedy.execution_ms,
    Status: greedy.status,
  },
  {
    Algorithm: 'MRV Min-Heap + Backtracking',
    Placed: `${backtracking.placed_sessions}/${backtracking.total_sessions}`,
    Backtracks: backtracking.backtracks,
    'Time (ms)': backtracking.execution_ms,
    Status: backtracking.status,
  },
]);

const firstBatch = input.batches[0];
if (firstBatch) {
  const slotMap = new Map(input.timeSlots.map((t) => [t.id, t]));
  const subMap = new Map(input.subjects.map((s) => [s.id, s]));
  const roomMap = new Map(input.classrooms.map((r) => [r.id, r]));
  const facMap = new Map(input.faculty.map((f) => [f.id, f]));

  console.log(`\nSample Generated Timetable for ${firstBatch.name}:`);
  const rows = backtracking.assignments
    .filter((a) => a.batch_id === firstBatch.id)
    .map((a) => {
      const ts = slotMap.get(a.time_slot_id);
      const sub = subMap.get(a.subject_id);
      const room = roomMap.get(a.classroom_id);
      const fac = facMap.get(a.faculty_id);
      return {
        Day: ts?.day ?? '',
        Time: ts?.label ?? '',
        Subject: `${sub?.code ?? ''} (${sub?.type ?? ''})`,
        Faculty: fac?.name ?? '',
        Room: room?.name ?? '',
      };
    });
  console.table(rows);
}
