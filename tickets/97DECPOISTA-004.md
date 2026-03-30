# 97DECPOISTA-004: Serialization verification and property tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only (no production code changes expected)
**Deps**: tickets/97DECPOISTA-003.md

## Problem

Snapshots flow through the enrichment and serialization pipeline (`enrichTrace` → `writeEnrichedTrace`). While the spec claims this propagation is automatic (via spread), it must be verified with tests. Additionally, property tests must prove that snapshot extraction never modifies game state, and that `snapshotDepth: 'none'` adds zero overhead.

## Assumption Reassessment (2026-03-30)

1. `enrichTrace` (trace-enrichment.ts:9-30) spreads all `MoveLog` fields into `EnrichedMoveLog` via `...moveLog` — snapshot field should propagate. Must verify.
2. `writeEnrichedTrace` (trace-writer.ts:9-20) serializes via `JSON.stringify` after converting `stateHash` bigints to hex strings. Snapshot types contain only `number`, `string`, `boolean`, and plain objects — no BigInt or non-serializable fields. Must verify.
3. `EnrichedMoveLog extends MoveLog` (enriched-trace-types.ts:9) — TypeScript inheritance ensures type propagation. Must verify at runtime.
4. `serializeGameState` handles the `finalState` but `MoveLog` snapshots are separate plain objects — no special serialization needed. Must verify.

## Architecture Check

1. **Testing as Proof (Foundation #11)**: This ticket exists to PROVE the pipeline works, not assume it. Golden tests and property tests provide the proof.
2. **No production code changes expected**: If serialization works as designed, this ticket only adds tests. If a gap is found (e.g., snapshot fields dropped during enrichment), the fix is minimal and contained.
3. **Determinism (Foundation #5)**: Property test verifies snapshots don't break determinism by modifying state.
4. **Options-layer cleanup remains separate**: Any refactor that moves `snapshotDepth` out of kernel `ExecutionOptions` belongs in `tickets/97DECPOISTA-005.md`; this ticket should verify behavior, not reshape the sim/kernel API boundary.

## What to Change

### 1. Serialization round-trip test

New test in `packages/engine/test/integration/sim/snapshot-serialization.test.ts`:

- Run `runGame` with `snapshotDepth: 'standard'` on a minimal fixture
- Call `enrichTrace` on the result
- Verify `EnrichedMoveLog` entries retain `snapshot` fields with correct values
- Call `writeEnrichedTrace` to a temp file
- Read the file back and parse JSON
- Verify snapshot data survived serialization (field presence, value correctness)
- Clean up temp file

### 2. Property tests

In the same test file or `packages/engine/test/unit/sim/snapshot.test.ts` (from 002):

- **State immutability**: Run `extractDecisionPointSnapshot` at `'verbose'` depth, compare `computeStateHash(state)` before and after. Must be identical. Run on multiple random states.
- **Zero overhead for `'none'`**: Confirm that `runGame` with default options produces `MoveLog` entries where `snapshot` is `undefined` (not an empty object, not null — strictly absent or undefined).

### 3. Golden test with FITL (optional, if feasible)

In `packages/engine/test/integration/sim/snapshot-serialization.test.ts`:

- Compile FITL via `compileProductionSpec()`
- Run a short game (few turns, known seed) with `snapshotDepth: 'standard'`
- Verify snapshots contain FITL-specific data: 4 seat margins, per-player vars (resources, etc.), token counts
- This proves the feature works end-to-end with a real game, not just synthetic fixtures

## Files to Touch

- `packages/engine/test/integration/sim/snapshot-serialization.test.ts` (new)
- `packages/engine/test/unit/sim/snapshot.test.ts` (modify — add property tests if not already covered by 002)

## Out of Scope

- Changes to `enriched-trace-types.ts` — snapshot propagates via inheritance
- Changes to `trace-enrichment.ts` — snapshot propagates via spread
- Changes to `trace-writer.ts` — snapshot serializes cleanly as plain JSON
- Refactoring `runGame()` / `runGames()` to use a dedicated sim-local options type — tracked separately in `tickets/97DECPOISTA-005.md`
- Runner-side snapshot consumption or display
- Campaign harness integration (consumers own their `snapshotDepth` setting)
- Trace schema (`packages/engine/schemas/`) updates — snapshot is optional and additive; schema update can be a follow-up if needed
- Performance benchmarking of snapshot extraction

## Acceptance Criteria

### Tests That Must Pass

1. `node --test packages/engine/test/integration/sim/snapshot-serialization.test.ts` — all serialization round-trip tests pass
2. `pnpm turbo test` — no regressions
3. State immutability property test passes (hash before === hash after extraction)
4. Zero-overhead test passes (`'none'` depth produces no snapshot objects)

### Invariants

1. Snapshots survive `enrichTrace` → `writeEnrichedTrace` → JSON parse without data loss
2. Snapshot extraction is a pure read-only operation — game state is never modified (Foundation #7)
3. `snapshotDepth: 'none'` has zero memory/CPU overhead — no snapshot objects allocated
4. Snapshot field values match direct state inspection (turnCount, margins, variable values)
5. No BigInt or non-JSON-serializable values appear in snapshot objects

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/sim/snapshot-serialization.test.ts` — serialization round-trip, property tests, optional FITL golden test

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/sim/snapshot-serialization.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
