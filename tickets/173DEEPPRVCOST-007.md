# 173DEEPPRVCOST-007: Phase 1 - Train decision-stack digest residual closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - generic decision-stack digest/encoding cost closure or Phase-N classification
**Deps**: `tickets/173DEEPPRVCOST-006.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-006` classified one safe non-overlapping train `continuedDeepening` candidate as red and reverted it. The retained evidence still leaves Spec 173 active:

- Post-005 baseline slowest seed `1005`: `72,522.37 ms`, above the Spec 173 `<=60 s` soft target.
- Post-005 baseline train rows remain above the Phase 1 spread criterion:
  - `train:chooseNStep:confirm`: slow mean `797.6204 ms`, fast mean `0.0854 ms`, ratio `9339.8173`.
  - `train:chooseNStep:add`: slow mean `1608.7344 ms`, fast mean `354.207 ms`, ratio `4.5418`.
- The post-006 rejected-candidate report kept the same root shape: train add/confirm stayed the top slow-tier axes and the dominant bucket remained decision-stack digest/encoding work.

This ticket owns the next non-overlapping train residual: decision-stack frame encode/digest cost in train `continuedDeepening`. It must either land a generic byte-equivalent closure or prove that this residual is no longer a TS-side Phase 1 owner and should count toward the Spec 173 Phase-N escalation decision.

## Assumption Reassessment (2026-05-15)

1. **Ticket 006 did not retain runtime code.** Its choose-N preview no-entry-hash candidate was reverted after the decisive 15-seed witness was flat/regressive for train add/confirm.
2. **The train residual remains live.** `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md` and the rejected-candidate diagnostic both show train add/confirm as the top slow-tier axes.
3. **The selected owner is generic engine work.** Hot-path buckets point to `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame`, not FITL-specific rules, profile retuning, or authored action changes.
4. **This is not a duplicate of ticket 004.** Ticket 004 closed the train elapsed gates selected at that time. This ticket starts from the post-005/post-006 spread evidence and must avoid repeating the ticket-004 projection-key or trusted-baseline candidates unless new evidence proves a distinct missing coverage path.
5. **Foundation alignment requires a decision.** Foundation #15 requires either a generic closure or an explicit escalation classification; Foundation #16 requires the 15-seed witness to decide materiality.

## Architecture Check

1. **One-axis discipline is preserved.** The owned axis is decision-stack frame encode/digest cost for train `chooseNStep` `continuedDeepening`.
2. **Engine-agnostic boundary preserved.** Any fix must operate on generic decision-stack digest, preview-drive, Zobrist, or cache structures. No FITL action ids, faction branches, profile data, or preview-bound changes are allowed.
3. **No backwards-compatibility shims.** Replace the chosen hot path directly; do not retain parallel old/new digest routes.
4. **Determinism remains load-bearing.** Any digest reuse or encoding shortcut must remain byte-equivalent to fresh `recomputeDecisionStackFrameDigest` and preserve replay, trace, and hash semantics.

## What to Change

### 1. Inspect the digest/encoding residual

Use these reports as the starting evidence:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-006-choosen-preview-no-entry-hash.md`

Inspect `packages/engine/src/kernel/zobrist.ts`, `packages/engine/src/kernel/zobrist-phase-hash.ts`, and the train choose-N preview callers enough to identify whether the repeated digest work has a safe generic closure.

### 2. Implement a byte-equivalent generic closure, or classify escalation

If a safe non-overlapping owner remains, implement the smallest generic fix. It must:

- preserve byte-equivalence to fresh decision-stack digest construction;
- preserve run-local cache lifetime and fork/reset behavior;
- avoid stale parent-frame digest reuse;
- avoid relying on mutable decision-stack aliases;
- avoid changing preview-drive bounds, FITL rules, policy profiles, or action definitions.

If no safe generic closure remains, record the no-change classification with exact evidence and update Spec 173's Phase-N trigger state if the escalation condition is met.

### 3. Re-run the witness

Run the same 15-seed decomposition witness with a fresh date/label after the fix or classification. The report must show whether train spread improved, stayed irreducible, or triggers Spec 173 escalation.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (likely inspect/modify)
- `packages/engine/src/kernel/zobrist-phase-hash.ts` (possible inspect/modify)
- `packages/engine/src/kernel/microturn/drive.ts` or `packages/engine/src/kernel/microturn/apply.ts` (possible modify only if evidence proves a distinct safe caller path)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (possible inspect; do not repeat ticket 006's reverted no-entry-hash candidate)
- `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` or nearby Zobrist/cache tests (modify/add)
- `packages/engine/test/determinism/**/*zobrist*.test.ts` (modify/add only if needed)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-007 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-007 witness)
- `specs/173-deep-preview-drive-cost-reduction.md` (modify only if Phase-N escalation is triggered or the ticket list needs a status update)

## Out of Scope

- Repeating ticket 006's reverted choose-N preview no-entry-hash candidate.
- Reopening ticket 005's coup preview-state-drive closure.
- Reopening ticket 004's completed projection-key or trusted-baseline candidates unless new evidence proves a distinct missing coverage path.
- Govern/event residual axes unless the post-007 witness selects one as the next Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension code; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, publication, or microturn protocol semantic changes.

## Acceptance Criteria

### Tests That Must Pass

1. Focused Zobrist/decision-stack digest correctness and cache-lifecycle tests for any chosen residual fix, or a focused no-change proof if the outcome is escalation classification.
2. Determinism gates:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
3. Behavioural-drift check: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
4. Existing suite: `pnpm turbo test --force`, unless the final outcome is a no-code classification and the ticket records the narrower proof substitution.

### Manual Verification

1. Re-run the decomposition witness:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD> --profile-buckets
   ```
2. Confirm whether the train spread rows improve versus the post-005 baseline:
   - `train:chooseNStep:confirm` ratio baseline: `9339.8173`.
   - `train:chooseNStep:add` ratio baseline: `4.5418`.
3. Confirm whether slowest seed `1005` moves toward or below `<=60 s`.
4. If no TS-side owner remains, confirm the ticket and spec explicitly record whether Spec 173 §4.2(b) or §4.2(c) has fired.

### Invariants

1. **Determinism preserved.** Cache warmth or digest shortcuts change no observable game result, hash, trace semantics, or replay output.
2. **Engine-agnostic boundary preserved.** No FITL-specific ids, faction branches, or profile data enter engine code.
3. **Run-local lifetime preserved.** Any mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants.
4. **Decision-stack correctness preserved.** Any digest/frame reuse remains byte-equivalent to fresh digest construction.
5. **Measured residual handled truthfully.** If the remaining train spread does not yield a material non-overlapping TS-side improvement, record the escalation condition instead of marking Spec 173 complete by assertion.

## Test Plan

### New/Modified Tests

1. Focused digest/cache test for the chosen residual fix, or a focused diagnostic/proof artifact for no-code escalation classification.
2. Focused perf/counter witness where applicable - proves the optimized path activates or proves no non-overlapping owner remains.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused test(s) selected by implementation.
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD> --profile-buckets`
4. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
5. Targeted determinism/equivalence gates listed above.
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
8. `pnpm turbo test --force`
9. `pnpm run check:ticket-deps`
