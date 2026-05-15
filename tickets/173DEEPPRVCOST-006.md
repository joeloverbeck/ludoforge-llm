# 173DEEPPRVCOST-006: Phase 1 - Train continuedDeepening residual spread closure

**Status**: BLOCKED by successor decision-stack digest residual
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - train continuedDeepening residual hot-axis classification or generic closure
**Deps**: `archive/tickets/173DEEPPRVCOST-005.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-005` materially improved the selected `coupArvnRedeployPolice:chooseOne | continuedDeepening` residual, but the post-005 witness still leaves Spec 173 incomplete:

- Slowest seed `1005`: `72,522.37 ms`, still above the Spec 173 `<=60 s` soft target.
- The witness still reports hot axes above the Phase 1 spread criterion:
  - `train:chooseNStep:confirm`: slow mean `797.6204 ms`, fast mean `0.0854 ms`, ratio `9339.8173`.
  - `train:chooseNStep:add`: slow mean `1608.7344 ms`, fast mean `354.207 ms`, ratio `4.5418`.
- The top slow-tier totals are still train continuedDeepening rows:
  - `train:chooseNStep:add | continuedDeepening`: 33 slow-tier decisions, `53,088.24 ms` total, `1,608.7344 ms` mean.
  - `train:chooseNStep:confirm | continuedDeepening`: 35 slow-tier decisions, `39,081.57 ms` total, `1,116.6162 ms` mean.

Ticket 004 closed the train elapsed gates selected at that time. This ticket owns the post-005 residual spread classification for the remaining train continuedDeepening hot axes. It must either land a non-overlapping generic closure or prove that the remaining train spread has no TS-side Phase 1 owner and should count toward the Spec 173 Phase-N escalation decision.

## Assumption Reassessment (2026-05-15)

1. **Spec 173 remains active.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md`: slowest seed `1005` is `72,522.37 ms`, above the `<=60 s` soft target.
2. **Ticket 005's selected coup residual improved materially.** The same witness shows `coupArvnRedeployPolice:chooseOne | continuedDeepening` improved from `38,938.6 ms` total / `748.8192 ms` mean to `23,415.95 ms` total / `450.3067 ms` mean.
3. **The next concrete residual is train spread, not another unmeasured guess.** The post-005 fast-vs-slow table still has train add/confirm above the Phase 1 `>2x` spread criterion, with both rows ahead of the coup/govern/event rows by slow-tier total.
4. **This is not a duplicate of ticket 004.** Ticket 004 closed the train elapsed gates with decision-stack/projection-key reuse. This ticket starts from the post-005 witness and must first prove whether any additional non-overlapping train continuedDeepening owner remains before coding more of the same cache shape.
5. **Foundation alignment requires an explicit classification.** Foundation #15 forbids leaving the remaining train spread implicit; Foundation #16 requires a witness-driven proof; Foundation #10 keeps existing preview-drive bounds unchanged.

## Architecture Check

1. **One-axis discipline is preserved.** The owned axis is post-005 train continuedDeepening spread, represented by the two train choose-N rows that still exceed the Phase 1 spread criterion.
2. **Engine-agnostic boundary preserved.** Any fix or classification must operate on generic preview-drive, decision-stack, query, cache, or publication structures. No FITL action ids, card ids, faction branches, or profile retuning may enter engine code.
3. **No backwards-compatibility shims.** If a generic closure lands, replace the chosen hot path directly and remove stale exploratory surfaces.
4. **Escalation remains truthful.** If investigation shows the remaining spread is irreducible TS deep-preview work or repeats already-exhausted owners, record that explicitly and use the Spec 173 Phase-N trigger path rather than inventing another micro-cache.

## What to Change

### 1. Classify the post-005 train residual

Use `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md` as the baseline. Inspect the train add/confirm hot-path buckets and, if needed, capture a focused seed-1005 profile or smaller train-row diagnostic.

Candidate seams to inspect:

- `packages/engine/src/kernel/zobrist.ts` - remaining decision-stack digest and frame-encoding work.
- `packages/engine/src/kernel/microturn/drive.ts` and `packages/engine/src/kernel/microturn/apply.ts` - no-final-hash and trusted-baseline coverage for train choose-N preview states.
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` and `packages/engine/src/agents/policy-preview.ts` - choose-N preview cadence and repeated intermediate decision-stack construction.
- `packages/engine/src/agents/policy-encoded-state-cache.ts` - projection-key reuse only if the new evidence proves it remains material after ticket 004.

