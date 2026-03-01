import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type {
  GameSpecBatchVarDef,
  GameSpecDoc,
  GameSpecVarDef,
} from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isBatchEntry(
  entry: GameSpecVarDef | GameSpecBatchVarDef,
): entry is GameSpecBatchVarDef {
  return 'batch' in entry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BATCH_TYPES: ReadonlySet<string> = new Set(['int', 'boolean']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function expandVarField(
  entries: readonly (GameSpecVarDef | GameSpecBatchVarDef)[],
  fieldName: 'globalVars' | 'perPlayerVars',
  diagnostics: Diagnostic[],
): { readonly expanded: readonly GameSpecVarDef[]; readonly changed: boolean } {
  const expanded: GameSpecVarDef[] = [];
  let changed = false;

  for (const [entryIdx, entry] of entries.entries()) {
    if (!isBatchEntry(entry)) {
      expanded.push(entry);
      continue;
    }

    changed = true;
    const path = `${fieldName}[${entryIdx}].batch`;

    // Validate: batch.names must be non-empty
    if (entry.batch.names.length === 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_NAMES_EMPTY,
        path: `${path}.names`,
        severity: 'error',
        message: 'batch.names array must have at least one entry.',
      });
      continue;
    }

    // Validate: batch.type must be 'int' or 'boolean'
    if (!VALID_BATCH_TYPES.has(entry.batch.type)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_INVALID_TYPE,
        path: `${path}.type`,
        severity: 'error',
        message: `batch.type "${String(entry.batch.type)}" is not valid. Must be "int" or "boolean".`,
      });
      continue;
    }

    // Validate: for int batches, init must be within [min, max]
    if (entry.batch.type === 'int') {
      if (
        isFiniteNumber(entry.batch.init) &&
        isFiniteNumber(entry.batch.min) &&
        isFiniteNumber(entry.batch.max) &&
        (entry.batch.init < entry.batch.min || entry.batch.init > entry.batch.max)
      ) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_INT_INIT_OUT_OF_RANGE,
          path: `${path}.init`,
          severity: 'error',
          message: `batch.init ${entry.batch.init} is outside [${entry.batch.min}, ${entry.batch.max}].`,
        });
        continue;
      }
    }

    // Expand each name into an individual var declaration
    for (const name of entry.batch.names) {
      if (entry.batch.type === 'boolean') {
        expanded.push({ name, type: entry.batch.type, init: entry.batch.init });
      } else {
        expanded.push({
          name,
          type: entry.batch.type,
          init: entry.batch.init,
          min: entry.batch.min,
          max: entry.batch.max,
        });
      }
    }
  }

  // Check for duplicate names within this field
  const seenNames = new Set<string>();
  for (const [idx, varDef] of expanded.entries()) {
    if (seenNames.has(varDef.name)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_DUPLICATE_NAME,
        path: `${fieldName}[${idx}]`,
        severity: 'error',
        message: `Duplicate variable name "${varDef.name}" after batch expansion.`,
      });
    }
    seenNames.add(varDef.name);
  }

  return { expanded, changed };
}

// ---------------------------------------------------------------------------
// Main expansion pass
// ---------------------------------------------------------------------------

export function expandBatchVars(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  const hasGlobalVars = doc.globalVars !== null && doc.globalVars.length > 0;
  const hasPerPlayerVars = doc.perPlayerVars !== null && doc.perPlayerVars.length > 0;

  if (!hasGlobalVars && !hasPerPlayerVars) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  let nextDoc = doc;

  if (hasGlobalVars) {
    const result = expandVarField(doc.globalVars!, 'globalVars', diagnostics);
    if (result.changed) {
      nextDoc = { ...nextDoc, globalVars: result.expanded };
    }
  }

  if (hasPerPlayerVars) {
    const result = expandVarField(doc.perPlayerVars!, 'perPlayerVars', diagnostics);
    if (result.changed) {
      nextDoc = { ...nextDoc, perPlayerVars: result.expanded };
    }
  }

  return { doc: nextDoc, diagnostics };
}
