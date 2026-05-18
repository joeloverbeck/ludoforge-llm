# 181STRSTRPOL-005: Phase 0 — CI integration + per-probe overhead budget

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/` Turbo / test wiring; no engine src changes
**Deps**: `archive/tickets/181STRSTRPOL-001.md`, `tickets/181STRSTRPOL-002.md`, `tickets/181STRSTRPOL-003.md`, `tickets/181STRSTRPOL-004.md`

## Problem

Spec 181 §8 Phase 0 acceptance (a) and (e) require the runner to be invoked by `pnpm turbo test` automatically and probe runner overhead to stay below 200 ms per probe at default trace level. Without explicit CI wiring and a budget gate, the harness exists but operators have no signal when a probe regression slows the loop back toward the multi-minute baseline this spec was meant to escape.

## Assumption Reassessment (2026-05-18)

1. The per-game `<game>.probes.test.ts` wrappers from 001 are picked up by the existing engine test runner (`pnpm -F @ludoforge/engine test`) automatically because they match the `*.test.ts` pattern. Confirm during implementation; if not, wire them explicitly into `vitest.config` or `package.json` test scripts.
2. `pnpm turbo test` invokes `pnpm -F @ludoforge/engine test` per Turbo's task graph. Confirmed by repo convention (see `CLAUDE.md` Build & Test Commands section).
3. Probes from 003 and 004 are landed; the budget gate measures real probes, not just the runner scaffold.

## Architecture Check

1. CI integration is mechanical wiring — Turbo task graph, test runner config, possibly a small budget assertion. No engine src change (Foundation #1).
2. Budget gate is a runner-side test: `runProbe(p).durationMs ≤ 200 * decisionsScored` (or per-probe scalar if `occurrence: 'first'`). Profile-quality severity for "soft" overhead regressions (probe runs but slower than budget); architectural-invariant for "hard" regressions (probe times out beyond 10× budget) — confirm tier with one-pass profiling during implementation.
3. Trace-level default: probes run with `traceLevel: 'summary'` per Spec 181 §10 / §13.6. Verbose-on-failure stays opt-in for debugging, not the budget-gate default.

## What to Change

### 1. Verify Turbo / test runner discovery

Run `pnpm turbo test` locally and confirm the new `<game>.probes.test.ts` and `architectural.probes.test.ts` wrappers execute. If they don't, add explicit entries to `packages/engine/vitest.config.ts` / `package.json` `test` script as appropriate.

### 2. Per-probe overhead budget assertion

Add a test in `packages/engine/test/policy-profile-quality/probes/probe-runner.test.ts` (the 001 file) — or a sibling `probe-budget.test.ts` — that runs each registered probe through `runProbe` and asserts `result.durationMs ≤ 200` (for `occurrence: 'first'` / `'nth'`) or `result.durationMs / decisionsScored ≤ 200` (for `occurrence: 'every'`).

Severity: emit `POLICY_PROFILE_QUALITY_REGRESSION` for soft overruns (1×–3× budget); hard fail for >10× budget (a probe that takes 2+ s likely means the harness regressed beyond intended cost). Use the existing reporter pattern from 001.

### 3. Trace-level default + verbose-on-failure

The runner default `traceLevel` is `'summary'` (per spec §10). When a probe assertion fails, the runner SHOULD re-run the failing decision with `traceLevel: 'verbose'` and attach the verbose trace to the failure report. Implement this in the runner (back-port to 001's scaffold if not present; otherwise add here). This keeps the default fast and gives operators full diagnostic context only on failures.

### 4. Documentation

Append a `## CI Integration` section to `probes/README.md` (created in 001) explaining:
- How `pnpm turbo test` invokes probes automatically.
- The 200 ms per-probe budget.
- The verbose-on-failure re-run behavior.
- How to add a new probe (link to define-probe API).

## Files to Touch

- `packages/engine/vitest.config.ts` (modify — only if test discovery needs explicit wiring)
- `packages/engine/package.json` (modify — only if test script needs adjustment)
- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (new — budget gate)
- `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` (modify — add verbose-on-failure re-run if not in 001)
- `packages/engine/test/policy-profile-quality/probes/README.md` (modify — append CI Integration section)

## Out of Scope

- Adding more probes (this ticket is CI wiring; subsequent specs author additional probes).
- Cross-game probe sharding / parallel execution (single-process iteration is fine for current corpus size).
- Raising / tightening the 200 ms budget — that's a follow-on if the corpus grows.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo test` invokes every `*.probes.test.ts` wrapper without explicit per-file invocation.
2. `probe-budget.test.ts` runs all registered probes; the ARVN distribution probe (003) and the constructibility probe (004) each satisfy `durationMs / decisionsScored ≤ 200`.
3. Verbose-on-failure: a synthetic probe with a guaranteed-failing assertion produces a `ProbeResult.failure.trace` populated with the verbose trace (not the summary trace).
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

1. `pnpm turbo test` (full engine test suite)
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
