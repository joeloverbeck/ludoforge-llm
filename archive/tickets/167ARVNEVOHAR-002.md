# 167ARVNEVOHAR-002: Trace emission defaults (`--trace-default`)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No behavior change — campaign runner trace defaults plus lint-only engine import cleanup
**Deps**: `specs/167-arvn-evolution-harness-performance.md`

## Problem

`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:74` defaults `TRACE_ALL` to `'true'`, which writes one per-seed JSON trace into `campaigns/fitl-arvn-agent-evolution/traces/` for every seed in the tournament. Confirmed file sizes: `traces/trace-1000.json` 3.4 MB, `traces/trace-1001.json` 4.7 MB, directory total 84 MB. The `campaigns/fitl-arvn-agent-evolution/program.md:374` OBSERVE protocol consumes a single trace via `last-trace.json` (the path written when `TRACE_ALL=false`); the remaining 14 traces are pure overhead in the steady-state campaign loop. Each trace also reconstructs `computeAllSeatMargins` per seat at `run-tournament.mjs:140-174,450,463`, compounding the cost.

## Assumption Reassessment (2026-05-12)

1. `run-tournament.mjs:74` defaults `TRACE_ALL=true`; `run-tournament.mjs:75` reads `--trace-seed`. Confirmed.
2. `run-tournament.mjs:458-507` is the trace-emission branch; both `traces/trace-${seed}.json` and `last-trace.json` write through this branch. Confirmed.
3. `traces/` directory exists on disk and accumulates across invocations. Confirmed (84 MB total). Spec §3.5 says it must be cleared at the start of each invocation.
4. No external consumer of multi-seed traces was identified by inspection of `campaigns/fitl-arvn-agent-evolution/program.md`. Confirmed by spec §3.5; no contract breakage.
5. `--trace-all` and `--trace-seed` are existing flags used by OBSERVE tooling; both must continue to be honored as overrides per spec §3.5.

## Architecture Check

1. **Steady-state default aligns with the OBSERVE protocol**: `program.md:374` reads `last-trace.json` for the first seed only; the new default (`last`) emits exactly that and nothing else. Tier-15 tournaments stop paying 14× redundant trace I/O per invocation.
2. **Foundation #1 (Engine Agnosticism)** — change is entirely campaign-local; no engine surface touched.
3. **Foundation #14 (No Backwards Compatibility)** — `--trace-all` continues to behave as today when explicitly passed (`--trace-all true` maps to the new `--trace-default all`); the legacy contract is preserved by argument shape, not by a `_legacy` shim. The default flips; the override semantics do not.
4. **No backwards-compat alias path**: `--trace-all` is read alongside `--trace-default`; if both are present, `--trace-default` wins. If only `--trace-all` is present, it maps to the corresponding `--trace-default` value. This is explicit precedence, not a deprecated fallback.

## What to Change

### 1. Add `--trace-default` argument

In `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`:

- Add `const TRACE_DEFAULT = getArg('trace-default', null);` near the existing `TRACE_ALL` parsing (line 74).
- Resolve the effective trace mode in priority order: explicit `--trace-default` value > legacy `--trace-all true|false` mapping (`true` → `all`, `false` → `last`) > built-in default (`last` when `SEED_COUNT > 1`, `none` when `SEED_COUNT == 1`).
- Validate the resolved value is one of `{none, last, all}`; reject unknown values with a stderr diagnostic + non-zero exit.

### 2. Rework the trace-write branch

Replace the `TRACE_ALL || (TRACE_SEED !== null && seed === Number(TRACE_SEED) && !traceSaved)` predicate at `run-tournament.mjs:458-459` with:

- `mode === 'all'` → write `traces/trace-${seed}.json` for every seed (current behavior).
- `mode === 'last'` → write `last-trace.json` for the first seed (seed 1000) only.
- `mode === 'none'` → no trace written (unless `--trace-seed N` is explicitly passed, in which case write `last-trace.json` for that seed only — preserves the existing OBSERVE override).
- `--trace-seed N` (existing flag) continues to behave as today: writes `last-trace.json` for the named seed, regardless of `--trace-default`.

### 3. Clear `traces/` at tournament start

Per spec §3.5: at the start of each invocation, `rmSync(traceDir, { recursive: true, force: true })` followed by the existing `mkdirSync(traceDir, { recursive: true })` (only when `mode === 'all'` — no need to recreate when nothing will be written). This prevents stale traces from prior `--trace-all` invocations from accumulating across mode flips.

### 4. Document the new default in the harness

