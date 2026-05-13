# 168ENGHOTPATH-006: Phase 5 — re-profile + Spec 169 escalation memo

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — measurement + report only
**Deps**: `archive/tickets/168ENGHOTPATH-002.md`, `archive/tickets/168ENGHOTPATH-007.md`, `archive/tickets/168ENGHOTPATH-003.md`, `archive/tickets/168ENGHOTPATH-004.md`, `archive/tickets/168ENGHOTPATH-005.md`

## Problem

Spec 168 §3.6 prescribes a profile-validated escalation gate: after Phases 1-4 land, re-profile the canonical probe, compute the new bucket decomposition, and apply a published criterion to decide whether a follow-up Spec 169 is warranted for further bytecode-IR / WASM expansion. This converts an implicit "do WASM later" handoff into a measurable criterion, satisfying Foundation #15 (Architectural Completeness) — the spec is complete on its own terms; Spec 169 is conditional, not assumed.

This is a **deferred-execution ticket**: it is not gated (it always runs) but its execution waits until all four Wave-2 tickets close. Its output is one of two memos depending on the measured data.

## Assumption Reassessment (2026-05-13)

1. Phases 1-4 (`archive/tickets/168ENGHOTPATH-002.md`, `archive/tickets/168ENGHOTPATH-007.md`, and `archive/tickets/168ENGHOTPATH-003.md` through `archive/tickets/168ENGHOTPATH-005.md`) are landed and each has produced its own per-phase report (`reports/turnperf-NNN-spec-168-phase-N.md`). Reassess this precondition before starting work. Ticket `007` exists because `002` landed the Phase 1 substrate but left the measured gate red; `007` later resolved that gate.
2. The canonical probe is reproducible via the `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture.
3. The escalation criterion (spec §3.6) is fully specified: a single non-policy bucket sustains ≥ `40 ms` per card AND the candidate is a kernel-internal hot path that today does not cross the WASM boundary AND the back-of-envelope cost-model (using `encodeBytecodeInput` per-call cost from the post-Phase-4 baseline as marshalling-cost proxy) shows expected `WASM execution + marshalling cost < estimated TS-side cost`.

## Architecture Check

1. Cleaner than implicit "we'll add a spec later" because the criterion is published, measurable, and either-justifies-or-closes the optimization arc.
2. Preserves engine agnosticism — no production code change in this ticket.
3. **Foundation #15 alignment** — completeness is achieved by closing the loop, not by leaving a TODO. The spec's "deferred to Spec 169" language is concrete (criterion + measured inputs), not vague.

## What to Change

### 1. Re-run canonical probe with all Phases 1-4 active

Invoke the canonical probe per `archive/tickets/168ENGHOTPATH-001.md` methodology:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets \
  --label spec-168-final
```

Capture the resulting per-bucket JSON.

### 2. Compute new bucket decomposition

Diff the new bucket JSON against:
- The Phase 0 baseline (`reports/turnperf-NNN-spec-168-phase-0-baseline.md`)
- Each phase's per-phase report (Phases 1-4)

