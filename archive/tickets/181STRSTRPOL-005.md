# 181STRSTRPOL-005: Phase 0 — CI integration + per-probe overhead budget

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/` Turbo / test wiring; no engine src changes
**Deps**: `archive/tickets/181STRSTRPOL-001.md`, `archive/tickets/181STRSTRPOL-002.md`, `archive/tickets/181STRSTRPOL-003.md`, `archive/tickets/181STRSTRPOL-004.md`

## Problem

Spec 181 §8 Phase 0 acceptance (a) and (e) require the runner to be invoked automatically by the repository's policy-profile-quality test lane and probe runner overhead to stay below 200 ms per probe at default trace level. Without explicit CI/profile-quality wiring and a budget gate, the harness exists but operators have no signal when a probe regression slows the loop back toward the multi-minute baseline this spec was meant to escape.

## Assumption Reassessment (2026-05-18)

1. The per-game `<game>.probes.test.ts` wrappers from 001 are picked up by `pnpm -F @ludoforge/engine test:policy-profile-quality` automatically because the policy-profile-quality manifest includes every `*.test.ts` under `packages/engine/test/policy-profile-quality/`.
2. `pnpm turbo test` invokes the engine default lane, which intentionally excludes profile-quality tests per the lane taxonomy policy and `docs/FOUNDATIONS.md` Appendix. The default lane is still part of final verification because it proves this boundary stays intact.
3. Probes from 003 and 004 are landed; the budget gate measures real probes, not just the runner scaffold.
4. **Approved boundary reset (2026-05-18)**: the first focused budget run measured `arvn-action-distribution-not-dominated` at about 747 ms per inspected decision, above the 200 ms soft budget but below the 10x hard-fail threshold. Per user-confirmed Option 2 after a `docs/FOUNDATIONS.md` reassessment, this ticket owns deterministic CI/budget reporting and explicit soft-regression surfacing; follow-up `archive/tickets/181STRSTRPOL-013.md` owns reducing the ARVN probe below the 200 ms/decision target. This preserves Foundation #9/#16 auditability and the Appendix distinction between profile-quality warnings and architectural-invariant gates without silently claiming the performance target is met.

## Architecture Check

1. CI integration is mechanical wiring — Turbo task graph, test runner config, possibly a small budget assertion. No engine src change (Foundation #1).
2. Budget gate is a runner-side test: `runProbe(p).durationMs ≤ 200 * decisionsScored` (or per-probe scalar if `occurrence: 'first'`). Profile-quality severity for soft overhead regressions (probe runs but slower than budget); architectural-invariant for hard regressions (probe exceeds 10× budget). The current ARVN soft overrun is intentionally surfaced as `POLICY_PROFILE_QUALITY_REGRESSION` and handed to `archive/tickets/181STRSTRPOL-013.md`, not hidden or converted into a blocking engine invariant.
3. Trace-level default: probes run with `traceLevel: 'summary'` per Spec 181 §10 / §13.6. Verbose-on-failure stays opt-in for debugging, not the budget-gate default.

## What to Change

### 1. Verify profile-quality test runner discovery

Run the profile-quality lane locally and confirm the new `<game>.probes.test.ts` and `architectural.probes.test.ts` wrappers execute through `packages/engine/scripts/run-policy-profile-quality-tests.mjs`. Do not add profile-quality probes to the default blocking lane; the lane taxonomy policy keeps them isolated by design.

### 2. Per-probe overhead budget assertion

Add a test in `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` (the 001 file) — or a sibling `probe-budget.test.ts` — that runs each registered probe through `runProbe` and asserts `result.durationMs ≤ 200` (for `occurrence: 'first'` / `'nth'`) or `result.durationMs / decisionsScored ≤ 200` (for `occurrence: 'every'`).

Severity: emit `POLICY_PROFILE_QUALITY_REGRESSION` for soft overruns above the 200 ms budget; hard fail for >10× budget. Use the existing reporter pattern from 001.

### 3. Trace-level default + verbose-on-failure

The runner default `traceLevel` is `'summary'` (per spec §10). When a probe assertion fails, the runner SHOULD re-run the failing decision with `traceLevel: 'verbose'` and attach the verbose trace to the failure report. Implement this in the runner (back-port to 001's scaffold if not present; otherwise add here). This keeps the default fast and gives operators full diagnostic context only on failures.

### 4. Documentation

Append a `## CI Integration` section to `probes/README.md` (created in 001) explaining:
- How `pnpm -F @ludoforge/engine test:policy-profile-quality` invokes probes automatically.
- Why the default lane intentionally excludes profile-quality probes.
- The 200 ms per-probe budget.
- The verbose-on-failure re-run behavior.
- How to add a new probe (link to define-probe API).

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (new — budget gate)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify — add verbose-on-failure re-run if not in 001)
- `packages/engine/test/policy-profile-quality/probes/README.md` (modify — append CI Integration section)

