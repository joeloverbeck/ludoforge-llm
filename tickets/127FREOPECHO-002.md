# 127FREOPECHO-002: Clamp chooseN max from zone-filter constraints + regression test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-choice.ts (chooseN clamping)
**Deps**: `archive/tickets/127FREOPECHO-001.md`

## Problem

Free-operation grants with `zoneFilter` binding-count constraints (e.g., `count($targetSpaces) == 1`) cause `completeTemplateMove` to produce `completionUnsatisfiable` because the pipeline's `chooseN.max` is unclamped (e.g., 29 destinations) while the zone filter only permits 1. Random selection picks `count > 1` ~97% of the time, and the retry cap (7) is insufficient — both PolicyAgent and RandomAgent hit `agentStuck`.

This ticket wires the extraction utility from ticket 001 into `applyChooseN` in `effects-choice.ts` to clamp `chooseN.max` before option enumeration, and adds a regression test pinning the fix.

## Assumption Reassessment (2026-04-13)

1. `applyChooseN` in `effects-choice.ts:690` receives `env: EffectEnv` — confirmed. The `EffectEnv` carries `freeOperationOverlay?: FreeOperationExecutionOverlay` which includes `zoneFilter?: ConditionAST`.
2. The `clampedMax` line is at `effects-choice.ts:772`: `const clampedMax = Math.min(maxCardinality, normalizedOptions.length)` — confirmed during reassessment.
3. The resolved bind name is available as `bind` (line 700) and the zone filter as `env.freeOperationOverlay?.zoneFilter` — confirmed.
4. `completeTemplateMove` is exported from `move-completion.ts:72` — confirmed. Used in 5 test files.
5. Existing test `fitl-march-free-operation.test.ts` covers card-71 zone-filter evaluation at the unit level but does NOT cover the seed-1000 full-game scenario — confirmed.

## Architecture Check

1. The fix is minimal and surgical: one import + ~5 lines added to `applyChooseN` to extract bounds and clamp `clampedMax`. No new modules, no new abstractions, no new control flow.
2. Foundation 1 (Engine Agnosticism): the clamping uses generic `ConditionAST` pattern-matching from the extraction utility. No game-specific identifiers or branching.
3. Foundation 8 (Determinism): clamping is a pure numeric operation — same inputs always produce same clamped max.
4. Foundation 15 (Architectural Completeness): fixes the root cause (unclamped max) rather than symptoms (retrying, budgets, probes).
5. No backwards-compatibility shims — the existing `clampedMax` line is modified in place.

## What to Change

### 1. Wire extraction into `applyChooseN` in `effects-choice.ts`

After `maxCardinality` is resolved (line 708) and before `clampedMax` is computed (line 772), add:

```typescript
import { extractBindingCountBounds } from './zone-filter-constraint-extraction.js';

// Inside applyChooseN, after normalizedOptions is built (around line 772):
const zoneFilterBounds = env.freeOperationOverlay?.zoneFilter
  ? extractBindingCountBounds(env.freeOperationOverlay.zoneFilter, bind)
  : null;
const zoneFilterMax = zoneFilterBounds?.max ?? Infinity;
const clampedMax = Math.min(maxCardinality, normalizedOptions.length, zoneFilterMax);
```

This replaces the existing `clampedMax` line. The change is ~5 lines (well within the spec's 10-line limit for non-extraction files).

**Hard constraints verified:**
- No modifications to `legal-choices.ts`
- No modifications to resolution classification
- No new budget constants
- No modifications to `event-execution.ts`, `free-operation-viability.ts`, `policy-agent.ts`, or `move-decision-sequence.ts`
- No circular evaluation chains
- No game-specific logic

### 2. Create regression test

File: `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`

Test structure:

1. **Setup**: Compile FITL game spec. Run simulation with seed 1000, 4 players, max 200 turns, profiles `us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`. Capture `finalState` from trace.
2. **Assert legal moves**: Call `enumerateLegalMoves` on `finalState`. Assert 2 legal march moves, both with `freeOperation: true`.
3. **Assert 1-target completion succeeds**: Call `completeTemplateMove` on the first legal move, forcing `$targetSpaces = ['an-loc:none']`. Assert result is `completed`.
4. **Assert chooseN max is clamped (post-fix)**: The `chooseN` max for `$targetSpaces` should now be 1 (clamped by the zone-filter constraint `count($targetSpaces) == 1`), making multi-target selection structurally impossible.
5. **Assert random completion succeeds (post-fix)**: Call `completeTemplateMove` with no custom `choose` callback (pure random). Assert result is `completed` (not `unsatisfiable`).

### 3. Broader verification (manual, not automated)

After the implementation:
- Run seeds 1000-1014 with all FITL profiles — no new `agentStuck` occurrences
- Verify determinism canary: seeds 1000-1002 in `draft-state-determinism-parity.test.ts` complete within 60s each
- Verify event card canary: all 153 FITL event card suites pass (838 tests, 0 failures)
- Verify memory canary: `draft-state-gc-measurement.test.ts` completes within 120s timeout

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — ~5 lines: import + clamp logic)
- `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts` (new)

## Out of Scope

- Modifying `legal-choices.ts` (zone filter already threaded via `freeOperationOverlay`)
- Modifying `move-decision-sequence.ts`, `free-operation-viability.ts`, `event-execution.ts`, or `policy-agent.ts`
- Adding new budget constants
- Changing resolution classification semantics (`'exact'`, `'ambiguous'`, `'stochastic'`, `'provisional'`)
- Changing the FITL game spec's `insurgent-march-select-destinations` macro
- Adding game-specific logic to any kernel or agent file

## Acceptance Criteria

### Tests That Must Pass

1. Regression test: 1-target completion returns `completed`
2. Regression test: random completion returns `completed` (not `unsatisfiable`)
3. All 153 FITL event card suites pass (838 tests, 0 failures)
4. Determinism canary: seeds 1000-1002 complete within 60s each
5. Memory canary: `draft-state-gc-measurement.test.ts` completes within 120s
6. Existing suite: `pnpm turbo test` — all green
7. Existing suite: `pnpm turbo typecheck` — no errors
8. Existing suite: `pnpm turbo lint` — no errors

### Invariants

1. Foundation 1: no game-specific logic in `effects-choice.ts` or any kernel file
2. Foundation 8: clamping is deterministic — same zone filter + same binding = same clamped max
3. Foundation 11: no mutation — the clamp computes a new value, does not modify existing state
4. `effects-choice.ts` change is ≤10 lines (spec hard constraint)
5. No new files >200 lines
6. No circular evaluation chains introduced

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts` — pins the seed-1000 `agentStuck` bug and verifies clamped `chooseN.max` resolves it

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="free-operation-march-completion"` (targeted regression test)
2. `pnpm -F @ludoforge/engine test` (full engine suite including events, determinism, memory canaries)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (code quality)
5. `pnpm turbo test` (full monorepo suite)
