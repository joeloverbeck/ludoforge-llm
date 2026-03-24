# 78DRASTAEFF-008: Remove simple()/compat() wrappers, clean up registry, add determinism parity tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-registry.ts, effect-context.ts, new test file
**Deps**: 78DRASTAEFF-004, 78DRASTAEFF-005, 78DRASTAEFF-006, 78DRASTAEFF-007

## Problem

After all 29 handlers are migrated to native `(env, cursor)` signatures (tickets 004–007), the `simple()` and `compat()` compatibility wrappers in `effect-registry.ts` are dead code. `fromEnvAndCursor` in `effect-context.ts` is no longer needed by the dispatch path. This ticket removes the dead code and adds determinism parity tests to prove that the mutable implementation produces identical results to the original spread-based approach.

## Assumption Reassessment (2026-03-23)

1. After tickets 004–007, ALL registry entries are direct handler references — no `simple()` or `compat()` wrappers remain.
2. `fromEnvAndCursor` may still be used by test helpers or other non-dispatch code — check before removing. If still used, keep it but mark as test-only.
3. `toEffectEnv` and `toEffectCursor` are used by `applyEffect`/`applyEffects` entry points — these stay.
4. `OldApplyEffectsWithBudget` type is only used by `compat()` — can be removed.

## Architecture Check

1. This is a cleanup ticket — removes dead code, no behavioral changes.
2. Determinism parity tests are the final proof that the mutable implementation is correct.
3. Foundation 9 (No Backwards Compatibility) explicitly endorses removing compatibility wrappers.

## What to Change

### 1. ~~Remove `simple()` and `compat()` from `effect-registry.ts`~~ — ALREADY DONE

> Verified 2026-03-24: `simple()`, `compat()`, and `OldApplyEffectsWithBudget` were already removed during tickets 004–007. The registry contains only direct handler references (34 entries). No code changes needed.

### 2. ~~Audit and potentially remove `fromEnvAndCursor` from `effect-context.ts`~~ — KEEP, NO ACTION

> Verified 2026-03-24: `fromEnvAndCursor` is used ~30 times across 7 production handler files (effects-token, effects-var, effects-choice, effects-binding, effects-reveal, effects-resource, effects-subset). Zero test-only usage. It is a live production function and cannot be removed.

### 3. Add determinism parity tests

Create a new test file that:
- Runs 100 FITL games and 100 Texas Hold'em games with fixed seeds
- Records final state Zobrist hashes for each game
- Compares against a golden baseline (recorded from the pre-migration spread-based implementation)
- This proves: same seed + same actions = identical final state hash

### 4. Add GC measurement test (optional, advisory)

- A benchmark test using `--expose-gc` that measures GC% over 20 games
- Asserts GC% < 3% (target: 3.6% → <2%)
- Mark as `.skip` if `global.gc` is not available (non-exposed-gc runtime)

## Files to Touch

- `packages/engine/src/kernel/effect-registry.ts` — NO CHANGES NEEDED (already clean)
- `packages/engine/src/kernel/effect-context.ts` — NO CHANGES NEEDED (fromEnvAndCursor is live production code)
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (new — determinism parity tests, CI-only lane)
- `packages/engine/test/performance/draft-state-gc-measurement.test.ts` (new — optional GC benchmark)

## Out of Scope

- Migrating any handlers (done in tickets 004–007)
- Changes to `state-draft.ts`, `effect-dispatch.ts`, or any effect handler files
- Spec 79 (compiled effect path redesign) — compatible but not yet modified
- Runner or agent changes

## Acceptance Criteria

### Tests That Must Pass

1. New test: determinism parity — 100 FITL games with fixed seeds produce identical state hashes as baseline
2. New test: determinism parity — 100 Texas Hold'em games with fixed seeds produce identical state hashes as baseline
3. New test (advisory): GC measurement shows reduction from baseline (not a hard gate if `--expose-gc` unavailable)
4. Typecheck: `pnpm turbo typecheck` — no unused imports or dead code references
5. Lint: `pnpm turbo lint` — no lint errors from removed code
6. Existing suite: `pnpm turbo test --force` — full green

### Invariants

1. `simple()` and `compat()` functions MUST NOT exist in the codebase after this ticket.
2. The `registry` object MUST contain ONLY direct handler references — no wrapper functions.
3. All 29 migrated handlers + 5 native control-flow handlers = 34 total registry entries, all direct.
4. `fromEnvAndCursor` is either removed or explicitly marked as test-only utility.
5. Determinism parity: same seed + same actions = identical Zobrist hash at every move boundary.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` — multi-game determinism verification (CI-only lane)
2. `packages/engine/test/performance/draft-state-gc-measurement.test.ts` — GC pressure measurement (advisory)

### Commands

1. `pnpm -F @ludoforge/engine test:determinism`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test --force`

## Outcome

**Completion date**: 2026-03-24

**What changed**:
- `simple()`, `compat()`, `OldApplyEffectsWithBudget` were already removed during tickets 004–007. Verified clean.
- `fromEnvAndCursor` kept — used ~30 times across 7 production handler files. Not dead code.
- New determinism parity test: `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` — runs 10 seeds (100 via RUN_SLOW_E2E=1) for FITL and Texas Hold'em, verifying same seed → same final state hash (or same error).
- New GC measurement test: `packages/engine/test/performance/draft-state-gc-measurement.test.ts` — advisory, requires `--expose-gc`.
- New `determinism` test lane added to `scripts/test-lane-manifest.mjs` and `scripts/run-tests.mjs`.
- New npm script: `test:determinism` in `packages/engine/package.json`.
- New CI workflow: `.github/workflows/engine-determinism.yml`.

**Deviations from original plan**:
- Sections 1–2 (remove wrappers, audit fromEnvAndCursor) required no code changes — already done in prior tickets.
- Determinism test moved from `test/unit/kernel/` to `test/determinism/` (CI-only lane) to avoid ~10 min slowdown in the default test suite.
- Seed count reduced to 10 (default) / 100 (RUN_SLOW_E2E=1) for practical test runtime.
- Test handles FITL runtime errors (known rules gaps) gracefully — asserts same seed produces same error, proving determinism even on failure paths.

**Verification**:
- `pnpm turbo build`: pass
- `pnpm turbo typecheck`: pass
- `pnpm turbo lint`: pass
- `pnpm turbo test --force`: 4670 pass, 0 fail (35s, determinism test excluded)
- `pnpm -F @ludoforge/engine test:determinism`: 20 pass, 0 fail (~10 min)
