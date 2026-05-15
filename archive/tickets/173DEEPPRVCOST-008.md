# 173DEEPPRVCOST-008: Phase 1 - Terminal train residual or Phase-N trigger decision

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - final generic train residual closure or Phase-N escalation classification
**Deps**: `archive/tickets/173DEEPPRVCOST-007.md`, `archive/specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-007` classified the train decision-stack digest/encoding residual as red/flat with no retained runtime code. Spec 173 remains active:

- Post-007 slowest seed `1005`: `74,562.87 ms`, still above the Spec 173 `<=60 s` soft target.
- Post-007 train rows remain the top slow-tier axes:
  - `train:chooseNStep:add | continuedDeepening`: `54,468.25 ms` slow-tier total, `1,650.5531 ms` mean.
  - `train:chooseNStep:confirm | continuedDeepening`: `40,155.09 ms` slow-tier total, `1,147.2882 ms` mean.
- Post-006 and post-007 are two consecutive non-improving Phase 1 slices. Spec 173 §4.2(c) fires after three consecutive Phase 1 tickets show no measurable improvement.

This ticket owns the next and terminal Spec 173 Phase 1 decision slice. It must either land a distinct, byte-equivalent generic TS-side closure that materially improves the post-007 train residual, or record the third consecutive no-improvement classification and trigger Phase N / Spec 174 authoring.

## Assumption Reassessment (2026-05-15)

1. **The post-007 witness is current.** `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.md` completed all 15 seeds and still reports a hot class with slow:fast ratio above `3x`.
2. **The previous two Phase 1 slices were non-improving.** Ticket 006 reverted its safe candidate after a red 15-seed witness; ticket 007 retained no runtime code after its JSON-segment cache candidate was flat/regressive.
3. **Spec 173 §4.2(c) had not fired before this ticket.** It required three consecutive non-improving Phase 1 tickets; this ticket was the next decision point.
4. **Spec 173 §4.2(b) has not fired yet.** The post-007 witness still reports train slow-tier axes above the spread criterion, so the residual cannot be treated as fully exhausted by spread evidence alone.
5. **Foundation alignment requires an explicit terminal decision.** Foundation #15 requires naming the remaining architectural owner if TS-side closure is exhausted; Foundation #16 requires the 15-seed witness to decide materiality.

## Architecture Check

1. **One-axis discipline is preserved.** The owned axis is the post-007 train `continuedDeepening` residual, with the terminal decision bounded to a distinct generic owner or Phase-N classification.
2. **Engine-agnostic boundary preserved.** Any retained fix must operate on generic preview-drive, decision-stack, Zobrist, cache, query, or runtime structures. No FITL-specific ids, card branches, agent profile data, or preview-bound retuning may enter engine code.
3. **No backwards-compatibility shims.** If a fix lands, replace the chosen hot path directly; do not keep parallel old/new scoring, digest, or preview routes.
4. **Escalation is first-class.** If no distinct safe TS-side owner remains or a safe candidate again fails materiality, update Spec 173 to record §4.2(c) firing and author the follow-up Spec 174 boundary instead of inventing another micro-cache.

## What to Change

### 1. Reassess the post-007 residual

