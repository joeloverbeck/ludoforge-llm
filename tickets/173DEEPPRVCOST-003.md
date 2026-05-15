# 173DEEPPRVCOST-003: Phase 1 — Train continuedDeepening token-state-index residual closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — preview-drive/token-state-index reuse path
**Deps**: `tickets/173DEEPPRVCOST-002.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-002` closed the encoded-state build counter axis for the dominant train continuedDeepening classes, but the post-002 witness still shows red train elapsed-time gates:

- `train:chooseNStep:add | continuedDeepening`: slow mean `2,537.9756 ms`, still above the ticket-002 `≤1,800 ms` gate.
- `train:chooseNStep:confirm | continuedDeepening`: slow mean `1,781.6475 ms`, still above the ticket-002 `≤1,300 ms` gate.
- Slowest seed `1005`: `107,468.38 ms`, still above the Spec 173 soft target of `≤60 s`.

The same post-002 rollup shows encoded builds at `0` for both train classes, while token-state-index work remains concentrated in the residual train path:

- `train:chooseNStep:add`: `33,203` token index builds across `62` decisions.
- `train:chooseNStep:confirm`: `6,242` token index builds across `94` decisions.

This ticket owns the next non-overlapping train continuedDeepening residual axis: token-state-index churn after encoded-state builds have been eliminated.

## Assumption Reassessment (2026-05-15)

1. **The encoded-build axis is not the remaining owner.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.md`: both train rows have `0` encoded builds and `0` encoded misses.
2. **The train time gate remains red.** Confirmed by the same witness: slow means remain above `≤1,800 ms` and `≤1,300 ms`, and slowest seed `1005` remains above the `≤60 s` soft target.
3. **Token-state-index counters are the next train residual signal.** Confirmed by the post-002 train rows: `33,203` and `6,242` token index builds remain on the two train classes while encoded builds are gone.
4. **This is not a duplicate of ticket 002.** Ticket 002 owns encoded-state projection cache reuse and remains blocked because its elapsed gate is red. This ticket starts from the post-002 state where encoded builds are already zero and owns only the residual token-state-index churn.
5. **Foundation alignment requires another measured slice, not silent widening.** Foundation #15 requires naming the residual root cause instead of hiding it in ticket 002; Foundation #16 requires a witness-driven proof; Foundation #10 preserves existing preview-drive bounds.

## Architecture Check

1. **One-axis discipline is preserved.** This ticket targets one residual counter family: token-state-index churn in the same train continuedDeepening workload after encoded-state builds are gone.
2. **Engine-agnostic boundary preserved.** Any fix must operate on generic `GameState`, `GameDefRuntime`, token-state-index, draft-token-index, or preview-drive runtime structures. No FITL-specific branching, action ids, card ids, or profile mutation.
3. **No backwards-compatibility shims.** Retire or replace any duplicated cache path in the same change. Do not leave parallel old/new token-index routes.
4. **Determinism remains load-bearing.** Cache warmth or draft-index reuse must not alter final state, decision streams, preview status, trace content, or aggregate `compositeScore`.

## What to Change

### 1. Investigate the residual token-state-index churn

Use the post-002 witness as the baseline. Identify why train continuedDeepening still builds token indexes thousands of times after encoded-state builds are zero. Candidate seams to inspect:

- `packages/engine/src/kernel/token-state-index.ts` — persistent and draft token-state-index cache behavior.
- `packages/engine/src/agents/policy-preview.ts` — `driveSyntheticCompletion` and draft index attach/copy cadence.
- `packages/engine/src/agents/microturn-option-evaluator.ts` / `microturn-option-eval.ts` — inner microturn scoring calls that may repeatedly request token-index backed reads.
- `packages/engine/src/kernel/resolve-ref.ts` / query paths that consume token-state indexes.

Document the chosen residual owner in this ticket's `Outcome` section before terminal closeout.

### 2. Implement the smallest generic token-index residual fix

The fix may be a run-local cache, draft-index reuse improvement, reduced attach/copy cadence, or another generic token-index constant-factor reduction. It must:

- Preserve immutable caller-visible `GameState` semantics.
- Preserve run-local cache reset behavior across `forkGameDefRuntimeForRun`.
- Avoid weakening token occurrence, duplicate-id, visibility, or query semantics.
- Avoid changing preview-drive bounds, policy profile data, or FITL rules.

### 3. Re-run the witness

Run the same post-Phase-1 witness with a fresh date/label after the fix lands. The report must show whether token-state-index counts and train slow means improved.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (likely modify)
- `packages/engine/src/agents/policy-preview.ts` (possible modify)
- `packages/engine/src/agents/microturn-option-evaluator.ts` or `packages/engine/src/agents/microturn-option-eval.ts` (possible modify)
- `packages/engine/src/kernel/resolve-ref.ts` (possible modify)
- `packages/engine/test/kernel/token-state-index-incremental.test.ts` or nearby token-index tests (modify/add)
- `packages/engine/test/perf/agents/<descriptive>.perf.test.ts` (modify/add counter witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-003 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-003 witness)

## Out of Scope

- Encoded-state projection cache changes already owned by `tickets/173DEEPPRVCOST-002.md`.
- Coup/govern/event residual axes unless the post-003 witness makes one of them the next selected Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, apply, publication, or microturn protocol semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Focused token-index correctness and cache-lifecycle tests for the chosen residual fix.
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
2. Confirm train token-index counts drop materially versus the post-002 baseline:
   - `train:chooseNStep:add`: baseline `33,203`.
   - `train:chooseNStep:confirm`: baseline `6,242`.
3. Confirm train slow means improve materially versus post-002:
   - `train:chooseNStep:add`: baseline `2,537.9756 ms`.
   - `train:chooseNStep:confirm`: baseline `1,781.6475 ms`.
4. Confirm aggregate harness parity when feasible:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # compositeScore must match -3.1333; errors=0; truncated=0
   ```

### Invariants

1. **Determinism preserved.** Cache warmth changes no observable game result or trace semantics.
2. **Token occurrence semantics preserved.** Duplicate-id, multi-occurrence, visibility, and zone/token query behavior remain byte-equivalent to the uncached/fresh path.
3. **Run-local lifetime preserved.** Any mutable or state-keyed token-index cache resets at run boundaries and cannot leak mutable descendants across runs.
4. **Engine-agnostic boundary preserved.** No FITL-specific ids or rule branches enter engine code.
5. **Measured residual handled truthfully.** If token-index counts drop but train elapsed gates remain red, record the remaining owner rather than marking Spec 173 complete by assertion.

## Test Plan

### New/Modified Tests

1. Focused token-state-index cache/reuse test — proves byte-equivalence to fresh index construction and run-local reset/immutability behavior for the chosen design.
2. Focused preview-drive/token-index perf witness — proves the optimized train residual path activates and reports the token-index counter movement.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused token-index tests selected by the implementation.
3. Focused perf witness selected by the implementation.
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>`
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
6. Targeted determinism/equivalence gates listed above.
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`
9. `pnpm turbo test --force`
10. `pnpm run check:ticket-deps`
