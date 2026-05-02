# 149FITLEVNUMVM-009: Replace cloning path with PreviewDriveScope (F14 atomic cut)

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts`, `packages/engine/src/kernel/microturn/drive.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-006.md`, `archive/tickets/149FITLEVNUMVM-008.md`

## Problem

Phase 2's measurable gain comes from replacing the preview drive's per-step cloning with mutation + undo on the encoded view. This is a Foundation 14 atomic cut: the existing `applyPublishedDecisionFromPreviewStateNoFinalHash` cloning path is removed, replaced by `PreviewDriveScope.apply()` calls. The kernel's external `applyMove(state) → newState` contract is unchanged.

## Deferred Update (2026-04-30)

Ticket `149FITLEVNUMVM-017` fired the Phase 1 stop condition and the user approved a corrected plan that does not proceed into this old Phase 2 branch as the next active path. Do not implement this ticket unless it is explicitly reopened or rewritten after later VM-path profiling proves preview clone/apply cost is again the next generic bottleneck. The active path now continues at bytecode/VM tickets `149FITLEVNUMVM-011` through `016`.

## Outcome (2026-04-30)

Deferred and archived. The old Phase 2 cloning-path replacement branch is no
longer the active Spec 149 path after the Phase 1 stop-condition decision.
Reopen only with a new or rewritten ticket if later VM-path profiling proves
preview clone/apply cost is again the next generic bottleneck.

## Assumption Reassessment (2026-04-28)

1. `applyPublishedDecisionFromPreviewStateNoFinalHash` lives at `packages/engine/src/kernel/microturn/drive.ts:663` and is consumed from `packages/engine/src/agents/policy-preview.ts:887` (verified during spec 149 reassessment).
2. Ticket 006 has wired the encoded view into hot read paths; ticket 008 has landed `PreviewDriveScope` + mutation primitives. This ticket replaces the cloning path that consumes those.
3. F14 atomic cut applies — mechanically uniform replacement of a single private call site. Large effort rating is acceptable per spec §Phase 2 effort budget (~1-2 weeks).
4. Per spec §Phase 2, after this lands, per-card cost should be ≤ 3000 ms (≥50% gain from Phase 0 baseline).

## Architecture Check

1. F14 atomic cut: the cloning path is fully removed; no `_legacy` shim remains. Mechanical uniformity rationale: a single private call site is replaced with a structurally equivalent scoped-mutation pattern.
2. F11 scoped-mutation exception applies cleanly — the scope is private to a single synchronous effect-execution scope, isolated by ticket 008's regression test.
3. F8 determinism preserved — `finalize(scope)` recomputes the canonical hash via the existing `updateHash` machinery; replay-identity tests must stay green.
4. Outer kernel contract unchanged — agents continue calling `applyPublishedDecisionFromPreviewState` (or whatever the renamed/replaced public surface becomes); only the inner driving mechanism switches.

## What to Change

### 1. `packages/engine/src/agents/policy-preview.ts`

Replace the cloning path at line 887 with a scoped drive:
1. At drive entry, build a `PreviewDriveScope` from the input `GameState` + layout (using ticket 008's `createPreviewDriveScope`).
2. For each microturn step, call `applyDecision(scope, decision)` instead of cloning.
3. On synthetic completion or depth-cap exit, call `finalize(scope)` to get a canonical `GameState` for the drive's return value.
4. Delete the cloning helper imports and any now-dead intermediate helpers.

### 2. `packages/engine/src/kernel/microturn/drive.ts`

Delete `applyPublishedDecisionFromPreviewStateNoFinalHash` (line 663) — it has no remaining consumers after step 1. Per F14, no fallback retained.

If the function has any non-preview consumers (verify via grep), surface them in the ticket comments and adjust scope. Ticket 006's blast-radius analysis suggests the only consumer is `policy-preview.ts:887`, but verify at implementation time.

### 3. Tighten the perf gate

Update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (created in ticket 007): tighten the budget from 5500 ms to 3000 ms per spec §Phase 2 acceptance.

### 4. Profiling smoke gate

After this ticket lands, run a one-card FITL profile:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase2-smoke
```
Record the `elapsedMs` and per-bucket attribution in this ticket's Outcome.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/kernel/microturn/drive.ts` (modify — delete `applyPublishedDecisionFromPreviewStateNoFinalHash`)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (modify — tighten to 3000 ms)

## Out of Scope

- Property tests for trajectory equivalence (ticket 010).
- Bytecode VM A/B integration (ticket 015).
- Closure-tree deletion (ticket 016).

## Acceptance Criteria

### Tests That Must Pass

1. Replay-identity tests stay green on ALL 10 determinism shards (`zobrist-incremental-parity-fitl-seed-{42,123}`, `fitl-{short,medium}-zobrist`, `grant-canary`, etc.).
2. Existing `chooseN` and `chooseOne` correctness tests pass unchanged.
3. Per-card cost ≤ 3000 ms gate passes on all 4 baseline profiles.
4. The deleted `applyPublishedDecisionFromPreviewStateNoFinalHash` has no surviving import sites (verify via `grep -rn applyPublishedDecisionFromPreviewStateNoFinalHash packages/engine/src`).
5. Existing suite: `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:perf`.

### Invariants

1. Outer kernel contract `applyMove(state) → newState` is byte-identical to pre-ticket behavior on every trajectory.
2. F11 scoped-mutation exception isolation is preserved (ticket 008's regression test continues to pass).
3. Per F14, no `_legacy` cloning fallback retained.
4. Canonical hashing unchanged.

## Test Plan

### New/Modified Tests

1. None new in this ticket — ticket 010 owns the property tests for trajectory equivalence.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test`.
3. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js`.
4. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase2-smoke` (record in Outcome).
5. `pnpm -F @ludoforge/engine test:perf`.
6. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