Start from:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-007-final.csv`
- tickets `173DEEPPRVCOST-006` and `173DEEPPRVCOST-007`, including their rejected-candidate ledgers.

Identify whether any distinct, non-overlapping generic TS-side owner remains. Do not repeat:

- ticket 006's choose-N preview no-entry-hash candidate;
- ticket 007's decision-stack JSON segment cache/manual frame encoding candidate;
- ticket 004's completed projection-key or trusted-baseline cache shape unless new evidence proves a missing coverage path that is distinct from the archived work.

### 2. Land the smallest generic closure, or trigger Phase N

If a distinct safe owner remains, implement the smallest byte-equivalent generic fix and prove materiality with the same 15-seed witness.

If no distinct safe owner remains, or the next safe candidate again shows no material improvement, close this ticket as the third consecutive non-improving Phase 1 slice and:

- update Spec 173 to record that §4.2(c) fired;
- author the follow-up Spec 174 proposal for WASM preview-drive coverage extension;
- keep any failed runtime candidate reverted unless the witness shows material improvement.

### 3. Re-run the witness

Run the same 15-seed decomposition witness with a fresh date/label. The report must show whether the train residual materially improved or whether Phase N is now triggered.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (possible inspect/modify only for distinct digest owner)
- `packages/engine/src/kernel/microturn/drive.ts` or `packages/engine/src/kernel/microturn/apply.ts` (possible inspect/modify only for distinct caller-path owner)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` or `packages/engine/src/agents/policy-preview.ts` (possible inspect/modify only for distinct preview-drive owner)
- `packages/engine/src/agents/policy-encoded-state-cache.ts` or token/query cache files (possible inspect/modify only if new evidence proves a distinct remaining owner)
- `packages/engine/test/**/*zobrist*.test.ts`, `packages/engine/test/unit/agents/*`, or nearby focused tests selected by implementation (modify/add if code lands)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-008 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-008 witness)
- `archive/specs/173-deep-preview-drive-cost-reduction.md` (modify for ticket status and Phase-N trigger state)
- `specs/174-*.md` (new only if Spec 173 §4.2(c) fires)

## Out of Scope

- Repeating ticket 006 or ticket 007 rejected candidates.
- Reopening completed ticket 004 or 005 closures without new distinct evidence.
- Govern/event/coup residual axes unless the post-008 witness proves they are the next terminal owner instead of train.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- Landing WASM preview-drive ABI extension code inside Spec 173; Phase N only authors the follow-up Spec 174 boundary.
- Kernel legality, publication, or microturn protocol semantic changes.

## Acceptance Criteria

### Tests That Must Pass

1. Focused correctness and cache-lifecycle tests for any retained runtime fix, or a focused no-change proof if the outcome is Phase-N classification.
2. Determinism gates:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
3. Behavioural-drift check: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
4. Existing suite: `pnpm turbo test --force`, unless the final outcome is a no-code Phase-N classification and the ticket records the narrower proof substitution.

### Manual Verification

1. Re-run the decomposition witness:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD> --profile-buckets
   ```
2. Confirm whether train slow-tier totals improve materially versus the post-007 baseline:
   - `train:chooseNStep:add`: `54,468.25 ms`.
   - `train:chooseNStep:confirm`: `40,155.09 ms`.
3. Confirm whether slowest seed `1005` moves toward or below `<=60 s`.
4. If no TS-side owner remains or a candidate is red/flat, confirm the ticket and spec explicitly record Spec 173 §4.2(c) firing and the Spec 174 handoff.

### Invariants

1. **Determinism preserved.** Cache warmth, digest shortcuts, or preview-drive changes alter no observable game result, hash, trace semantics, replay output, or aggregate tournament outcome.
2. **Engine-agnostic boundary preserved.** No FITL-specific ids, faction branches, profile data, or authored action semantics enter engine code.
3. **Run-local lifetime preserved.** Any mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants.
4. **Decision-stack correctness preserved.** Any digest/frame reuse remains byte-equivalent to fresh digest construction.
5. **Measured residual handled truthfully.** A third consecutive red/flat Phase 1 slice must trigger Spec 173 §4.2(c) and Spec 174 authoring rather than being recorded as completion.

## Test Plan

### New/Modified Tests

1. Focused correctness/cache test for any chosen residual fix, or a focused diagnostic/proof artifact for Phase-N classification.
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

- No runtime code is retained. Live inspection confirmed the remaining train residual is still the same generic decision-stack digest/encoding cost already classified by ticket 007, with the current safe substrate already present: frame-identity `WeakMap` memoization plus run-local `zobristTable.frameDigestCache` keyed by the byte-equivalent encoded frame string.
- Captured the checked-in post-008 terminal Phase 1 witness:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.csv`
- Updated `archive/specs/173-deep-preview-drive-cost-reduction.md` to record that Spec 173 §4.2(c) fired after three consecutive non-improving Phase 1 slices.
- Authored follow-up `specs/174-wasm-preview-drive-coverage-extension.md` as the Phase N owner for WASM preview-drive coverage extension.

