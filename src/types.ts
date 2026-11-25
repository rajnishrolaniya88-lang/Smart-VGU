export type SubjectType = 'Theory' | 'Lab';
export type ClassroomType = 'Lecture' | 'Lab';
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type SchedulingAlgorithm = 'backtracking' | 'greedy';

export interface Faculty {
  id: number;
  name: string;
  department: string;
  email: string;
  max_hours_per_day: number;
  unavailable_slots: number[];
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  credits: number;
  hours_per_week: number;
  type: SubjectType;
  faculty_id: number;
  faculty_name?: string;
}

export interface Batch {
  id: number;
  name: string;
  program: string;
  semester: number;
  strength: number;
  subject_ids: number[];
}

export interface Classroom {
  id: number;
  name: string;
  building: string;
  capacity: number;
  type: ClassroomType;
}

export interface TimeSlot {
  id: number;
  day: DayOfWeek;
  period_index: number;
  label: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
}

export interface TimetableEntry {
  id: number;
  batch_id: number;
  batch_name?: string;
  subject_id: number;
  subject_code?: string;
  subject_name?: string;
  subject_type?: SubjectType;
  faculty_id: number;
  faculty_name?: string;
  classroom_id: number;
  classroom_name?: string;
  time_slot_id: number;
  day?: DayOfWeek;
  period_index?: number;
  slot_label?: string;
  generation_run_id: number | null;
}

export interface ConflictDetail {
  id: string;
  severity: 'hard' | 'soft';
  category: 'Faculty Overlap' | 'Classroom Overlap' | 'Batch Overlap' | 'Faculty Unavailable' | 'Capacity Exceeded' | 'Room Type Mismatch' | 'Daily Load Exceeded';
  message: string;
  time_slot_id: number;
  entry_ids: number[];
}

export interface GenerationRun {
  id: number;
  algorithm: SchedulingAlgorithm;
  vertices: number;
  edges: number;
  backtracks: number;
  execution_ms: number;
  placed_sessions: number;
  total_sessions: number;
  conflicts_detected: number;
  status: 'Optimal' | 'Partial' | 'Failed';
  created_at: string;
}

export interface GraphNodeSnapshot {
  id: string;
  label: string;
  batchName: string;
  subjectCode: string;
  facultyName: string;
  type: SubjectType;
  degree: number;
  colorIndex: number;
}

export interface GraphEdgeSnapshot {
  source: string;
  target: string;
  reason: 'batch' | 'faculty' | 'both';
}

export interface ConflictGraphSnapshot {
  nodes: GraphNodeSnapshot[];
  edges: GraphEdgeSnapshot[];
  chromaticBound: number;
}

export interface BootstrapPayload {
  faculty: Faculty[];
  subjects: Subject[];
  batches: Batch[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  entries: TimetableEntry[];
  latestRun: GenerationRun | null;
  conflicts: ConflictDetail[];
  graphSnapshot: ConflictGraphSnapshot;
}

export interface AlgorithmBenchmark {
  algorithm: SchedulingAlgorithm;
  vertices: number;
  edges: number;
  backtracks: number;
  execution_ms: number;
  placed_sessions: number;
  total_sessions: number;
  conflicts_detected: number;
  status: 'Optimal' | 'Partial' | 'Failed';
}
