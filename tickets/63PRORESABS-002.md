# 63PRORESABS-002: Migrate `legal-choices.ts` probe catch blocks to `ProbeResult`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel legal-choices refactoring
**Deps**: `archive/tickets/63PRORESABS-001.md`

## Problem

`legal-choices.ts` has 6 try/catch blocks that classify probe errors:
- Lines 264, 290: `isEffectErrorCode(error, 'STACKING_VIOLATION')` → return illegal result (2 sites, identical code in `executeDiscoveryEffectsStrict` and `executeDiscoveryEffectsProbe`)
- Lines 426, 453, 628, 652: `isChoiceDecisionOwnerMismatchDuringProbe(error)` → reset option legality to `unknown` (4 sites)

These should be replaced with `ProbeResult` return values.

## Assumption Reassessment (2026-04-07)

1. `executeDiscoveryEffectsStrict` (line 249) and `executeDiscoveryEffectsProbe` (line 276) are local functions that call `applyEffects` and catch `STACKING_VIOLATION` — confirmed via Read.
2. The 4 owner-mismatch catches are in `resolveChoiceOneLegalOptions` and `resolveChooseNLegalOptions` — they wrap calls to the discovery effect execution functions, not direct `applyEffects` calls. The owner mismatch is thrown deeper in the probe stack.
3. `isChoiceDecisionOwnerMismatchDuringProbe` is defined at line 304 and exported — it delegates to `isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH)`.
4. The function is also imported by `choose-n-option-resolution.ts` — its export must remain until ticket 005.

## Architecture Check

1. Converting local probe wrappers to return `ProbeResult` instead of throwing eliminates 2 stacking-violation catch blocks. The 4 owner-mismatch catches then become `ProbeResult.outcome` reads.
2. No game-specific logic — stacking violations and owner mismatches are generic kernel concepts.
3. No backwards-compatibility shims — the internal probe functions are not part of the public API.

## What to Change

### 1. Refactor `executeDiscoveryEffectsStrict` and `executeDiscoveryEffectsProbe`

Change these two local functions to catch `STACKING_VIOLATION` internally and return a `ProbeResult<DiscoveryEffectExecutionResult>`:

- On success: `{ outcome: 'legal', value: { request, state, bindings } }`
- On stacking violation: `{ outcome: 'illegal', reason: 'stackingViolation' }`
- All other errors: rethrow (unchanged)

### 2. Update callers of the two discovery functions

The callers currently receive `DiscoveryEffectExecutionResult` directly. After the change, they receive `ProbeResult<DiscoveryEffectExecutionResult>` and must check `outcome` before accessing `value`.

### 3. Refactor owner-mismatch catch blocks (4 sites)

The 4 catch blocks at lines 426, 453, 628, 652 wrap higher-level probe logic. These need to be converted so the functions they call return `ProbeResult` on owner mismatch instead of throwing. The catch blocks then become simple `if (probed.outcome === 'inconclusive')` checks.

### 4. Keep `isChoiceDecisionOwnerMismatchDuringProbe` export temporarily

The function is still imported by `choose-n-option-resolution.ts`. Do NOT delete it in this ticket. Ticket 005 handles deletion after ticket 003 migrates that file.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify — refactor 6 catch blocks)

## Out of Scope

- `choose-n-option-resolution.ts` catch blocks (ticket 003)
- Missing-binding deferral sites (ticket 004)
- Deleting `isChoiceDecisionOwnerMismatchDuringProbe` (ticket 005)
- Changing the `applyEffects` function itself — it continues to throw; the catch moves into the local wrapper

## Acceptance Criteria

### Tests That Must Pass

1. `legal-choices.ts` has zero try/catch blocks that check `isEffectErrorCode(error, 'STACKING_VIOLATION')`.
2. `legal-choices.ts` has zero try/catch blocks that check `isChoiceDecisionOwnerMismatchDuringProbe(error)` for probe classification. (The function itself may still exist as an export.)
3. `pnpm -F @ludoforge/engine test` — all existing tests pass.
4. `pnpm -F @ludoforge/engine test:determinism` — determinism canary passes.

### Invariants

1. All moves that were legal/illegal/inconclusive before the refactor produce the same classification after.
2. Unknown errors are still rethrown — `ProbeResult` only captures the 3 expected categories.
3. `isChoiceDecisionOwnerMismatchDuringProbe` is still exported (for ticket 003's use).

## Test Plan

### New/Modified Tests

1. Existing tests in `packages/engine/test/` exercise legal-choices extensively. No new test file needed — behavioral equivalence is the acceptance criterion.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
