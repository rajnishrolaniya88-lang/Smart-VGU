import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { AlgorithmBenchmark, ConflictGraphSnapshot, GenerationRun } from '../types.ts';

interface DsaInspectorViewProps {
  graphSnapshot: ConflictGraphSnapshot;
  latestRun: GenerationRun | null;
}

const COLOR_PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#06B6D4',
];

export function DsaInspectorView({ graphSnapshot, latestRun }: DsaInspectorViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    graphSnapshot.nodes[0]?.id ?? null
  );
  const [benchmarks, setBenchmarks] = useState<AlgorithmBenchmark[] | null>(null);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  // Deduplicate graph to 1 representative vertex per (Batch + Subject) for clean SVG visualization
  // while keeping exact full-session counts in telemetry metrics.
  const visualGraph = useMemo(() => {
    const repMap = new Map<string, typeof graphSnapshot.nodes[number]>();
    for (const node of graphSnapshot.nodes) {
      const key = `${node.batchName}|${node.subjectCode}`;
      if (!repMap.has(key)) repMap.set(key, node);
    }
    const nodes = Array.from(repMap.values());
    const idSet = new Set(nodes.map((n) => n.id));
    const edges = graphSnapshot.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

    const width = 760;
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 155;

    const positioned = nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1) - Math.PI / 2;
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    const posMap = new Map(positioned.map((p) => [p.id, p]));
    return { nodes: positioned, edges, posMap, width, height };
  }, [graphSnapshot]);

  const activeNode =
    visualGraph.nodes.find((n) => n.id === selectedNodeId) ?? visualGraph.nodes[0] ?? null;

  const activeNeighborIds = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const set = new Set<string>();
    for (const e of visualGraph.edges) {
      if (e.source === activeNode.id) set.add(e.target);
      if (e.target === activeNode.id) set.add(e.source);
    }
    return set;
  }, [activeNode, visualGraph.edges]);

  const handleRunBenchmark = async () => {
    setRunningBenchmark(true);
    try {
      const res = await fetch('/api/timetable/benchmark', { method: 'POST' });
      const data = await res.json();
      if (Array.isArray(data.benchmarks)) {
        setBenchmarks(data.benchmarks);
      }
    } finally {
      setRunningBenchmark(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Algorithm Benchmark Comparison */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Algorithm Comparison · Greedy Coloring vs. Backtracking CSP
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Executes both schedulers live against your SQLite dataset and compares session placement, backtracks, and runtime.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunBenchmark}
            disabled={runningBenchmark}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5" />
            {runningBenchmark ? 'Running Benchmark...' : 'Run Live Benchmark'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">Algorithm Strategy</th>
                <th className="px-4 py-2.5 text-right">Graph (V / E)</th>
                <th className="px-4 py-2.5 text-right">Sessions Placed</th>
                <th className="px-4 py-2.5 text-right">Backtracks</th>
                <th className="px-4 py-2.5 text-right">Runtime</th>
                <th className="px-4 py-2.5 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(benchmarks ?? (latestRun ? [latestRun] : [])).map((row) => (
                <tr key={row.algorithm} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.algorithm === 'backtracking'
                      ? 'MRV Min-Heap + Recursive Backtracking'
                      : 'Welsh-Powell Greedy Coloring'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600">
                    {row.vertices}V / {row.edges}E
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {row.placed_sessions} / {row.total_sessions}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                    {row.backtracks}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {row.execution_ms} ms
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conflict Graph Visualization */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Course Conflict Graph (Adjacency List Projection)
              </h3>
              <p className="text-xs text-slate-500">
                Click any vertex to highlight mutual-exclusion edges (shared batch or shared faculty).
              </p>
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-600">
              {graphSnapshot.nodes.length} total vertices · Chromatic bound {graphSnapshot.chromaticBound}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <svg
              viewBox={`0 0 ${visualGraph.width} ${visualGraph.height}`}
              className="h-[380px] w-full select-none"
              role="img"
              aria-label="Timetable conflict graph"
            >
              {visualGraph.edges.map((edge, idx) => {
                const u = visualGraph.posMap.get(edge.source);
                const v = visualGraph.posMap.get(edge.target);
                if (!u || !v) return null;
                const highlighted =
                  activeNode && (edge.source === activeNode.id || edge.target === activeNode.id);

                return (
                  <line
                    key={`${edge.source}-${edge.target}-${idx}`}
                    x1={u.x}
                    y1={u.y}
                    x2={v.x}
                    y2={v.y}
                    stroke={
                      highlighted
                        ? edge.reason === 'faculty'
                          ? '#DC2626'
                          : '#4F46E5'
                        : '#CBD5E1'
                    }
                    strokeWidth={highlighted ? 2 : 1}
                    strokeOpacity={highlighted ? 0.9 : 0.45}
                  />
                );
              })}

              {visualGraph.nodes.map((node) => {
                const isSelected = activeNode?.id === node.id;
                const isNeighbor = activeNeighborIds.has(node.id);
                const fill = COLOR_PALETTE[node.colorIndex % COLOR_PALETTE.length];

                return (
                  <g
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? 18 : isNeighbor ? 15 : 13}
                      fill={fill}
                      stroke={isSelected ? '#0F172A' : '#FFFFFF'}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      x={node.x}
                      y={node.y + 30}
                      textAnchor="middle"
                      className="fill-slate-700 font-mono text-[10px] font-medium"
                    >
                      {node.subjectCode}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Selected Node Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Selected Graph Vertex</h3>
          {activeNode ? (
            <div className="mt-4 space-y-3 text-xs">
              <div className="border-b border-slate-100 pb-3">
                <div className="font-mono text-sm font-semibold text-slate-900">
                  {activeNode.subjectCode}
                </div>
                <div className="mt-1 text-slate-600">{activeNode.batchName}</div>
                <div className="mt-0.5 text-slate-500">{activeNode.facultyName}</div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">Conflict Degree</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {activeNode.degree} edges
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">Welsh-Powell Color</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  Slot Bucket #{activeNode.colorIndex + 1}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">Session Type</span>
                <span className="font-medium text-slate-900">{activeNode.type}</span>
              </div>

              <div className="pt-2">
                <div className="font-semibold text-slate-700">
                  Conflicting Neighbors ({activeNeighborIds.size})
                </div>
                <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                  {Array.from(activeNeighborIds).map((nid) => {
                    const nb = visualGraph.posMap.get(nid);
                    if (!nb) return null;
                    return (
                      <li
                        key={nid}
                        className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="font-mono font-semibold text-slate-800">
                          {nb.subjectCode}
                        </span>
                        <span className="truncate pl-2 text-slate-500">{nb.batchName}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No session vertices available.</p>
          )}
        </div>
      </div>

      {/* Viva Complexity Reference Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Implemented Data Structures & Asymptotic Complexity
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <th className="px-6 py-3">DSA Component</th>
                <th className="px-4 py-3">Role in Timetable Scheduler</th>
                <th className="px-4 py-3 font-mono">Time Complexity</th>
                <th className="px-6 py-3 font-mono">Space Complexity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">
                  Conflict Graph (Adjacency List)
                </td>
                <td className="px-4 py-3">
                  Models mutual exclusions between sessions sharing a batch or faculty member
                </td>
                <td className="px-4 py-3 font-mono">O(V² + E)</td>
                <td className="px-6 py-3 font-mono">O(V + E)</td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">
                  Welsh-Powell Graph Coloring
                </td>
                <td className="px-4 py-3">
                  Orders vertices by descending degree to compute chromatic lower bound & greedy baseline
                </td>
                <td className="px-4 py-3 font-mono">O(V log V + E)</td>
                <td className="px-6 py-3 font-mono">O(V)</td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">
                  Binary Min-Heap Priority Queue
                </td>
                <td className="px-4 py-3">
                  Maintains MRV (Minimum Remaining Values) + Lab priority ordering for session selection
                </td>
                <td className="px-4 py-3 font-mono">O(log V) push/pop</td>
                <td className="px-6 py-3 font-mono">O(V)</td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">
                  Recursive Backtracking CSP
                </td>
                <td className="px-4 py-3">
                  Explores legal (TimeSlot, Room) assignments and backtracks on hard constraint dead-ends
                </td>
                <td className="px-4 py-3 font-mono">O((T·R)^V) pruned</td>
                <td className="px-6 py-3 font-mono">O(V + T·R)</td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-slate-900">
                  Hash-Indexed Conflict Detector
                </td>
                <td className="px-4 py-3">
                  Verifies faculty, room, batch overlaps & capacity constraints during manual edits
                </td>
                <td className="px-4 py-3 font-mono">O(N)</td>
                <td className="px-6 py-3 font-mono">O(N)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
