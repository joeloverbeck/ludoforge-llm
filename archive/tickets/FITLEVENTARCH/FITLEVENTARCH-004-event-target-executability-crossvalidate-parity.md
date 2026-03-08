# FITLEVENTARCH-004: Event Target Executability Cross-Validate Parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL cross-validation for event-deck target executability
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, archive/tickets/FITLEVENTARCH-002-choice-validation-error-classification.md

## Problem

After introducing target-owned event effects (`targets[].effects`), cross-validation still treats only side/branch-level `effects|branches|lastingEffects` as executable payload. This can raise false `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING` errors for canonical target-local event definitions.

## Assumption Reassessment (2026-03-08)

1. `pushEventTargetExecutabilityDiagnostic` in `packages/engine/src/cnl/cross-validate.ts` currently checks executable payload only at side/branch scope-level (`effects|branches|lastingEffects`) and ignores `targets[].effects`.
2. Event execution semantics in kernel support target-local executable payload:
   - `EventTargetDef.effects` exists in `packages/engine/src/kernel/types-events.ts`.
   - target effects are lowered by `synthesizeEventTargetApplicationEffects` in `packages/engine/src/kernel/event-execution.ts`.
3. Schema contract allows/validates target-local effects (`EventCardTargetSchema` in `packages/engine/src/kernel/schemas-extensions.ts`), including required non-empty effects for `application: "each"`.
4. Mismatch: validator semantics lag behind runtime/schema semantics; executability checks must treat target-local effects as executable payload.

## Architecture Check

1. Validation and runtime contracts must agree; otherwise authors get false negatives and lose trust in tooling.
2. Fix remains game-agnostic and belongs in shared CNL validation logic, not in game data patches.
3. No compatibility aliasing: executability logic should reflect the canonical target contract only.

## What to Change

### 1. Update event target executability checks

Modify cross-validation so target declarations are considered executable when at least one declared target has non-empty `effects` in the current validation scope (side or branch).

### 2. Keep diagnostic semantics deterministic

Preserve existing diagnostic code and message family, but avoid emitting it when target-local executable payload exists.

### 3. Strengthen tests for canonical contract

Add both positive and negative tests:
- positive: side `targets[].effects` only should pass executability check
- positive: branch `targets[].effects` only should pass executability check
- negative: targets without target effects and without scope effects should still fail

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)

## Out of Scope

- Runtime event execution changes
- Event content balancing or card text updates
- Runner/UI diagnostics formatting

## Acceptance Criteria

### Tests That Must Pass

1. Event sides/branches using only `targets[].effects` do not emit `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING`.
2. Targets with no executable payload anywhere still emit the diagnostic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator executable-payload semantics match canonical runtime target semantics.
2. Cross-validation remains game-agnostic and reusable across all games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — add positive side target-effects-only executability case.
2. `packages/engine/test/unit/cross-validate.test.ts` — add positive branch target-effects-only executability case.
3. `packages/engine/test/unit/cross-validate.test.ts` — retain/strengthen negative missing-executability case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Updated `pushEventTargetExecutabilityDiagnostic` in `packages/engine/src/cnl/cross-validate.ts` so side/branch targets are considered executable when any declared target has non-empty `effects`.
  - Added regression coverage in `packages/engine/test/unit/cross-validate.test.ts` for:
    - side `targets[].effects`-only executability
    - branch `targets[].effects`-only executability
- Deviations from original plan:
  - No runtime/kernel/schema changes were required because runtime and schema already supported target-local effects; only cross-validation parity was needed.
  - Scope clarification was applied before implementation: this parity rule applies to both side and branch validation scopes.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed (436/436)
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm -F @ludoforge/engine typecheck` passed
