# 173DEEPPRVCOST-007: Phase 1 - Train decision-stack digest residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - generic decision-stack digest/encoding cost closure or Phase-N classification
**Deps**: `archive/tickets/173DEEPPRVCOST-006.md`, `archive/specs/173-deep-preview-drive-cost-reduction.md`

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
- `archive/specs/173-deep-preview-drive-cost-reduction.md` (modify only if Phase-N escalation is triggered or the ticket list needs a status update)

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

## Outcome

**Completion date**: 2026-05-15.
Outcome amended: 2026-05-15.

### What Landed

- No runtime code is retained. Live source inspection confirmed the current safe digest substrate is already present: frame-identity `WeakMap` memoization plus run-local `zobristTable.frameDigestCache` keyed by the byte-equivalent encoded frame string.
- Captured the checked-in post-007 classification witness:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.csv`
- Classified a same-session JSON-segment cache candidate as rejected diagnostic evidence only. It produced seed-1005 smoke output under `/tmp/ludoforge-173-post-007-seed1005-smoke`, but no source/test diff was retained.

### Rejected Candidate Ledger

| Candidate | Correctness proof | Measurement | Verdict | Cleanup |
|---|---|---|---|---|
| Decision-stack JSON segment cache and manual exact-shape frame encoding | `pnpm -F @ludoforge/engine build` and focused Zobrist/cache tests passed while the candidate existed | seed-1005 smoke: `73,956.73 ms` vs post-006 seed-1005 baseline `72,072.03 ms`; train encode time was flat/slightly lower, digest time worsened, and emitted character counters changed on the same seed | not retained: no material improvement and not closeout-quality for a hash-sensitive digest ticket | runtime/test diff reverted; engine rebuilt; focused Zobrist/cache tests passed on final source |

### Measured Result and Phase-N Classification

| Metric | Post-006 baseline | Post-007 final | Delta | Verdict |
|---|---:|---:|---:|---|
| Slowest seed 1005 wall time | `72,072.03 ms` | `74,562.87 ms` | `+3.45%` | still red versus `<=60 s` |
| `train:chooseNStep:add` slow-tier total | `53,889.91 ms` | `54,468.25 ms` | `+1.07%` | no material improvement |
| `train:chooseNStep:confirm` slow-tier total | `39,129.56 ms` | `40,155.09 ms` | `+2.62%` | no material improvement |
| Hot class with slow:fast ratio >3x | yes | yes | unchanged | Phase 1 residual remains |

This ticket counts as a second consecutive non-improving Phase 1 slice after `173DEEPPRVCOST-006`. Spec 173 §4.2(c) has **not** fired yet because it requires three consecutive Phase 1 tickets with no measurable improvement. Spec 173 §4.2(b) has also not fired because the post-007 witness still reports slow-tier train axes above the spread criterion.

### Residual Owner

The remaining train decision-stack digest/encoding residual was not closed by a safe non-overlapping TS-side change in this ticket. Archived successor `archive/tickets/173DEEPPRVCOST-008.md` completed the final Spec 173 Phase 1 / Phase-N decision slice by recording the third consecutive no-improvement slice and triggering Spec 173 §4.2(c).

### Artifact Classification

- Checked-in diagnostic evidence: the post-007 final report and CSV listed above.
- Ignored/ephemeral diagnostic evidence: `/tmp/ludoforge-173-post-007-seed1005-smoke/*`.
- Generated schema/golden fallout: none; no source, schema, fixture, or generated contract diff is retained.

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | ran after reverting the rejected candidate | exit 0 |
| Focused tests | focused Zobrist/decision-stack digest correctness and cache-lifecycle tests | ran compiled direct subset after final rebuild | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js`; 13 tests passed |
| Decomposition witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD> --profile-buckets` | ran with `--date 2026-05-15-post-007-final` | exit 0; 15/15 seeds completed; report and CSV written |
| FITL rules / targeted determinism / equivalence / broad lanes | ticket-named final lanes | not run | no runtime code retained; focused Zobrist/cache proof plus measured classification are the final no-code proof surface |
| Dependency graph | `pnpm run check:ticket-deps` | ran after terminal/spec classification edit | passed for 4 active tickets and 2346 archived tickets |

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Determinism preserved | No runtime code retained after rejected candidate revert | proven by final diff classification plus focused Zobrist/cache tests | final diff; focused compiled tests |
| Engine-agnostic boundary preserved | No FITL ids, profile data, preview bounds, or rules changed | proven by final diff classification | final diff |
| Run-local lifetime preserved | Existing frame digest cache remains run-local; no new mutable cache retained | proven | `zobrist-frame-digest-cache-equivalence.test.js` |
| Decision-stack correctness preserved | Existing digest cache remains byte-equivalent to fresh recompute | proven | `zobrist-frame-digest-cache-equivalence.test.js` |
| Measured residual handled truthfully | Post-007 witness is red/flat; Phase-N trigger state classified | proven | post-007 final report |

### Source-Size Ledger

No source files have retained active growth. The inspected near-guidance implementation file `packages/engine/src/kernel/zobrist.ts` remains unchanged in the final diff.

### Late-Edit Proof Validity

The terminal status, outcome, and spec edits are no-retained-code classification and metric transcription after the final witness. They do not validate a retained runtime path. The focused Zobrist/cache tests ran after the final source rebuild and candidate revert; the measured witness report is the decisive classification artifact. The dependency-check transcription records the just-run graph check and changes no scope, acceptance, command semantics, dependency ownership, or proof claims; no empirical rerun is required.
