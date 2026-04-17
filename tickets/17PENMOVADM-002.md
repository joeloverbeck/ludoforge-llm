# 17PENMOVADM-002: Migrate enumeration layer to shared admissibility classifier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/legal-moves.ts`
**Deps**: `archive/tickets/17PENMOVADM-001.md`

## Problem

`packages/engine/src/kernel/legal-moves.ts:327-354` currently implements an inline admissibility check inside `classifyEnumeratedMoves`. Per Spec 17 Foundation #14 direction, this inline check must be replaced atomically by a call into the shared `classifyMoveAdmissibility` module landed in ticket 001 — no compatibility shims, no dual code paths.

## Assumption Reassessment (2026-04-17)

1. `classifyEnumeratedMoves` at `packages/engine/src/kernel/legal-moves.ts` runs the inline admissibility check at lines 327-354 after viability probing. Confirmed via read.
2. The warning code `MOVE_ENUM_PROBE_REJECTED` with `reason: 'decisionSequenceUnsatisfiable'` is emitted at lines 344-351. The code is defined in `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts`, and referenced in `packages/engine/schemas/Trace.schema.json`. Schema-level code preservation is required — no change to the warning contract.
3. Today's enumeration-layer behavior: rejects only when admission returns `'unsatisfiable'`. Moves whose admission returns `'satisfied'` or `'unknown'` are kept (added to `classified` array). Ticket 001 documents this as layer-specific policy that must be preserved here.
4. Ticket 001 exports `classifyMoveAdmissibility` with an `inadmissible` verdict that distinguishes `'floatingUnsatisfiable'` from `'floatingUnresolved'` — the enumeration layer maps only the former to rejection, and keeps the latter (matching today's behavior).

## Architecture Check

1. Foundation #15: one source of truth for the admissibility predicate. Layer-specific policy (which inadmissible reasons to reject at this layer) remains at the call site.
2. Foundation #14: the inline check is deleted in this ticket's diff — no `_legacy` code path retained.
3. Foundation #16: existing regression tests (`classified-move-parity.test.ts`, `fitl-seed-stability.test.ts`, `legal-moves.test.ts`) prove the behavior is unchanged. Cross-layer parity test lands in ticket 004.
4. Warning contract preserved: `MOVE_ENUM_PROBE_REJECTED` with `reason: 'decisionSequenceUnsatisfiable'` still emitted for floating-unsatisfiable moves — no schema change.

## What to Change

### 1. Replace inline admissibility check in `classifyEnumeratedMoves`

In `packages/engine/src/kernel/legal-moves.ts`, replace the block at lines 327-354:

```ts
// BEFORE (lines 327-354, approximate):
if (
  !viability.complete
  && viability.nextDecision === undefined
  && viability.nextDecisionSet === undefined
  && viability.stochasticDecision === undefined
) {
  const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(...);
  if (admission === 'unsatisfiable') {
    warnings.push({
      code: 'MOVE_ENUM_PROBE_REJECTED',
      message: 'Enumerated legal move was rejected by decision-sequence admission and removed.',
      context: {
        actionId: String(move.actionId),
        reason: 'decisionSequenceUnsatisfiable',
      },
    });
    continue;
  }
}
```

With:

```ts
// AFTER:
const admissibility = classifyMoveAdmissibility(def, state, move, viability, runtime);
if (admissibility.kind === 'inadmissible' && admissibility.reason === 'floatingUnsatisfiable') {
  warnings.push({
    code: 'MOVE_ENUM_PROBE_REJECTED',
    message: 'Enumerated legal move was rejected by decision-sequence admission and removed.',
    context: {
      actionId: String(move.actionId),
      reason: 'decisionSequenceUnsatisfiable',
    },
  });
  continue;
}
// All other verdicts (complete, pendingAdmissible/*, floatingUnresolved) fall through to the
// existing classified.push({...}) path below — preserving today's enumeration-layer policy
// of keeping floating-unresolved moves (admission 'satisfied' or 'unknown').
```

Remove the now-unused direct import of `classifyMoveDecisionSequenceAdmissionForLegalMove` from this file if no other call site in `legal-moves.ts` uses it (verify via grep before removing). Add `classifyMoveAdmissibility` import.

### 2. Verify no other `legal-moves.ts` code path still performs redundant admissibility logic

Grep the file post-edit; ensure only the new classifier call exists.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)

## Out of Scope

- `playable-candidate.ts` migration (ticket 003)
- New parity tests (ticket 004)
- Any change to `probeMoveViability`, `classifyMoveDecisionSequenceAdmissionForLegalMove` internals, or warning schema
- Changes to the `MISSING_BINDING_POLICY_CONTEXTS` or budget-resolution code paths (classifier owns those calls now)

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/classified-move-parity.test.ts` green — FITL and Texas Hold'em parity unchanged.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` green.
3. `packages/engine/test/unit/legal-moves.test.ts` green.
4. `packages/engine/test/integration/fitl-seed-stability.test.ts` green — seeds 1000, 1007, 1008, 1013 still resolve cleanly (Spec 132 fix preserved); seed 1010 tolerance retained.
5. `packages/engine/test/unit/kernel/move-admissibility.test.ts` green (from ticket 001).
6. Full engine suite: `pnpm turbo test`.

### Invariants

1. `enumerateLegalMoves` return shape unchanged: `{ moves: ClassifiedMove[]; warnings: RuntimeWarning[] }` with identical field semantics.
2. `MOVE_ENUM_PROBE_REJECTED` warning continues to be emitted for floating-unsatisfiable moves with the same `context.reason === 'decisionSequenceUnsatisfiable'` payload. Schema (`Trace.schema.json`, `schemas-core.ts`) unchanged.
3. Determinism preserved: same `(def, state)` → byte-equal `ClassifiedMove[]` and `warnings` ordering.
4. No moves are newly-rejected or newly-kept versus pre-migration behavior (layer policy: reject only `floatingUnsatisfiable`, keep everything else the classifier reports).

## Test Plan

### New/Modified Tests

1. No new tests required for this ticket. Ticket 004 adds the cross-layer parity test that locks in the shared-classifier invariant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-stability.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