Document the chosen owner or escalation classification in this ticket's `Outcome` before terminal closeout.

### 2. Implement the smallest generic closure, or classify escalation

If a non-overlapping TS-side owner remains, implement the smallest generic fix. It must:

- Preserve exact deterministic scoring, decision-stack hash, replay, and trace semantics.
- Preserve run-local reset behavior for any mutable or state-keyed cache.
- Avoid changing preview-drive bounds, policy profile data, FITL rules, or action definitions.
- Avoid duplicating ticket 004's completed decision-stack/projection-key cache shape unless new evidence proves a distinct missing coverage path.

If no non-overlapping owner remains, do not force a code change. Record the no-change classification with the exact evidence and update Spec 173's Phase-N trigger state if the escalation condition is met.

### 3. Re-run the witness

Run the same 15-seed decomposition witness with a fresh date/label after the fix or classification. The report must show whether train spread improved, stayed irreducible, or triggers Spec 173 escalation.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (possible modify)
- `packages/engine/src/kernel/microturn/drive.ts` or `packages/engine/src/kernel/microturn/apply.ts` (possible modify)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` or `packages/engine/src/agents/policy-preview.ts` (possible modify)
- `packages/engine/src/agents/policy-encoded-state-cache.ts` (possible modify only if evidence proves a remaining projection-key owner)
- `packages/engine/test/**/*zobrist*.test.ts`, `packages/engine/test/unit/agents/*`, or nearby focused tests selected by implementation (modify/add)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-006 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-006 witness)
- `specs/173-deep-preview-drive-cost-reduction.md` (modify only if Phase-N escalation is triggered or the ticket list needs a status update)

## Out of Scope

- Reopening ticket 005's coup preview-state-drive closure.
- Reopening ticket 004's completed train elapsed-gate closure unless new evidence proves a distinct missing path that was not covered there.
- Govern/event residual axes unless the post-006 witness makes one of them the next selected Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension code; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, publication, or microturn protocol semantic changes.

## Acceptance Criteria

### Tests That Must Pass

1. Focused correctness and cache-lifecycle tests for any chosen residual fix, or a focused no-change proof if the outcome is escalation classification.
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

1. **Determinism preserved.** Cache warmth or hash shortcuts change no observable game result, hash, trace semantics, or replay output.
2. **Engine-agnostic boundary preserved.** No FITL-specific ids, faction branches, or profile data enter engine code.
3. **Run-local lifetime preserved.** Any mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants.
4. **Decision-stack correctness preserved.** Any digest/frame reuse remains byte-equivalent to fresh digest construction.
5. **Measured residual handled truthfully.** If the remaining train spread does not yield a material non-overlapping TS-side improvement, record the escalation condition instead of marking Spec 173 complete by assertion.

## Test Plan

### New/Modified Tests

1. Focused test for the chosen residual fix, or a focused diagnostic/proof artifact for no-code escalation classification.
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
**Authorization**: User approved Option C on 2026-05-15 after the first safe non-overlapping runtime candidate failed the decisive witness. Scope effect: diagnostic/nonterminal handoff; no runtime code retained in this ticket.

### What Landed

- Captured a focused seed-1005 smoke diagnostic for a choose-N preview no-entry-hash candidate under `/tmp/ludoforge-173-post-006-smoke`. This was diagnostic only and is not a checked-in durable artifact.
- Captured checked-in red-attempt diagnostic artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-006-choosen-preview-no-entry-hash.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-006-choosen-preview-no-entry-hash.csv`
- Reverted the runtime candidate after the full 15-seed witness showed no material train-spread improvement.
- Added successor `tickets/173DEEPPRVCOST-007.md` for the remaining train decision-stack digest/encoding residual.

### Rejected Candidate Ledger

| Candidate | Correctness proof | Measurement | Verdict | Cleanup |
|---|---|---|---|---|
| Choose-N preview no-entry-hash apply, with canonicalization before scoring | `pnpm -F @ludoforge/engine build` and focused choose-N preview/replay tests passed while the candidate existed | `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-006-choosen-preview-no-entry-hash.md` | not retained: train add worsened from `53,088.24 ms` to `53,889.91 ms`; train confirm was flat/worse from `39,081.57 ms` to `39,129.56 ms`; slowest seed stayed red at `72,072.03 ms` | runtime diff reverted; no source code retained |

### Residual Owner / Successor

Successor `tickets/173DEEPPRVCOST-007.md` owns the next concrete non-overlapping residual: train `continuedDeepening` decision-stack frame encode/digest cost. The post-005 baseline and the rejected-candidate diagnostic both show train add/confirm as the top slow-tier axes, with hot-path bucket time dominated by `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame`.

Ticket 006 is blocked and not archive-ready because it produced diagnostic evidence and a successor handoff, but did not land a generic closure or trigger the Spec 173 Phase-N escalation condition by itself.

### Artifact Classification

- Checked-in diagnostic evidence: the post-006 red-attempt report and CSV listed above.
- Ignored/ephemeral diagnostic evidence: `/tmp/ludoforge-173-post-006-smoke/*`.
- Generated schema/golden fallout: none; no source, schema, fixture, or generated contract diff is retained.

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | ran while candidate existed | exit 0 |
| Focused tests | focused tests selected by implementation | ran compiled direct choose-N preview/replay subset while candidate existed | 7 tests passed |
| Diagnostic smoke | focused perf/counter witness where applicable | ran seed 1005 to `/tmp/ludoforge-173-post-006-smoke` while candidate existed | seed 1005 `67,565.66 ms`; diagnostic only |
| Decomposition witness | 15-seed command with `--profile-buckets` | ran while candidate existed | 15/15 seeds completed; checked-in red-attempt report/CSV written |
| FITL rules / determinism / broad lanes | ticket-named final lanes | not run after revert | no runtime code retained; successor owns the next implementation/proof set |
| Dependency graph | `pnpm run check:ticket-deps` | ran after successor/spec edits and archived-ticket metadata repair | passed for 4 active tickets and 2346 archived tickets |

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Determinism preserved | No runtime code retained after revert | proven by final diff classification | `git status --short` / final diff |
| Engine-agnostic boundary preserved | Candidate and successor are generic preview/Zobrist work; no FITL ids or profile/rules changed | proven by final diff classification | final diff |
| Run-local lifetime preserved | No new cache or mutable state retained | not applicable | final diff |
| Decision-stack correctness preserved | Candidate reverted; successor owns any future digest closure proof | deferred to confirmed successor | `tickets/173DEEPPRVCOST-007.md` |
| Measured residual handled truthfully | Red attempt recorded; remaining owner named | proven | this outcome + successor |

### Source-Size Ledger

`path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

`packages/engine/src/agents/policy-preview-inner-choosenstep.ts | 610 | 610 | no | none retained | candidate reverted after red witness | tickets/173DEEPPRVCOST-007.md`

### Late-Edit Proof Validity

The final ticket/spec/successor edits are ownership and diagnostic-transcription changes after the rejected runtime candidate was reverted. They do not validate a retained runtime path. The dependency-check transcription records the just-run graph check and does not change scope, acceptance, command semantics, dependency ownership, or proof claims; no source/test proof rerun is required.
