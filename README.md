# Chronos Academic — Automated College Timetable & Resource Scheduling System

An end-to-end **DSA + Full-Stack** college timetable generator pre-configured with realistic **Sunstone Campus** batches, faculty, classrooms, labs, and time slots.

---

## Core DSA Concepts Implemented

| Data Structure / Algorithm | File | Role in Scheduling | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Conflict Graph (Adjacency List)** | `server/dsa/conflictGraph.ts` | Models mutual exclusions between sessions sharing the same student batch or faculty | `O(V² + E)` | `O(V + E)` |
| **Welsh-Powell Graph Coloring** | `server/dsa/conflictGraph.ts` | Sorts sessions by conflict degree to compute chromatic lower bound & greedy schedule | `O(V log V + E)` | `O(V)` |
| **Binary Min-Heap (Priority Queue)** | `server/dsa/minHeap.ts` | Dynamically prioritizes constrained sessions (MRV + Lab + Degree heuristic) | `O(log V)` push/pop | `O(V)` |
| **Recursive Backtracking CSP** | `server/dsa/scheduler.ts` | Explores valid `(TimeSlot, Classroom)` assignments & backtracks on conflicts | `O((T·R)^V)` pruned | `O(V + T·R)` |
| **Hash-Indexed Conflict Detector** | `server/dsa/scheduler.ts` | Detects faculty, room, batch overlaps, capacity & unavailability violations in real time | `O(N)` | `O(N)` |

---

## Key Features

1. **Automated Timetable Generation**: One-click generation using **MRV Min-Heap + Backtracking CSP** or **Greedy Graph Coloring**.
2. **Resource & Constraint Management**: Add/delete Faculty (with Day × Period unavailability matrix), Subjects (Theory/Lab), Student Batches, Classrooms, and Time Slots.
3. **Interactive Weekly Matrix**: View schedules **By Batch**, **By Faculty**, or **By Classroom**.
4. **Manual Modification & Live Conflict Detection**: Click any class or free slot to move/assign sessions with real-time constraint validation before saving.
5. **DSA & Conflict Graph Inspector**: Interactive SVG conflict graph visualizer and live Greedy vs. Backtracking benchmark comparison.
6. **Export**: Download clean **CSV** timetables or **Print / Save as PDF**.

---

## Project Structure

```text
├── server.ts                  # Express backend REST API + Vite middleware
├── server/
│   ├── db.ts                  # SQLite schema, parameterized queries & Sunstone seed
│   └── dsa/
│       ├── minHeap.ts         # Custom Binary Min-Heap Priority Queue
│       ├── conflictGraph.ts   # Adjacency-list Conflict Graph + Welsh-Powell Coloring
│       ├── scheduler.ts       # Backtracking CSP Solver & O(N) Conflict Detector
│       └── demo.ts            # Phase 1 standalone CLI verification runner
└── src/
    ├── App.tsx                # Workspace shell & navigation
    ├── types.ts               # Shared TypeScript domain interfaces
    └── components/
        ├── TimetableView.tsx  # Weekly timetable matrix + CSV/Print export
        ├── SlotModal.tsx      # Manual editor with live conflict verification
        ├── ResourcesView.tsx  # Faculty, Subjects, Batches, Rooms, Slots CRUD
        └── DsaInspectorView.tsx # SVG Conflict Graph & Algorithm Benchmark
```

---

## Running Locally (Phase 1 & Phase 2)

```bash
# 1. Install dependencies
npm install

# 2. Phase 1 Demo (Core DSA + SQLite without Frontend)
npm run demo:dsa

# 3. Phase 2 Full-Stack Application (Frontend + Backend + SQLite on port 3000)
npm run dev
```
