# FITLSEC5RULGAP-001: Engine — Free Operation Independent Enumeration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium-Large
**Engine Changes**: Yes — kernel free operation enumeration in `legal-moves-turn-order.ts`, possibly `legal-moves.ts`
**Deps**: None

## Problem

Rule 5.1.2: *"If two Events contradict each other, the currently played Event takes precedence."* Example: *"US could Air Lift with MACV even with Typhoon Kate in effect."*

When a momentum card blocks an operation (e.g., Typhoon Kate blocks Air Lift via the pipeline `legality:` condition), and a different event grants a free version of that operation (e.g., MACV grants free SA), the free operation is silently unavailable. The engine generates free operation variants by iterating existing legal moves plus bare `{ actionId, params: {} }` stubs, but `isFreeOperationApplicableForMove` and `resolveMoveDecisionSequence` invoke the action preflight which evaluates pipeline `legality:` blocks. When momentum rejects the action entirely (`pipelineNotApplicable`), no free variants survive — the grant is silently dropped.

## Assumption Reassessment (2026-02-24)

1. `applyPendingFreeOperationVariants` exists in `legal-moves-turn-order.ts` lines 280-345 — **confirmed** by reading the file.
2. The function creates `extraBaseMoves` from pending grant `actionIds` (line 305) and iterates `[...moves, ...extraBaseMoves]` — **confirmed**.
3. Each candidate is checked via `isFreeOperationApplicableForMove` (line 315) which calls `actionApplicabilityPreflight` — **confirmed** by tracing through `turn-flow-eligibility.ts`.
4. `actionApplicabilityPreflight` has an existing `skipPipelineDispatch` option (line 44, 78, 166-168) — **confirmed**. When `true`, pipeline dispatch is treated as `noneConfigured`, bypassing `legality:` and `costValidation:` blocks entirely.
5. `skipPipelineDispatch` is NOT currently used in the free operation enumeration path — **confirmed**; the free operation path does not pass this option.
6. Pipeline `legality:` blocks in FITL actions contain only momentum restrictions — **confirmed** by examining `30-rules-actions.md` (Air Lift, Air Strike, Transport, Bombard, Infiltrate, Ambush profiles).
7. The 4 hard exceptions (stacking, resource cap, piece availability, tunneled bases) are enforced at runtime in effect handlers, not in pipeline `legality:` — **confirmed** by examining `effects-token.ts` and `effects-var.ts`.

## Architecture Check

1. Reusing the existing `skipPipelineDispatch: true` option is cleaner than introducing a new bypass mechanism — the infrastructure already exists but is unused for free operation enumeration.
2. The change is engine-generic (no FITL-specific logic in kernel). The kernel doesn't know about momentum — it only knows that pipeline `legality:` blocks can reject actions. The fix makes free operation enumeration skip those blocks, which is the correct general behavior per Rule 5.1.2's principle.
3. No backwards-compatibility shims. The existing enumeration path is unchanged for grants that DO match existing legal moves. The fallback only activates for grants with zero matching variants.

## What to Change

### 1. Add fallback independent enumeration in `applyPendingFreeOperationVariants` (`legal-moves-turn-order.ts`)

After the current enumeration loop (lines 307-343), add a second pass for unmatched grants:

1. Track which grant `actionIds` produced at least one free variant during the first pass
2. For each unmatched `actionId`, enumerate moves independently by:
   - Creating bare `{ actionId, params: {}, freeOperation: true }` move candidates
   - Calling the existing move resolution pipeline but with `skipPipelineDispatch: true` passed through to the preflight
   - Applying the grant's `zoneFilter` (already supported in `evalCtx.freeOperationZoneFilter`)
   - Checking `isFreeOperationApplicableForMove` as before, but with the pipeline bypass active
3. Add surviving candidates to the `variants` array (deduplicating via `toMoveIdentityKey`)

### 2. Thread `skipPipelineDispatch` through move resolution (`legal-moves.ts`)

The `resolveMoveDecisionSequence` and `isMoveDecisionSequenceSatisfiable` functions must be able to pass `skipPipelineDispatch` through to the underlying preflight call. This may require:
- Adding an optional `skipPipelineDispatch?: boolean` to the options object of these functions
- Passing it through to `actionApplicabilityPreflight` when invoking from the free operation independent enumeration path

### 3. No changes to `action-applicability-preflight.ts`

The `skipPipelineDispatch` option already exists and works correctly. No modifications needed.

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify — add fallback enumeration in `applyPendingFreeOperationVariants`)
- `packages/engine/src/kernel/legal-moves.ts` (modify — thread `skipPipelineDispatch` through resolution helpers if needed)
- `packages/engine/src/kernel/types-operations.ts` (modify — add `skipPipelineDispatch` to enumeration options type if needed)

## Out of Scope

- FITL game data YAML changes (all data is correct)
- Compiler source changes
- Changes to `actionApplicabilityPreflight` itself (existing `skipPipelineDispatch` suffices)
- Changes to `__freeOperation` runtime binding behavior
- Changes to the 4 hard exceptions (stacking, resource cap, piece availability, tunneled bases)
- Changes to the first-pass enumeration (grants that match existing legal moves)

## Acceptance Criteria

### Tests That Must Pass

1. Free operation grant with no matching base moves (momentum blocks all) triggers independent enumeration and produces free variants
2. Independent enumeration skips pipeline `legality:` and `costValidation:` but respects action `pre:` conditions
3. Grant's `zoneFilter` is still applied during independent enumeration
4. Grant's `actionIds` filter works correctly (only granted actions are enumerated)
5. Existing behavior (grant WITH matching base moves) is unchanged — no regression
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Full build: `pnpm turbo build`
8. Type check: `pnpm turbo typecheck`

### Invariants

1. No FITL-specific or game-specific logic introduced in kernel code
2. The 4 hard exceptions (stacking, resource cap, piece availability, tunneled bases) remain enforced at runtime regardless of pipeline bypass
3. Non-free operations remain correctly blocked by momentum (pipeline `legality:` still evaluates normally for non-free moves)
4. Texas Hold'em compilation and tests still pass (engine-agnosticism)
5. `skipPipelineDispatch` semantics are unchanged for all other callers

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-independent-enumeration.test.ts` — Unit tests for the fallback path: grant with no base moves, pipeline bypass, zoneFilter application, actionIds filtering, no regression for matched grants
2. `packages/engine/test/unit/kernel/legal-moves-turn-order.test.ts` — Extend existing tests if they cover `applyPendingFreeOperationVariants`

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
