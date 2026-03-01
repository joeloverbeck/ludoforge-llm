import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type {
  GameSpecBatchGlobalMarkerLattice,
  GameSpecDoc,
  GameSpecGlobalMarkerLatticeDef,
} from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isBatchEntry(
  entry: GameSpecGlobalMarkerLatticeDef | GameSpecBatchGlobalMarkerLattice,
): entry is GameSpecBatchGlobalMarkerLattice {
  return 'batch' in entry;
}

// ---------------------------------------------------------------------------
// Main expansion pass
// ---------------------------------------------------------------------------

export function expandBatchMarkers(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (doc.globalMarkerLattices === null || doc.globalMarkerLattices.length === 0) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  const expanded: GameSpecGlobalMarkerLatticeDef[] = [];
  let changed = false;

  for (const [entryIdx, entry] of doc.globalMarkerLattices.entries()) {
    if (!isBatchEntry(entry)) {
      expanded.push(entry);
      continue;
    }

    changed = true;
    const path = `globalMarkerLattices[${entryIdx}].batch`;

    // Validate: batch.ids must be non-empty
    if (entry.batch.ids.length === 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_IDS_EMPTY,
        path: `${path}.ids`,
        severity: 'error',
        message: 'batch.ids array must have at least one entry.',
      });
      continue;
    }

    // Validate: batch.defaultState must be in batch.states
    if (!entry.batch.states.includes(entry.batch.defaultState)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_DEFAULT_STATE_INVALID,
        path: `${path}.defaultState`,
        severity: 'error',
        message: `batch.defaultState "${entry.batch.defaultState}" is not in batch.states [${entry.batch.states.join(', ')}].`,
      });
      continue;
    }

    // Expand each ID into an individual marker declaration
    for (const id of entry.batch.ids) {
      expanded.push({
        id,
        states: entry.batch.states,
        defaultState: entry.batch.defaultState,
      });
    }
  }

  // Check for duplicate IDs across all entries
  const seenIds = new Set<string>();
  for (const [idx, marker] of expanded.entries()) {
    if (seenIds.has(marker.id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_DUPLICATE_ID,
        path: `globalMarkerLattices[${idx}]`,
        severity: 'error',
        message: `Duplicate global marker lattice id "${marker.id}" after batch expansion.`,
      });
    }
    seenIds.add(marker.id);
  }

  if (!changed) {
    return { doc, diagnostics };
  }

  return {
    doc: { ...doc, globalMarkerLattices: expanded },
    diagnostics,
  };
}