### Measured Result and Phase-N Trigger

| Metric | Post-007 baseline | Post-008 final | Delta | Verdict |
|---|---:|---:|---:|---|
| Slowest seed 1005 wall time | `74,562.87 ms` | `75,311.43 ms` | `+1.00%` | still red versus `<=60 s` |
| `train:chooseNStep:add` slow-tier total | `54,468.25 ms` | `54,546.24 ms` | `+0.14%` | no material improvement |
| `train:chooseNStep:confirm` slow-tier total | `40,155.09 ms` | `39,527.73 ms` | `-1.56%` | minor/no material improvement |
| Hot class with slow:fast ratio >3x | yes | yes | unchanged | Phase 1 residual remains |

This is the third consecutive non-improving Phase 1 slice after tickets 006 and 007. Spec 173 §4.2(c) is now fired, and Phase N is triggered. Spec 173 closes by authoring Spec 174 rather than by claiming the TypeScript-side residual is solved.

### Residual Owner

The remaining owner is `specs/174-wasm-preview-drive-coverage-extension.md`. It owns the generic WASM preview-drive coverage extension for `continuedDeepening` / `deep1024` preview-drive work, including TS/WASM parity, fail-closed unsupported classification, activation counters, and any later default-flip proof. This ticket does not implement Spec 174 code.

### Artifact Classification

- Checked-in diagnostic evidence: the post-008 final report and CSV listed above.
- Ignored/ephemeral diagnostic evidence: none.
- Generated schema/golden fallout: none; no source, schema, fixture, or generated contract diff is retained.

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | ran before the decisive no-code witness | exit 0 |
| Focused no-change proof | focused correctness/cache tests for a retained runtime fix, or focused no-change proof | substituted by final source inspection plus no-retained-code diff classification | no runtime code retained; existing digest/cache substrate inspected |
| Decomposition witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD> --profile-buckets` | ran with `--date 2026-05-15-post-008-final` | exit 0; 15/15 seeds completed; report and CSV written |
| FITL rules / targeted determinism / equivalence / broad lanes | ticket-named final lanes | not run | no runtime code retained; build plus measured classification are the final no-code proof surface |
| Dependency graph | `pnpm run check:ticket-deps` | ran after terminal/spec closeout edit | passed for 4 active tickets and 2347 archived tickets |

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Determinism preserved | No runtime code retained after post-007 source state | proven by final diff classification | final diff |
| Engine-agnostic boundary preserved | No FITL ids, profile data, preview bounds, or rules changed | proven by final diff classification | final diff |
| Run-local lifetime preserved | Existing frame digest cache remains run-local; no new mutable cache retained | proven by inspected existing substrate | `zobrist.ts`, `gamedef-runtime.ts` inspection |
| Decision-stack correctness preserved | No new digest/frame reuse added; existing byte-equivalent cache remains unchanged | proven | final diff |
| Measured residual handled truthfully | Post-008 witness is red/flat; §4.2(c) fired; Spec 174 authored | proven | post-008 final report and Spec 174 |

### Source-Size Ledger

No source files have retained active growth. Near/over-guidance candidate files were inspected only:

`path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

`packages/engine/src/kernel/zobrist.ts | 645 | 645 | no | none retained | source inspected only; no distinct safe TS owner retained | specs/174-wasm-preview-drive-coverage-extension.md`

`packages/engine/src/kernel/microturn/apply.ts | 800 | 800 | no | none retained | source inspected only; no edit made at cap boundary | specs/174-wasm-preview-drive-coverage-extension.md`

`packages/engine/src/agents/policy-preview.ts | 1286 | 1286 | no | none retained | source inspected only; no edit made to preexisting oversized file | specs/174-wasm-preview-drive-coverage-extension.md`

### Late-Edit Proof Validity

The ticket, Spec 173, and Spec 174 edits are no-retained-code classification, exact metric transcription, and ownership handoff after the final witness. They do not validate a retained runtime path and do not change the witness command or threshold. The dependency-check transcription records the just-run graph check and changes no scope, acceptance, command semantics, dependency ownership, or proof claims; no empirical rerun is required.