`campaigns/fitl-arvn-agent-evolution/harness.sh` invokes the runner without an explicit `--trace-default`; the new built-in default (`last` at multi-seed, `none` at single-seed) is what steady-state campaigns observe. No code change to `harness.sh` itself, but add a one-line stderr log from the runner identifying the resolved trace mode so harness logs make the active behavior visible.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (lint-only hygiene: remove a pre-existing unused import from ticket 001's WASM predecessor so the ticket-named `pnpm turbo lint` lane can run cleanly; no behavior change)

## Out of Scope

- Trace summary content schema changes (the `traceSummary` object at `run-tournament.mjs:477-498` is unchanged — only the write predicate changes).
- WASM bootstrap (ticket 001).
- Build script changes (ticket 003).
- Cache or worker pool (tickets 004, 005).
- Updates to `program.md` text describing trace behavior — left to whichever ticket actually changes the OBSERVE protocol; this ticket preserves the protocol's input contract (`last-trace.json` continues to be the canonical OBSERVE artifact).

## Acceptance Criteria

### Tests That Must Pass

1. Manual: `node run-tournament.mjs --seeds 2 --players 4 --evolved-seat arvn` writes exactly `last-trace.json` (and no `traces/trace-*.json`) under default settings.
2. Manual: same invocation with `--trace-default all` writes `traces/trace-1000.json` and `traces/trace-1001.json`.
3. Manual: same invocation with `--trace-all true` (legacy override) behaves identically to `--trace-default all`.
4. Manual: same invocation with `--trace-seed 1000 --trace-default none` writes only `last-trace.json` for seed 1000.
5. Existing suite: `pnpm -F @ludoforge/engine test` continues to pass.

### Invariants

1. **Default at tier ≥ 2**: exactly one `last-trace.json` per invocation; no per-seed `traces/trace-*.json`.
2. **Override precedence**: `--trace-default` > `--trace-all` > built-in default; `--trace-seed` always overrides to write `last-trace.json` for the named seed.
3. **Stale-trace safety**: a prior `--trace-default all` invocation cannot leak traces into a subsequent `--trace-default last` invocation. `traces/` is wiped at the start of every run.
4. **Determinism preservation**: the trace mode affects which files are written, not the decision stream produced by `runGame`. The `compositeScore` for the same seed set is unchanged across modes.

## Test Plan

### New/Modified Tests

No new automated test. Trace-emission behavior is verified by the manual matrix above; the underlying determinism is asserted by tickets 001 (WASM equivalence) and 005 (parallel determinism). Adding a unit test that asserts which file the runner writes would couple the test to a campaign-local I/O path with no engine invariant at stake.

### Commands

1. Manual matrix (above): four invocations covering `default | --trace-default all | --trace-all true | --trace-seed 1000 --trace-default none`; verify directory contents match expectations.
2. `SEED_COUNT=2 bash campaigns/fitl-arvn-agent-evolution/harness.sh` — confirm `errors=0` and `compositeScore` unchanged vs. pre-ticket baseline at the same seed set.
3. `pnpm turbo lint && pnpm turbo typecheck` (clean checks; campaign `.mjs` plus authorized lint-only engine cleanup).

## Outcome

Completed: 2026-05-12

- `run-tournament.mjs` now resolves trace mode as `--trace-default` > `--trace-all` > built-in default (`last` for multi-seed, `none` for single-seed), validates `none|last|all`, logs the resolved mode, and clears `traces/` at invocation start.
- Trace writes preserve the existing summary shape. `all` writes per-seed `traces/trace-*.json`; `last` writes one `last-trace.json` for the first seed; `none` writes no trace unless `--trace-seed N` explicitly selects `last-trace.json` for that seed.
- Deviations from original plan: user approved a lint-only hygiene absorption on 2026-05-12 after `pnpm turbo lint` found a pre-existing unused import in ticket 001's WASM predecessor. `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` is touched only to remove that unused import so Foundation #14 and the ticket-named clean-check lane both stay truthful.
- Generated/artifact fallout: none checked in. `last-trace.json`, `traces/`, and `run.log.*` are ignored runtime artifacts.
- Source-size ledger: `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` grew from 586 to 622 lines; it remains below the 800-line cap, so no extraction is required. `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` is 779 lines after this ticket and shrank by one unused import; no active growth or extraction is required.
- Runtime surface breadth: script/profile-only campaign runner behavior, plus lint-only engine import cleanup with no runtime behavior change.
- Final proof:
  - `node --check campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
  - `SEED_COUNT=2 bash campaigns/fitl-arvn-agent-evolution/harness.sh` passed with `Regression gate passed.`, `compositeScore=-6`, `avgMargin=-6`, and `errors=0`.
  - Manual matrix from `campaigns/fitl-arvn-agent-evolution` passed after the harness rebuild:
    - `node run-tournament.mjs --seeds 2 --players 4 --evolved-seat arvn` returned `compositeScore=-6`, wrote `last-trace.json` for seed 1000, and left no `traces/` directory.
    - `node run-tournament.mjs --seeds 2 --players 4 --evolved-seat arvn --trace-default all` returned `compositeScore=-6` and wrote exactly `traces/trace-1000.json` and `traces/trace-1001.json`.
    - `node run-tournament.mjs --seeds 2 --players 4 --evolved-seat arvn --trace-all true` returned `compositeScore=-6` and wrote exactly `traces/trace-1000.json` and `traces/trace-1001.json`.
    - `node run-tournament.mjs --seeds 2 --players 4 --evolved-seat arvn --trace-seed 1000 --trace-default none` returned `compositeScore=-6`, wrote `last-trace.json` for seed 1000, and removed the stale `traces/` directory from the prior `all` run.
  - `pnpm run check:ticket-deps` passed: `Ticket dependency integrity check passed for 5 active tickets and 2310 archived tickets.`
  - No-invalidation: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change after the final proof lanes.