Tabulate the cumulative ms reduction per bucket and the post-Phase-4 per-call cost of `policyWasmRuntime:encodeBytecodeInput` (this is the marshalling-cost proxy for §3.6's cost-model).

### 3. Apply the §3.6 escalation criterion

For each remaining non-policy bucket:
- Is the bucket ≥ `40 ms` per card?
- Is it a kernel-internal hot path that does not cross the WASM boundary today?
- Estimate cost-model: `(expected WASM execution time + (per-row marshalling cost from post-Phase-4 baseline × call count)) < (current TS-side ms)`?

If all three hold for ≥ 1 bucket: write a Spec 169 trigger memo (see Step 4 below).

If none hold: write an explicit closure note in the same report.

### 4. Author the final report

Write `reports/turnperf-NNN-spec-168-final.md` (NNN allocated at write time). Required sections:

- **Verdict** — overall acceptance check: did per-card `elapsedMs ≤ 1700 ms` AND `msPerDecision ≤ 10.6 ms` per spec §1?
- **Reproducibility metadata** — kernel commit SHA, Node/pnpm/OS/CPU, etc. (matches Phase 0 format)
- **Wall-time decomposition** — final bucket table + cumulative deltas vs. baseline
- **Phase 5 escalation evaluation** — the §3.6 criterion check, per-bucket
- **Spec 169 trigger memo** OR **Closure note** — exactly one
  - Trigger memo: identifies the bucket, proposes opcode/ABI shape, records the cost-model estimate
  - Closure note: explicitly closes the optimization arc; cites which buckets did not meet the criterion and why
- **Verification** — the commands run

### 5. (Conditional) Surface Spec 169 candidacy to user

If the Spec 169 trigger memo is produced, surface it in this ticket's `Outcome` section so the next session can decide whether to invoke `/brainstorm` to author Spec 169.

## Files to Touch

- `reports/turnperf-NNN-spec-168-final.md` (new — final bucket decomposition + Spec 169 trigger memo OR closure note)

## Out of Scope

- Authoring Spec 169 itself (this ticket produces the trigger memo; the spec is a separate `/brainstorm` invocation that follows if warranted)
- Any production code change
- Test-gate scoping (still owned by campaign protocol per Spec 167 §10 and Spec 168 §8)

## Acceptance Criteria

### Tests That Must Pass

1. None new — this ticket is measurement + report only
2. Existing suite: `pnpm turbo test` (sanity check that Phases 1-4 are still green)

### Invariants

1. Final report records the new per-bucket decomposition with all four phases active (Phases 1-4)
2. Either a Spec 169 trigger memo OR an explicit closure note exists in the final report — never both, never neither
3. Spec 168's overall acceptance criterion is checked: per-card `elapsedMs ≤ 1700 ms` AND `msPerDecision ≤ 10.6 ms`. If unmet, the report documents the gap and recommends next steps (e.g., revisiting one of Phases 1-4 vs. closing 168 and decomposing the gap into Spec 169)
4. Determinism preserved — `errors == 0` and `compositeScore` matches the pre-spec baseline at fixed seed and profile

## Test Plan

### New/Modified Tests

1. `reports/turnperf-NNN-spec-168-final.md` — measurement deliverable + escalation memo

### Commands

1. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`
4. `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` (full-harness sanity check, optional — record total wall-time for residual evidence)

## Outcome (2026-05-13)

What landed:

- Added `reports/turnperf-009-spec-168-final.md` with the Phase 5 final
  bucket decomposition and closure note.
- No production code, schema, golden, compiled GameDef, or Spec 169 artifact was
  changed.

Phase 5 verdict:

- Overall Spec 168 budget remains red: final per-card `elapsedMs=1800.57`
  against `<=1700`, and final per-card `msPerDecision=11.2536` against
  `<=10.6`.
- Spec 169 escalation does not trigger under Spec 168 §3.6. The only remaining
  single kernel-internal bucket over `40 ms` is `tokenStateIndex:build`, and the
  Phase 5 marshalling proxy leaves only about `1.65 ms` of total WASM execution
  headroom before a WASM route would lose to the current TypeScript bucket.
  `simApplyMove` is still large, but it is an aggregate simulator wrapper, not a
  narrow opcode/ABI candidate.

Invariant proof matrix:

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Final report records the post-Phase-4 bucket decomposition. | `reports/turnperf-009-spec-168-final.md` transcribes the `spec-168-final` profiler output. | proven | direct profiler command |
| Exactly one Spec 169 trigger memo or closure note exists. | The final report contains a `Closure Note` and no trigger memo. | proven | report inspection |
| Overall Spec 168 acceptance criterion is checked. | Report records `1800.57 ms/card` and `11.2536 ms/decision`, both red against the target. | proven red and documented | direct profiler command |
| Determinism / score sanity preserved. | Direct profile reports WASM unsupported counts `0`; optional harness reports `errors=0`, `compositeScore=-3.4`, `completed=15`, matching the pre-Spec-168 baseline in `reports/turnperf-002-spec-167-baseline.md`. | proven | direct profiler command, optional harness, and baseline report |

Command ledger:

| Ticket section | Literal command / shorthand | Final classification |
|---|---|---|
| What to Change | `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final` | ran directly; decisive final decomposition |
| Acceptance | `pnpm turbo test` | passed from Turbo cache replay; cache-hit supplemental because direct profile, harness regression gate, and perf lane prove the ticket-owned measurement/report boundary |
| Test Plan | `pnpm -F @ludoforge/engine test:perf` | ran directly; passed |
| Test Plan | `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` | ran optional residual score/error sanity; passed |

Generated fallout:

- New checked-in report: `reports/turnperf-009-spec-168-final.md`.
- Ignored campaign logs were regenerated under
  `campaigns/fitl-arvn-agent-evolution/run.log.*`.
- No schema, golden, compiled GameDef, or raw profiler JSON artifact is checked
  in.

Deferred sibling/spec scope:

- Spec 169 authoring, WASM opcode/ABI work, and further engine optimization are
  out of scope. The report recommends a new profiling/design slice only if the
  remaining overall budget gap still matters; this ticket does not create that
  successor.

Runtime surface breadth: script/profile-only measurement and report closeout.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final` — passed; produced the decisive final bucket decomposition.
- `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `compositeScore=-3.4`, `errors=0`, `real=270.38 s`.
  This matches the pre-Spec-168 fixed-seed baseline in
  `reports/turnperf-002-spec-167-baseline.md`, which recorded
  `compositeScore=-3.4` and `errors=0`.
- `pnpm -F @ludoforge/engine test:perf` — passed, 4/4 perf files; emitted known advisory warnings from older perf witnesses, but no failing tests.
- `pnpm turbo test` — passed from Turbo cache replay, 5/5 tasks; cache-hit supplemental.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2321 archived tickets.

Late-edit validity: final ticket/report edits after the measured lanes
transcribe already-run metrics, final proof results, and terminal status only.
They do not change runtime code, command semantics, thresholds, acceptance
boundaries, touched-file ownership, follow-up ownership, or dependency
classification. The dependency-check result transcription is clerical and does
not change ticket graph facts after the check.
