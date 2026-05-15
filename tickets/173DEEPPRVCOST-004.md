# 173DEEPPRVCOST-004: Phase 1 — Train continuedDeepening decision-stack and projection-key cost closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Zobrist decision-stack digest / encoded-state projection-key reuse path
**Deps**: `tickets/173DEEPPRVCOST-003.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-003` closed the train continuedDeepening token-state-index counter axis, but the post-003 final witness still shows red train elapsed-time gates:

- `train:chooseNStep:add | continuedDeepening`: slow mean `2,438.9376 ms`, still above the ticket-002 `<=1,800 ms` gate.
- `train:chooseNStep:confirm | continuedDeepening`: slow mean `1,698.4784 ms`, still above the ticket-002 `<=1,300 ms` gate.
- Slowest seed `1005`: `104,515.38 ms`, still above the Spec 173 soft target of `<=60 s`.

The same post-003 final rollup shows token-index builds at `0` for both train classes. A diagnostic CPU profile of seed `1005` after the token-index fix shifted the remaining top self-time to decision-stack hashing and encoded-state projection-key construction:

- `digestEncodedDecisionStackFrame` / `zobristKey` in `packages/engine/src/kernel/zobrist.ts`.
- `encodeDecisionStackFrameDigestInput` in `packages/engine/src/kernel/zobrist.ts`.
- `stableStringify` / `encodedStateProjectionKey` in `packages/engine/src/agents/policy-encoded-state-cache.ts`.

This ticket owns the next non-overlapping train continuedDeepening residual axis after encoded builds and token-index builds have both been eliminated.

## Assumption Reassessment (2026-05-15)

1. **The token-index axis is no longer the remaining owner.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-003-final.md`: both train rows have `0` token index builds.
2. **The train time gate remains red.** Confirmed by the same witness: slow means remain above `<=1,800 ms` and `<=1,300 ms`, and slowest seed `1005` remains above the `<=60 s` soft target.
3. **The next residual is still generic engine work.** CPU profile samples point at decision-stack digest/key construction and encoded-state projection-key stringification, not FITL-specific rules or profile tuning.
4. **This is not a duplicate of tickets 002 or 003.** Ticket 002 owns encoded-state build elimination; ticket 003 owns token-state-index churn. This ticket starts from a state where both counters are zero and owns residual key/digest cost.
5. **Foundation alignment requires a measured slice, not scope inflation.** Foundation #15 requires naming the new root owner; Foundation #16 requires a witness-driven proof; Foundation #10 preserves existing preview-drive bounds.

## Architecture Check

1. **One-axis discipline is preserved.** This ticket targets projection/digest key construction cost in the same train continuedDeepening workload after encoded builds and token-index builds are gone.
2. **Engine-agnostic boundary preserved.** Any fix must operate on generic `GameState`, `GameDefRuntime`, Zobrist decision-stack digest caches, encoded-state projection caches, or preview-drive runtime structures. No FITL-specific branching, action ids, card ids, or profile mutation.
3. **No backwards-compatibility shims.** Retire or replace duplicated key/digest paths in the same change. Do not leave parallel old/new digest routes.
4. **Determinism remains load-bearing.** Cache warmth or key reuse must not alter final state, decision streams, preview status, trace content, hashes, or aggregate `compositeScore`.

## What to Change

### 1. Investigate residual key/digest cost

Use the post-003 final witness as the baseline. Identify why train continuedDeepening still spends substantial time in decision-stack digest and encoded projection-key construction after encoded-state and token-index counters are zero. Candidate seams to inspect:

- `packages/engine/src/kernel/zobrist.ts` — decision-stack frame digest encoding, digest caching, and run-local cache keys.
- `packages/engine/src/agents/policy-encoded-state-cache.ts` — projection-key construction and stable stringification.
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` / `policy-preview-inner.ts` — preview states that differ only in decision-stack/runtime metadata while sharing encoded-view state.
- `packages/engine/src/kernel/state-draft.ts` / apply paths if cloned state identity prevents existing WeakMap cache reuse.

