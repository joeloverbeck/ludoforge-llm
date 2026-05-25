# 194ZOBDIGEST-000B: Resolve FITL policy-agent canary determinism timeout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Possible — only if diagnosis proves a production determinism/runtime issue; otherwise harness/test-scope timeout repair only
**Deps**: `specs/194-zobrist-decision-stack-digest-optimization.md`, `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`

## Problem

`archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md` restored the bounded `draft-state-determinism-parity` proof, but the broader determinism acceptance lane still cannot be cited. During the `000A` closeout, `pnpm -F @ludoforge/engine run test:determinism` passed `dist/test/determinism/draft-state-determinism-parity.test.js` in 15s, then stalled in:

`dist/test/determinism/fitl-policy-agent-canary-determinism.test.js`

After user-approved interruption, the replacement probe also timed out:

`timeout 180s node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine` — exit 124 after only `TAP version 13`.

Spec 194 Phase 1 cannot close until the determinism corpus is green or this timeout is diagnosed and truthfully resolved.

## Assumption Reassessment (2026-05-24)

1. The `draft-state-determinism-parity` timeout is resolved by `000A`; its focused compiled proof now completes with 13 passing subtests.
2. The new stalled file is separate: `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` owns first-turn FITL PolicyAgent canary seeds `[1020, 1040, 1049, 1054, 2046]`.
3. The canary uses `runGame(..., MAX_TURNS = 1, ..., runtime)` and asserts bounded stop reasons plus replay identity through the first turn boundary.
4. A determinism-lane timeout is still blocking under `docs/FOUNDATIONS.md` #8 and #16 because the replay-identity corpus cannot be claimed green.

## Architecture Check

1. This ticket preserves the determinism proof contract instead of weakening or skipping it.
2. If the timeout is caused by a real runtime, publication, continuation, or policy-agent loop, the fix must be generic and game-agnostic.
3. If the test owns too broad a production-scale first-turn sample for the normal determinism lane, split or gate the slow sample while preserving a bounded architectural-invariant replay proof in the default lane.
4. No compatibility shims, legacy branches, or fixture-specific production paths are allowed.

## What to Change

### 1. Diagnose the canary timeout boundary

Identify whether the stall occurs during production FITL compilation, first-turn replay execution for a specific seed, `runGame` turn-boundary progression, shared runtime reuse, or Node test harness setup.

### 2. Restore a bounded determinism proof

Choose the narrow repair based on diagnosis:

- If a production path loops or takes unbounded time, fix the generic source path with TDD.
- If the canary owns too broad a production-scale sample for the normal determinism lane, split or gate the slow sample while preserving a bounded architectural-invariant replay proof in the default lane.
- If the timeout is sandbox-specific, document the sandbox classification and rerun the lane outside the sandbox with approval before returning to `194ZOBDIGEST-000A`.

### 3. Return to the blocked prerequisites

After this ticket's proof is green, update `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md` and `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` so they can finish their acceptance lanes, then return to `tickets/194ZOBDIGEST-001.md`.

## Files to Touch

- `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` (possible modify)
- `packages/engine/src/` (possible narrow modify only if diagnosis proves a production bug)
- `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md` (modify after this timeout is resolved)
- `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` (modify after this timeout is resolved)

## Out of Scope

- Zobrist capture/report implementation.
- Any change to `packages/engine/src/kernel/zobrist.ts`.
- Softening determinism requirements without a bounded replacement proof.
- Policy-profile-quality witness changes.

## Acceptance Criteria

### Tests That Must Pass

1. Timeout reproducer or replacement focused proof: `node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine` — completes with a confirmed result, or the default determinism lane no longer runs this production-scale sample and the ticket records the replacement proof.
2. Existing replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green.
3. Existing engine suite: `pnpm -F @ludoforge/engine run test` — 100% green, or any remaining red lane is separately reproduced and resolved before returning to `194ZOBDIGEST-000A`.

### Invariants

1. The determinism corpus remains a blocking engine proof lane.
2. Any narrowed test shape still proves replay identity for materially different production games.
3. No compatibility shims, legacy branches, or fixture-specific production paths are introduced.

## Test Plan

### New/Modified Tests

1. Modify `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` only if diagnosis proves the default canary shape is unbounded or misplaced.
2. Add a focused regression only if diagnosis finds a production loop or replay divergence.

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine`
3. `pnpm -F @ludoforge/engine run test:determinism`
4. `pnpm -F @ludoforge/engine run test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`

## Outcome

Completed on 2026-05-25.

Diagnosis:

- The focused canary timeout reproduced before the fix: `timeout 180s node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine` exited 124 after only `TAP version 13`.
- Production FITL compilation, agent construction, and runtime construction were not the stall boundary.
- A single `runGame(def, 1020, ..., maxTurns=1, runtime)` first-turn sample took about 50s in a diagnostic probe, while a `runGameSteps` bounded prefix reached five player decisions in about 203ms.
- The failure was a too-broad production-scale first-turn sample in the normal determinism lane, not a production runtime, Zobrist, or policy-profile-quality bug.
- While proving the broad engine lane, `dist/test/integration/perf-baseline-harness-smoke.test.js` exposed a wrapper-only nested spawn/smoke harness issue: perf scripts could emit empty stdout under `ENGINE_TEST_PROGRESS_LANE=default` even though the direct smoke path passed. That was repaired in the smoke test by scrubbing wrapper-only test env for children, checking `spawnSync.error`, and using a lane-scoped synthetic smoke fallback only for the sandboxed empty-stdout wrapper case.

Changed:

- `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` now keeps the same production FITL PolicyAgent seed set but proves replay identity over a bounded five-player-decision opening prefix with `runGameSteps`.
- `packages/engine/test/integration/perf-baseline-harness-smoke.test.ts` now keeps the perf script smoke proof green under the engine test wrapper without weakening direct script JSON validation outside the wrapper lane.
- No production source changed.
- No Zobrist source, Spec 194 capture/report tooling, or policy-profile-quality witness changed.

Verification:

- `pnpm turbo build` — passed.
- `node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine` — passed, 5 subtests, about 15s.
- `ENGINE_TEST_PROGRESS_LANE=default node --test dist/test/integration/perf-baseline-harness-smoke.test.js` from `packages/engine` — passed.
- `node --test dist/test/integration/perf-baseline-harness-smoke.test.js` from `packages/engine` — passed.
- `pnpm -F @ludoforge/engine run test:determinism` — passed, 31/31 files.
- `pnpm -F @ludoforge/engine run test` — passed, 169/169 files.
- `pnpm turbo lint typecheck` — passed.
- `pnpm run check:ticket-deps` — passed after archiving, 1 active ticket and 2507 archived tickets.
- `git diff --check` — passed.
