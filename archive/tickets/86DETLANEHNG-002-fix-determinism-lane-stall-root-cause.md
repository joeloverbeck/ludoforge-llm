# 86DETLANEHNG-002: Reduce determinism lane wall time without weakening determinism proofs

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — determinism test(s) and/or generic engine runtime path identified by the lane audit
**Deps**: `docs/FOUNDATIONS.md`, `tickets/README.md`, `archive/tickets/86DETLANEHNG-001-harden-determinism-lane-runner.md`

## Problem

The dedicated determinism lane now completes successfully after `86DETLANEHNG-001`, but it still takes far too long to run for a proof lane. The observed wall time is dominated by overlapping FITL/Texas random-play campaigns that prove adjacent invariants at very high cost.

The repair must preserve the reason the lane exists: proving determinism. The right scope is to remove redundant proof effort and rebalance exact-vs-broad verification so the lane remains strong, bounded, and diagnostically useful. Do not "solve" this by skipping tests, deleting proof responsibility, or weakening determinism definitions.

## Assumption Reassessment (2026-03-27)

1. The determinism lane no longer stalls operationally; it passes end-to-end, but measured durations remain high. The main cost centers are `draft-state-determinism-parity` and the `zobrist-incremental-property-*` FITL shards.
2. The current lane is paying for three proof styles across overlapping production random-play surfaces:
   - replay determinism (`draft-state-determinism-parity`)
   - exact per-move incremental hash parity (`zobrist-incremental-parity`)
   - broad random-play hash-drift sweeps (`zobrist-incremental-property-*`)
3. The broad property sweep currently uses `verifyIncrementalHash: true`, which duplicates the exact per-move proof responsibility already owned by `zobrist-incremental-parity`.
4. Existing default/integration tests already cover several seeded determinism invariants on smaller fixtures, so the dedicated determinism lane should focus on unique production-scale proof responsibility rather than re-proving every nearby invariant at maximum cost.
5. Any optimization must respect Foundations 5, 6, 9, 10, and 11: determinism stays strict, computation stays bounded, no compatibility shims, and the resulting proof architecture must be cleaner than the current overlapping campaigns.

## Architecture Check

1. The clean outcome is a determinism lane whose proof units are bounded and non-overlapping enough that runtime tracks unique signal rather than duplicated effort.
2. Exact per-move incremental-hash verification should remain in one curated parity file; broad random-play campaigns should sample that invariant at intervals across many trajectories rather than paying full-recompute cost on every move.
3. Replay determinism should remain represented, but the expensive FITL seed count should be sized to its unique proof responsibility because broad trajectory coverage is already owned elsewhere in the lane.
4. No game-specific branching, seed exceptions, or skip-lists may be introduced. Determinism remains a generic kernel property, not a per-game special case.

## What to Change

### 1. Rebalance broad-vs-exact hash verification

- Keep `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` as the exact per-move incremental-hash oracle.
- Change the broader `zobrist-incremental-property-*` sweep to use interval-based incremental-hash verification so it still exercises many trajectories without recomputing the full hash on every move.
- Keep the change in shared determinism test helpers if possible so the broad proof family stays consistent.

### 2. Tighten replay parity to its unique responsibility

- Reduce the expensive FITL seed count in `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` to a smaller curated set that still proves replay determinism.
- Preserve the same determinism assertion: same seed must produce the same final hash or the same error.
- Update comments so the remaining seed counts and exact-vs-broad proof split are explicit.

### 3. Add or strengthen regression coverage

- Update the determinism tests themselves so their proof roles are explicit in code/comments.
- If helper behavior changes materially (for example interval verification semantics), add or strengthen focused coverage only where that ownership belongs.
- Never resolve the issue by deleting coverage unless the same invariant is clearly retained in a stronger or more precise proof unit.

### 4. Re-verify the determinism lane end-to-end

- Confirm the dedicated lane completes successfully after the optimization.
- Confirm the repaired tests still prove replay determinism and incremental-hash drift absence rather than only proving termination.

## Files to Touch

- `packages/engine/test/determinism/*.test.ts` (modify the proof campaigns after reassessment)
- `packages/engine/test/helpers/*` (modify shared determinism helpers for interval verification if needed)
- `packages/engine/test/unit/**` or `packages/engine/test/integration/**` (add/modify focused regression coverage only if helper semantics need explicit tests)

## Out of Scope

- Rewriting the entire determinism lane architecture beyond what `86DETLANEHNG-001` already owns
- Any skip/only quarantine mechanism for determinism tests
- Game-specific exceptions, fixture downgrades, or weaker determinism definitions
- Unrelated performance tuning outside the determinism proof corpus

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:determinism` completes successfully end-to-end with lower wall time than before.
2. Exact per-move incremental-hash verification is still covered by `zobrist-incremental-parity`.
3. Broad production random-play hash-drift coverage is still present in `zobrist-incremental-property-*`, but at lower cost.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Determinism coverage is preserved or strengthened, never weakened.
2. The proof corpus is more bounded and less redundant than before.
3. No backwards-compatibility aliases, fallback code paths, or game-specific carve-outs are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` — updated to use a smaller curated replay-parity seed set for the expensive FITL surface
2. `packages/engine/test/determinism/zobrist-incremental-property-*.test.ts` and shared helpers — updated so broad random-play drift coverage uses interval verification instead of exact per-move recomputation
3. `packages/engine/test/unit/` or `packages/engine/test/integration/` regression coverage — added only if helper semantics need explicit ownership outside the determinism lane files

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/determinism/draft-state-determinism-parity.test.js`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`
6. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-27

What actually changed:
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` now runs the broad `zobrist-incremental-property-*` sweep with interval-based incremental-hash verification instead of exact per-move recomputation, while leaving the exact oracle in `zobrist-incremental-parity.test.ts`.
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` now uses a smaller curated FITL seed set and keeps the broader Texas replay set, making the replay-parity proof match its unique responsibility.
- Ticket scope was corrected from “fix a stall” to “reduce wall time without weakening proofs” because the lane was already operational after `86DETLANEHNG-001`.

Deviations from original plan:
- The interval-based property sweep delivered less savings on FITL than expected, which indicates FITL random-play cost dominates more than full-hash recomputation in those shards. The largest win came from reducing the oversized FITL replay seed set.

Verification results:
- `pnpm -F @ludoforge/engine build` passed.
- `node --test packages/engine/dist/test/determinism/draft-state-determinism-parity.test.js` passed in about `7m 32s` after the replay-seed reduction.
- `pnpm -F @ludoforge/engine test:determinism` passed. Observed file durations were approximately `7m 34s`, `2m 58s`, `7m 1s`, `6m 20s`, `4m 36s`, `6m 19s`, and `8s`.
- Compared with the prior observed lane timings (`18m 59s`, `2m 47s`, `6m 52s`, `6m 16s`, `4m 41s`, `5m 38s`, `4s`), total wall time dropped from about `45m 17s` to about `34m 56s`.
- `pnpm turbo typecheck` passed.
- `pnpm turbo lint` passed.
- `pnpm turbo test` passed.
