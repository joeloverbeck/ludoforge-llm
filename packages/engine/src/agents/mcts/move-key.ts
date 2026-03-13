/**
 * Canonical move serialization for MCTS node deduplication.
 *
 * `MoveKey` is a deterministic string encoding of a `Move` that is stable
 * across equivalent param insertion orders.  It is a pure function of the
 * move value — no RNG or state dependency.
 */

import type { Move, CompoundMovePayload } from '../../kernel/types-core.js';
import type { MoveParamValue } from '../../kernel/types-ast.js';

/** Opaque string key used to deduplicate concrete moves in the search tree. */
export type MoveKey = string;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function serializeParamValue(v: MoveParamValue): string {
  if (Array.isArray(v)) {
    // readonly MoveParamScalar[] — serialize each element in order
    return '[' + (v as readonly unknown[]).map(String).join(',') + ']';
  }
  return String(v);
}

function serializeSortedParams(params: Readonly<Record<string, MoveParamValue>>): string {
  const keys = Object.keys(params).sort();
  if (keys.length === 0) return '{}';
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(k + ':' + serializeParamValue(params[k]!));
  }
  return '{' + parts.join(',') + '}';
}

function serializeCompound(compound: CompoundMovePayload): string {
  // Recursively serialize the specialActivity Move
  const inner = serializeMove(compound.specialActivity);
  let s = 'C(' + inner + ',' + compound.timing;
  if (compound.insertAfterStage !== undefined) {
    s += ',ias:' + String(compound.insertAfterStage);
  }
  if (compound.replaceRemainingStages !== undefined) {
    s += ',rrs:' + String(compound.replaceRemainingStages);
  }
  return s + ')';
}

function serializeMove(move: Move): string {
  let s = move.actionId + serializeSortedParams(move.params);
  if (move.compound) {
    s += serializeCompound(move.compound);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic canonical string key for the given move.
 *
 * Guarantees:
 * - identical keys for moves with the same actionId + params + compound,
 *   regardless of param property insertion order;
 * - different keys for moves that differ in actionId, param values, or
 *   compound payload.
 */
export function canonicalMoveKey(move: Move): MoveKey {
  return serializeMove(move);
}
