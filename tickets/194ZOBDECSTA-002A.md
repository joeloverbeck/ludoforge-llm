# 194ZOBDECSTA-002A: Resolve Spec 140 replay-identity timeout before v2 Zobrist cut

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Possible — only if diagnosis proves a production replay/runtime issue; otherwise determinism-harness or test-scope timeout repair only
**Deps**: `archive/tickets/194ZOBDECSTA-001.md`

## Problem

Ticket `tickets/194ZOBDECSTA-002.md` changes the canonical Zobrist decision-stack-frame encoding and explicitly requires the replay-identity corpus (`pnpm -F @ludoforge/engine run test:determinism`) to pass at the new encoding. During the Phase 2 implementation attempt on 2026-05-25, the broad determinism lane reached `dist/test/determinism/spec-140-replay-identity.test.js` and then emitted only progress heartbeats. User-approved bounded replacement probes showed the same file timing out:

- Current implementation worktree: `timeout 180s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js` — exit 124 after only `TAP version 13`.
- Current implementation worktree: `timeout 600s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js` — exit 124 after only `TAP version 13`.
- Clean `HEAD` baseline worktree `/tmp/ludoforge-194-baseline`: same command with `timeout 600s` — exit 124 after only `TAP version 13`.

The clean-baseline timeout shows the stalled proof is pre-existing and not caused by the v2 encoded-surface reduction, but `docs/FOUNDATIONS.md` #8 and #16 do not allow `tickets/194ZOBDECSTA-002.md` to close a canonical hash migration without replay-identity proof. This prerequisite resolves or truthfully narrows the `spec-140-replay-identity` proof surface before returning to the v2 Zobrist cut.

## Assumption Reassessment (2026-05-25)

1. The v2 Zobrist implementation diff was restored before this ticket was created, so there is no half-landed canonical encoding change in the worktree.
2. `spec-140-replay-identity.test.js` is a dedicated determinism shard in `.github/workflows/engine-determinism.yml`; it is not merely incidental coverage in the default engine suite.
3. The repo-local runner budgets determinism files at 20 minutes, but the same focused file produced no subtest output within 600 seconds on clean `HEAD`, which is too slow to serve as a practical prerequisite witness for `194ZOBDECSTA-002` in this local loop.
4. `pnpm -F @ludoforge/engine run test` passed 170/170 files after the exploratory v2 edit, including `zobrist-canonical-key-byte-identity`, `zobrist-frame-digest-cache-equivalence`, and `perf-baseline-trajectory-identity`; that proof is useful context but does not replace the replay-identity corpus required by the canonical hash migration.

## Architecture Check

1. The ticket preserves Foundations #8 and #16 by making replay proof available before the Zobrist encoding change is allowed to close.
2. If diagnosis reveals a real replay/runtime loop, the fix must be generic and game-agnostic; no FITL- or Texas-specific production branch is allowed.
3. If diagnosis shows the problem is only harness scale, the repair should narrow or shard the proof without weakening the invariant that Spec 140 replay identity owns.
4. No compatibility path for `decision-stack-frame-v1`/`v2` is introduced here. The canonical encoding cut remains wholly owned by `tickets/194ZOBDECSTA-002.md`.

## What to Change

### 1. Diagnose the timeout boundary

- Reproduce `spec-140-replay-identity.test.js` with instrumentation sufficient to identify the long-running subtest or pre-test setup phase.
- Distinguish compile/setup time from FITL policy run time, Texas policy run time, and serialization/assertion time.
- Compare current `HEAD` behavior with a clean baseline or recent successful CI evidence when available.

### 2. Apply the smallest Foundations-aligned repair

- If a production determinism/runtime issue is found, write or identify the smallest failing witness first, fix the generic engine/runtime cause, and rerun the affected replay proof.
- If this is a harness-budget issue, shard, reduce, or gate the local proof shape while preserving the Spec 140 replay-identity invariant and CI coverage.
- If the test is simply expected to exceed local bounds, document the exact CI-backed replacement proof that `194ZOBDECSTA-002` may cite and update the active ticket accordingly.

### 3. Return the proof surface to `194ZOBDECSTA-002`

- Update `tickets/194ZOBDECSTA-002.md` only if the repaired or replacement proof command differs from its current Test Plan.
- Rerun the repaired focused proof and the relevant determinism lane or shard.
- Run `pnpm run check:ticket-deps`.

## Files to Touch

- `packages/engine/test/determinism/spec-140-replay-identity.test.ts` (modify if the repair is test/harness-local)
- `packages/engine/scripts/run-tests.mjs` or `packages/engine/scripts/test-lane-manifest.mjs` (modify only if lane repair is needed)
- `.github/workflows/engine-determinism.yml` (modify only if CI shard alignment is needed)
- `tickets/194ZOBDECSTA-002.md` (modify only if proof command ownership changes)

## Out of Scope

- Applying the v2 Zobrist encoded-surface reduction.
- Re-blessing pinned `stateHash` fixtures for the v2 encoding.
- Capturing the Phase 3 performance witness.
- Archiving Spec 194.

## Acceptance Criteria

### Tests That Must Pass

1. Focused replay proof for `spec-140-replay-identity` completes or is replaced by a documented repo-valid shard command that preserves the same invariant.
2. `pnpm -F @ludoforge/engine run test:determinism` passes, or `tickets/194ZOBDECSTA-002.md` is updated with a Foundations-aligned deterministic replacement proof accepted by the repo workflow.
3. `pnpm run check:ticket-deps` passes.

### Invariants

1. No canonical Zobrist encoding change lands in this ticket.
2. Replay identity remains proven by canonical serialized state/trace comparison, not by hash-only proxy evidence.
3. Any narrowed local proof remains aligned with the CI determinism shard for Spec 140.

## Test Plan

### New/Modified Tests

1. Modify or add only the smallest test/harness witness needed to make the Spec 140 replay-identity proof bounded and citeable.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js`
3. `pnpm -F @ludoforge/engine run test:determinism`
4. `pnpm run check:ticket-deps`