## Out of Scope

- Adding more probes (this ticket is CI wiring; subsequent specs author additional probes).
- Cross-game probe sharding / parallel execution (single-process iteration is fine for current corpus size).
- Raising / tightening the 200 ms budget — that's a follow-on if the corpus grows.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:policy-profile-quality` invokes every `*.probes.test.ts` wrapper without explicit per-file invocation.
2. `probe-budget.test.ts` runs all registered probes. The constructibility probe (004) satisfies the hard gate; the ARVN distribution probe (003) currently emits `POLICY_PROFILE_QUALITY_REGRESSION` at 797.43 ms per inspected decision and remains below the 10× hard gate. Reducing it below the 200 ms soft budget is split to `archive/tickets/181STRSTRPOL-013.md`.
3. Verbose-on-failure: a synthetic probe with a guaranteed-failing assertion produces a failed `ProbeOutcome` with `trace` populated from the verbose rerun (not the summary trace).
4. Existing suite: `pnpm turbo test`

### Invariants

1. Default `traceLevel` is `'summary'`; verbose only on failure or explicit probe override (Foundation #10 — bounded trace cost).
2. CI gate fires deterministically — same probes + same engine version → same budget verdict.
3. No engine src changes; CI wiring only (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — budget assertion across the registered probe corpus.
2. `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` (modify — verbose-on-failure unit test).

### Commands

1. `pnpm -F @ludoforge/engine test:policy-profile-quality`
2. `pnpm turbo test` (default-lane boundary and existing suite)
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completion date: 2026-05-18

What landed:
- Confirmed the Phase 0 probe tests are covered by the policy-profile-quality lane manifest so `pnpm -F @ludoforge/engine test:policy-profile-quality` includes the per-game probe wrappers, architectural probe wrapper, runner unit tests, and budget gate after the engine build.
- Added `probe-budget.test.ts`, which runs all registered Phase 0 probes, emits `POLICY_PROFILE_QUALITY_REGRESSION` for soft budget overruns above 200 ms per budget unit, and hard-fails only above the 10× budget threshold.
- Changed `runProbe()` to use `traceLevel: 'summary'` by default and rerun failed assertions once at `traceLevel: 'verbose'` to attach diagnostic trace data only on failure.
- Updated the probe README with CI integration, budget, verbose-on-failure, and new-probe registration guidance.

Boundary correction:
- The originally drafted acceptance bullet requiring the ARVN probe to already satisfy `≤ 200 ms/decision` was corrected after live focused runs showed a soft overrun, with the final rerun at 797.43 ms/decision. User-approved Option 2 keeps this ticket scoped to deterministic budget reporting and warning surfacing; `archive/tickets/181STRSTRPOL-013.md` owns the remaining ARVN budget reduction.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/probes/probe-runner.test.js dist/test/policy-profile-quality/probes/probe-budget.test.js dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js dist/test/policy-profile-quality/probes/architectural.probes.test.js` — passed, 11 tests / 4 suites; emitted expected soft `POLICY_PROFILE_QUALITY_REGRESSION` for `arvn-action-distribution-not-dominated` at 797.43 ms per inspected decision on the final rerun.
- Manifest discovery check — passed: 19 profile-quality probe test files discovered, including `probe-budget.test.ts`, `fire-in-the-lake.probes.test.ts`, and `architectural.probes.test.ts`; 0 default-lane leaks.
- `pnpm turbo test` — passed after the Foundations-aligned lane correction; the engine lane taxonomy test confirms policy-profile-quality probes stay out of the default blocking lane.
- `pnpm run check:ticket-deps` — passed for 8 active tickets and 2416 archived tickets after archival and follow-up creation.

Schema/artifact fallout: none; TypeScript source/tests/docs only.

Source-size ledger: touched TypeScript files stayed below the 800-line cap. Final counts: `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` 386 lines (+53/-8), `probe-types.ts` 180 lines (+4/-0), `probe-runner.test.ts` 151 lines (+24/-0), `probe-budget.test.ts` 86 lines (new), `run-tests.mjs` 278 lines (+2/-0), `test-lane-manifest.mjs` 246 lines (+2/-0). No source-size hard gate triggered.

Late-edit proof validity: the post-reset ticket/spec/follow-up edits changed acceptance ownership and ticket graph, so the focused build/probe lane and ticket-dependency checker were rerun before terminal status. The final status edit is terminal status/proof transcription only; no scope, command coverage, touched-file scope, dependency owner, or acceptance boundary changed after the final rerun.

Outcome amended: 2026-05-18
- Post-review correction: corrected stale failure-trace wording and final ARVN soft-overrun measurement before archival.
- Foundations-aligned lane correction: profile-quality probes remain in `test:policy-profile-quality` rather than the default blocking lane; `pnpm turbo test` proves the taxonomy boundary.
