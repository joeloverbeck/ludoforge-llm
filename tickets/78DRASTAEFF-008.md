# 78DRASTAEFF-008: Remove simple()/compat() wrappers, clean up registry, add determinism parity tests

**Status**: PENDING
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

### 1. Remove `simple()` and `compat()` from `effect-registry.ts`

- Delete the `simple` function (lines ~62–65)
- Delete the `OldApplyEffectsWithBudget` type (lines ~71–75)
- Delete the `compat` function (lines ~76–87)
- Remove imports of `fromEnvAndCursor`, `toEffectEnv`, `toEffectCursor` from `effect-context.ts` IF no longer needed in this file
- Verify the registry object contains ONLY direct handler references

### 2. Audit and potentially remove `fromEnvAndCursor` from `effect-context.ts`

- Grep for all usages of `fromEnvAndCursor` across the codebase
- If only used in `effect-registry.ts` (now removed), delete the function
- If used in test helpers, either keep it or migrate the test helpers. Document the decision.

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

- `packages/engine/src/kernel/effect-registry.ts` (modify — delete simple/compat/OldApplyEffectsWithBudget)
- `packages/engine/src/kernel/effect-context.ts` (modify — potentially remove fromEnvAndCursor)
- `packages/engine/test/unit/kernel/draft-state-determinism-parity.test.ts` (new — determinism parity tests)
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

1. `packages/engine/test/unit/kernel/draft-state-determinism-parity.test.ts` — multi-game determinism verification
2. `packages/engine/test/performance/draft-state-gc-measurement.test.ts` — GC pressure measurement (advisory)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "determinism-parity"`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test --force`
