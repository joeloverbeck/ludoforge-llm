import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpansionPassResult {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ExpansionPass {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly expand: (doc: GameSpecDoc) => ExpansionPassResult;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface ExpansionOrigin {
  readonly pass: string;
  readonly template?: string;
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

export function substitutePlaceholders(
  pattern: string,
  values: Readonly<Record<string, string | number>>,
): { readonly result: string; readonly unresolved: readonly string[] } {
  const unresolved: string[] = [];
  const result = pattern.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (name in values) {
      return String(values[name]);
    }
    unresolved.push(name);
    return `{${name}}`;
  });
  return { result, unresolved };
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

export function topologicalSortPasses(passes: readonly ExpansionPass[]): readonly ExpansionPass[] {
  const idToPass = new Map<string, ExpansionPass>();
  for (const pass of passes) {
    idToPass.set(pass.id, pass);
  }

  // Validate all dependencies reference known passes
  for (const pass of passes) {
    for (const dep of pass.dependsOn) {
      if (!idToPass.has(dep)) {
        throw new Error(
          `Expansion pass "${pass.id}" depends on unknown pass "${dep}".`,
        );
      }
    }
  }

  // Build in-degree map and adjacency list
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const pass of passes) {
    inDegree.set(pass.id, pass.dependsOn.length);
    if (!dependents.has(pass.id)) {
      dependents.set(pass.id, []);
    }
    for (const dep of pass.dependsOn) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep)!.push(pass.id);
    }
  }

  // Seed queue with zero-in-degree nodes (preserving input order for determinism)
  const queue: string[] = [];
  for (const pass of passes) {
    if (inDegree.get(pass.id) === 0) {
      queue.push(pass.id);
    }
  }

  const sorted: ExpansionPass[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(idToPass.get(id)!);

    for (const dependent of dependents.get(id) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== passes.length) {
    const remaining = passes
      .filter((p) => !sorted.some((s) => s.id === p.id))
      .map((p) => p.id);
    throw new Error(
      `Cycle detected among expansion passes: [${remaining.join(', ')}].`,
    );
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

export function runExpansionPipeline(
  passes: readonly ExpansionPass[],
  doc: GameSpecDoc,
): ExpansionPassResult {
  const sorted = topologicalSortPasses(passes);
  const allDiagnostics: Diagnostic[] = [];
  let current = doc;

  for (const pass of sorted) {
    const result = pass.expand(current);
    current = result.doc;
    allDiagnostics.push(...result.diagnostics);
  }

  return { doc: current, diagnostics: allDiagnostics };
}
