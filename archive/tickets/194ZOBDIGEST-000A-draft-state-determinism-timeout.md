# 194ZOBDIGEST-000A: Resolve draft-state determinism parity timeout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Possible — only if diagnosis proves a production determinism/runtime issue; otherwise harness/test-scope timeout repair only
**Deps**: `specs/194-zobrist-decision-stack-digest-optimization.md`, `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`, `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`

## Problem

`archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` restored the focused Spec 161 default-off snapshot witness, but the broader determinism acceptance lane still cannot be cited. During the prerequisite closeout, `pnpm -F @ludoforge/engine run test:determinism` progressed through the first two determinism files and then stalled in:

`dist/test/determinism/draft-state-determinism-parity.test.js`

The replacement probes also timed out:

1. `timeout 120s node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` — exit 124 after only `TAP version 13`.
2. `timeout 600s node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` — exit 124 after only `TAP version 13`.

Spec 194 Phase 1 cannot close until the determinism corpus is green or this timeout is diagnosed and truthfully resolved.

## Assumption Reassessment (2026-05-24)

1. The focused Spec 161 default-off witness is now green after regenerating `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json`.
2. The stalled file is separate from the snapshot repair: `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` compiles production FITL and Texas GameDefs and runs curated replay parity seeds.
3. No production source changed in the prerequisite before this timeout surfaced.
4. A determinism-lane timeout is still blocking under `docs/FOUNDATIONS.md` #8 and #16 because the replay-identity corpus cannot be claimed green.

## Architecture Check

1. This ticket preserves the determinism proof contract instead of weakening or skipping it.
2. If the timeout is caused by a real runtime or policy-agent loop, the fix must be generic and game-agnostic.
3. If the timeout is harness scale or environment-only, narrow the test/harness shape without reducing the architectural invariant it owns.
4. No compatibility shims, legacy branches, or fixture-specific production paths are allowed.

## What to Change

### 1. Diagnose the timeout boundary

Identify whether the stall occurs during production spec compilation, FITL replay execution, Texas replay execution, or Node test harness setup.

### 2. Restore a bounded determinism proof

Choose the narrow repair based on diagnosis:

- If a production path loops or takes unbounded time, fix the generic source path with TDD.
- If the test owns too broad a production-scale sample for the normal determinism lane, split or gate the slow sample while preserving a bounded architectural-invariant replay proof in the default lane.
- If the timeout is sandbox-specific, document the sandbox classification and rerun the lane outside the sandbox with approval before returning to `194ZOBDIGEST-000`.

### 3. Return to the blocked prerequisite

After this ticket's proof is green, update `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` so it can finish its acceptance lane, then return to `tickets/194ZOBDIGEST-001.md`.

## Files to Touch

- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (possible modify)
- `packages/engine/src/` (possible narrow modify only if diagnosis proves a production bug)
- `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md` (modify after this timeout is resolved)

## Out of Scope

- Zobrist capture/report implementation.
- Any change to `packages/engine/src/kernel/zobrist.ts`.
- Softening determinism requirements without a bounded replacement proof.
- Policy-profile-quality witness changes.

## Acceptance Criteria

### Tests That Must Pass

1. Timeout reproducer or replacement focused proof: `node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` — completes with a confirmed result, or the default determinism lane no longer runs this production-scale sample and the ticket records the replacement proof.
2. Existing replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green.
3. Existing engine suite: `pnpm -F @ludoforge/engine run test` — 100% green, or any remaining red lane is separately reproduced and resolved before returning to `194ZOBDIGEST-000`.

### Invariants

1. The determinism corpus remains a blocking engine proof lane.
2. Any narrowed test shape still proves replay identity for materially different production games.
3. No compatibility shims, legacy branches, or fixture-specific production paths are introduced.

## Test Plan

### New/Modified Tests

1. Modify `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` only if diagnosis proves the default sample shape is unbounded or misplaced.
2. Add a focused regression only if diagnosis finds a production loop or replay divergence.

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine`
3. `pnpm -F @ludoforge/engine run test:determinism`
4. `pnpm -F @ludoforge/engine run test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`

## Outcome

Blocked on 2026-05-24 after resolving this ticket's named draft-state timeout.

Diagnosis:

- `pnpm turbo build` completed before all compiled probes.
- `timeout 120s node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` reproduced the pre-ticket symptom before the fix: exit 124 after only `TAP version 13`.
- Direct compile probes showed production spec compilation was not the stall boundary: FITL compiled in 580ms and Texas compiled in 104ms.
- A Texas single replay completed quickly (`seed 2000`, 215ms).
- A FITL single full replay did not complete inside 60s. Iterator probing showed it advanced through hundreds of player/auto microturns while `turnCount` remained `0`, so the default `maxTurns: 200` budget did not bound the production-scale FITL opening window for this test.

Changed:

- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` now keeps the Texas full-run replay parity sample unchanged.
- The FITL half now uses a bounded-prefix replay proof over the same default curated seeds, stopping after five player decisions and asserting byte-identical state hashes plus identical reached prefix length across three runs.
- No production source changed.
- No Zobrist source, Spec 194 capture/report tooling, or policy-profile-quality witness changed.

Verification:

- `pnpm turbo build` — passed.
- `node --test dist/test/determinism/draft-state-determinism-parity.test.js` from `packages/engine` — passed, 13 subtests, ~14s.
- `pnpm -F @ludoforge/engine run test:determinism` — cleared `dist/test/determinism/draft-state-determinism-parity.test.js` in 15s, then stalled in the next file, `dist/test/determinism/fitl-policy-agent-canary-determinism.test.js`.
- User approved stopping the broad lane under the recommended 1-3-1 option 2. Replacement probe `timeout 180s node --test dist/test/determinism/fitl-policy-agent-canary-determinism.test.js` from `packages/engine` timed out with exit 124 after only `TAP version 13`.

Remaining blocker:

- The broad determinism corpus is still not citeable because the next active blocker is `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`.
- After `194ZOBDIGEST-000B` resolves the canary timeout, rerun `pnpm -F @ludoforge/engine run test:determinism`, then return to `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`.

Outcome amended: 2026-05-25.

`archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md` resolved the canary timeout with a bounded FITL PolicyAgent prefix proof. The broad acceptance lanes are now citeable again:

- `pnpm -F @ludoforge/engine run test:determinism` — passed, 31/31 files.
- `pnpm -F @ludoforge/engine run test` — passed, 169/169 files.

This ticket's draft-state bounded-prefix repair remains unchanged, and no production source, Zobrist source, Spec 194 capture/report tooling, or policy-profile-quality witness changed here.
