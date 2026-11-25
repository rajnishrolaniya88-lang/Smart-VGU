import type { GraphEdgeSnapshot, GraphNodeSnapshot, SubjectType } from '../../src/types.ts';

export interface SessionVertex {
  id: string;
  batchId: number;
  batchName: string;
  batchStrength: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  subjectType: SubjectType;
  facultyId: number;
  facultyName: string;
  sessionIndex: number;
}

/**
 * Conflict Graph using an explicit Adjacency List representation.
 *
 * Vertices represent individual weekly teaching sessions (Batch + Subject + Session#).
 * An undirected edge (u, v) exists iff session u and session v CANNOT be scheduled
 * in the same time slot:
 *   1. Same Student Batch (batch cannot attend two lectures simultaneously)
 *   2. Same Faculty (faculty cannot teach two classes simultaneously)
 *
 * Time Complexity:
 * - Build Graph: O(V^2) pairwise conflict checks
 * - Welsh-Powell Greedy Coloring: O(V log V + V + E)
 * Space Complexity: O(V + E)
 */
export class ConflictGraph {
  private vertices: Map<string, SessionVertex> = new Map();
  private adjacency: Map<string, Map<string, 'batch' | 'faculty' | 'both'>> = new Map();

  public addVertex(vertex: SessionVertex): void {
    this.vertices.set(vertex.id, vertex);
    if (!this.adjacency.has(vertex.id)) {
      this.adjacency.set(vertex.id, new Map());
    }
  }

  public addEdge(u: string, v: string, reason: 'batch' | 'faculty' | 'both'): void {
    if (u === v) return;
    this.adjacency.get(u)?.set(v, reason);
    this.adjacency.get(v)?.set(u, reason);
  }

  public buildConflictEdges(): number {
    const nodes = Array.from(this.vertices.values());
    let edgeCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const sameBatch = a.batchId === b.batchId;
        const sameFaculty = a.facultyId === b.facultyId;

        if (sameBatch || sameFaculty) {
          const reason: 'batch' | 'faculty' | 'both' =
            sameBatch && sameFaculty ? 'both' : sameBatch ? 'batch' : 'faculty';
          this.addEdge(a.id, b.id, reason);
          edgeCount++;
        }
      }
    }
    return edgeCount;
  }

  public getDegree(id: string): number {
    return this.adjacency.get(id)?.size ?? 0;
  }

  public getNeighbors(id: string): string[] {
    return Array.from(this.adjacency.get(id)?.keys() ?? []);
  }

  public getVertices(): SessionVertex[] {
    return Array.from(this.vertices.values());
  }

  public getVertexCount(): number {
    return this.vertices.size;
  }

  public getEdgeCount(): number {
    let total = 0;
    for (const neighbors of this.adjacency.values()) {
      total += neighbors.size;
    }
    return total / 2;
  }

  /**
   * Welsh-Powell Graph Coloring Algorithm.
   * Sorts vertices in descending order of degree and assigns the smallest
   * available color index (time slot bucket) not used by any neighbor.
   */
  public welshPowellColoring(): Map<string, number> {
    const sorted = this.getVertices().sort((a, b) => this.getDegree(b.id) - this.getDegree(a.id));
    const colors = new Map<string, number>();

    for (const vertex of sorted) {
      const usedNeighborColors = new Set<number>();
      for (const neighborId of this.getNeighbors(vertex.id)) {
        const c = colors.get(neighborId);
        if (c !== undefined) usedNeighborColors.add(c);
      }

      let color = 0;
      while (usedNeighborColors.has(color)) {
        color++;
      }
      colors.set(vertex.id, color);
    }

    return colors;
  }

  public toSnapshot(): {
    nodes: GraphNodeSnapshot[];
    edges: GraphEdgeSnapshot[];
    chromaticBound: number;
  } {
    const coloring = this.welshPowellColoring();
    let maxColor = 0;

    const nodes: GraphNodeSnapshot[] = this.getVertices().map((v) => {
      const colorIndex = coloring.get(v.id) ?? 0;
      if (colorIndex > maxColor) maxColor = colorIndex;
      return {
        id: v.id,
        label: `${v.batchName} · ${v.subjectCode} (#${v.sessionIndex})`,
        batchName: v.batchName,
        subjectCode: v.subjectCode,
        facultyName: v.facultyName,
        type: v.subjectType,
        degree: this.getDegree(v.id),
        colorIndex,
      };
    });

    const edges: GraphEdgeSnapshot[] = [];
    const seen = new Set<string>();
    for (const [u, neighbors] of this.adjacency.entries()) {
      for (const [v, reason] of neighbors.entries()) {
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: u, target: v, reason });
        }
      }
    }

    return {
      nodes,
      edges,
      chromaticBound: nodes.length > 0 ? maxColor + 1 : 0,
    };
  }
}