Document the chosen residual owner in this ticket's `Outcome` section before terminal closeout.

### 2. Implement the smallest generic key/digest residual fix

The fix may be a run-local digest cache, projection-key reuse improvement, reduced stringify cadence, or another generic constant-factor reduction. It must:

- Preserve exact deterministic hashing and canonical equality semantics.
- Preserve run-local reset behavior across `forkGameDefRuntimeForRun`.
- Avoid weakening decision-stack identity, replay, Zobrist parity, or encoded-state cache collision safety.
- Avoid changing preview-drive bounds, policy profile data, or FITL rules.

### 3. Re-run the witness

Run the same post-Phase-1 witness with a fresh date/label after the fix lands. The report must show whether train slow means improved materially without reintroducing encoded-state or token-index builds.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (likely modify)
- `packages/engine/src/agents/policy-encoded-state-cache.ts` (likely modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (possible modify if adding a run-local cache field)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` or nearby preview-drive files (possible modify)
- `packages/engine/test/kernel/*zobrist*` or nearby digest/cache tests (modify/add)
- `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` or nearby cache tests (modify/add)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-004 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-004 witness)

## Out of Scope

- Encoded-state build elimination already owned by `tickets/173DEEPPRVCOST-002.md`.
- Token-state-index churn already owned by `tickets/173DEEPPRVCOST-003.md`.
- Coup/govern/event residual axes unless the post-004 witness makes one of them the next selected Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, apply, publication, or microturn protocol semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Focused decision-stack digest/projection-key correctness and cache-lifecycle tests for the chosen residual fix.
2. Determinism gates:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
3. Behavioural-drift check: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
4. Existing suite: `pnpm turbo test --force`.

### Manual Verification

1. Re-run the decomposition witness:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>
   ```
2. Confirm train encoded-state builds remain zero:
   - `train:chooseNStep:add`: `0`.
   - `train:chooseNStep:confirm`: `0`.
3. Confirm train token-index builds remain zero:
   - `train:chooseNStep:add`: `0`.
   - `train:chooseNStep:confirm`: `0`.
4. Confirm train slow means improve materially versus post-003 final:
   - `train:chooseNStep:add`: baseline `2,438.9376 ms`.
   - `train:chooseNStep:confirm`: baseline `1,698.4784 ms`.
5. Confirm aggregate harness parity when feasible:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # compositeScore must match -3.1333; errors=0; truncated=0
   ```

### Invariants

1. **Determinism preserved.** Cache warmth changes no observable game result, hash, trace semantics, or replay output.
2. **Projection-key collision safety preserved.** Encoded-state projection reuse remains guarded by exactly the fields consumed by encoded-state construction, or by a proven byte-equivalent canonical key.
3. **Decision-stack digest correctness preserved.** Any digest reuse remains byte-equivalent to `recomputeDecisionStackFrameDigest`.
4. **Run-local lifetime preserved.** Any new mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants across runs.
5. **Engine-agnostic boundary preserved.** No FITL-specific ids or rule branches enter engine code.
6. **Measured residual handled truthfully.** If key/digest costs drop but train elapsed gates remain red, record the remaining owner rather than marking Spec 173 complete by assertion.

## Test Plan

### New/Modified Tests

1. Focused digest/projection-key cache test — proves byte-equivalence to fresh digest/key construction and run-local reset/immutability behavior for the chosen design.
2. Focused preview-drive perf witness — proves the optimized train residual path activates and reports no regression in encoded-state or token-index counters.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused digest/projection-key tests selected by the implementation.
3. Focused perf witness selected by the implementation.
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>`
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
6. Targeted determinism/equivalence gates listed above.
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`
9. `pnpm turbo test --force`
10. `pnpm run check:ticket-deps`
