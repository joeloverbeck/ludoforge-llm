# 114DEDCANMOV-002: Dedup post-template-completion playable outputs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents (`prepare-playable-moves`) and engine integration tests
**Deps**: `archive/tickets/114DEDCANMOV-001.md`, `specs/114-deduplicate-candidate-moves.md`

## Problem

`114DEDCANMOV-001` deduplicated classified input moves by `stableMoveKey`, but the live FITL duplicate incidence still survives after template completion. On 2026-04-06, the current FITL production spec at seed `6`, after the opening move on the VC decision state, produced `21` classified moves, `41` completed moves, and only `31` unique completed `stableMoveKey` values. `completionStatistics.duplicatesRemoved` remained `0`, proving the current duplicates are being introduced in template-completed playable outputs rather than in the classified-input layer.

## Assumption Reassessment (2026-04-06)

1. `114DEDCANMOV-001` now deduplicates classified inputs before viability/completion handling in `packages/engine/src/agents/prepare-playable-moves.ts` — confirmed.
2. On a current FITL VC decision reproducer (seed `6`, after the opening move), `preparePlayableMoves()` reports `totalClassifiedMoves: 21`, `duplicatesRemoved: 0`, `completedMoves: 41`, and `uniqueCompletedMoveKeys: 31` — confirmed live duplicate incidence at the output layer.
3. Sample duplicate completed keys currently occur for `rally`, `attack`, `terror`, and `tax` move identities, with repeated counts of `2` or `3` for the same `stableMoveKey` — confirmed.
4. The existing `duplicatesRemoved` counter and `skippedAsDuplicate` trace field can still own the corrected behavior, but they must now reflect duplicate playable outputs rather than only duplicate classified inputs — corrected boundary.
5. The right live integration test surface is `packages/engine/test/integration/fitl-policy-agent.test.ts`, which already contains FITL policy setup helpers and real decision-state probes — confirmed.

## Architecture Check

1. The clean fix point is where `preparePlayableMoves()` appends completed or stochastic playable outputs, because that is the layer where duplicate `stableMoveKey` values currently survive.
2. Dedup remains generic and engine-agnostic: it still operates only on `stableMoveKey` strings, with no FITL-specific branching in runtime code.
3. `duplicatesRemoved` should count the number of playable outputs skipped as duplicates regardless of whether they arose from direct complete moves or template completion attempts. No compatibility shim is needed; the field already exists and should simply reflect the corrected layer.

## What to Change

### 1. Dedup playable outputs by `stableMoveKey`

In `packages/engine/src/agents/prepare-playable-moves.ts`, move or extend deduplication so it guards the completed/stochastic output arrays rather than only the classified-input loop:

- maintain a `Set<string>` of playable-output `stableMoveKey` values already emitted
- when a direct complete move or template-completed/stochastic move would append a duplicate key, skip appending it and increment `duplicatesRemoved`
- preserve deterministic first-occurrence behavior

### 2. Prove the live FITL reproducer

Extend `packages/engine/test/integration/fitl-policy-agent.test.ts` with a reproducer for the current seed-`6` VC decision state that asserts:

- duplicate completed move keys existed before the fix
- post-fix `preparePlayableMoves()` returns unique playable move keys
- `completionStatistics.duplicatesRemoved` equals the number of skipped duplicate outputs

### 3. Keep ticket/spec boundary coherent

Update adjacent active-series wording if needed so the series no longer implies the duplicate incidence was fully fixed by input-layer dedup alone.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- Adjacent ticket/spec text if the corrected ownership needs to be recorded (modify if needed)

## Out of Scope

- Changing how `stableMoveKey` is computed
- Performance benchmarking
- New agent-specific logic outside `preparePlayableMoves()`
- Reworking the template completion system itself

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration reproducer proves the seed-`6` VC decision state now emits zero duplicate playable `stableMoveKey` values
2. `completionStatistics.duplicatesRemoved` is greater than `0` for that reproducer and matches the number of skipped duplicate outputs
3. Existing engine suite: `pnpm -F @ludoforge/engine test` passes
4. Workspace typecheck/lint: `pnpm turbo typecheck` and `pnpm turbo lint` pass

### Invariants

1. Deduplication is deterministic and preserves first occurrence by stable key (Foundation 8)
2. Deduplication remains generic and game-agnostic even though FITL provides the reproducer (Foundation 1)
3. The implementation does not mutate prior state or previously emitted move objects (Foundation 11)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — current seed-`6` VC reproducer for post-template-completion duplicates

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/integration/fitl-policy-agent.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-06
- What changed:
  - `preparePlayableMoves()` now deduplicates emitted playable outputs by `stableMoveKey` in addition to the earlier classified-input dedup, so duplicate complete/stochastic outputs from direct handling or template completion are skipped deterministically.
  - The live FITL VC seed-`6` reproducer is covered in integration tests, and unit coverage now asserts first-occurrence preservation and duplicate skipping across repeated completions.
  - `specs/114-deduplicate-candidate-moves.md` was corrected to reflect the verified two-layer duplicate model and the actual output-layer fix point.
- Deviations from original plan:
  - The ticket was rewritten before implementation because the live duplicate incidence was not in the classified-input layer described by the earlier series wording. The verified reproducer showed `21` classified moves, `41` completed moves, `31` unique completed keys, and `duplicatesRemoved = 0` before the fix.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test --test-name-pattern "deduplicates post-template-completion playable outputs" dist/test/integration/fitl-policy-agent.test.js`
  - `node --test dist/test/integration/fitl-policy-agent.test.js`
  - `node --test dist/test/unit/prepare-playable-moves.test.js dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
