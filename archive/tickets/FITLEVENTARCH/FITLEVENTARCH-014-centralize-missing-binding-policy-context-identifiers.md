# FITLEVENTARCH-014: Centralize missing-binding policy context identifiers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel policy context constants + callsite/test adoption
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-012-unify-legal-move-admission-policy-surface-across-callsites.md

## Problem

`MissingBindingPolicyContext` values are currently passed as string literals across kernel callsites and tests.

Even with union typing, literal scattering increases drift risk and makes refactors less robust than centralized identifiers.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/src/kernel/missing-binding-policy.ts` defines `MissingBindingPolicyContext` as a string union and `shouldDeferMissingBinding(...)` switches on literal values.
2. `packages/engine/src/kernel/legal-moves.ts` and `packages/engine/src/kernel/legal-moves-turn-order.ts` pass literal context strings directly.
3. `packages/engine/src/kernel/action-pipeline-predicates.ts` also passes a literal context string (`'pipeline.discoveryPredicate'`) directly and must be included.
4. `packages/engine/src/kernel/move-decision-sequence.ts` does not currently pass literal context identifiers itself; it accepts a typed context parameter and can remain unchanged unless implementation details require otherwise.
5. `packages/engine/test/unit/kernel/legal-moves.test.ts` includes AST-level assertions that currently expect string literals, so tests must be updated to assert canonical-constant usage shape instead.

## Architecture Check

1. Centralized context constants are cleaner than distributed string literals and reduce accidental typo/rename drift.
2. This is a generic kernel policy-typing improvement; no game-specific behavior is introduced.
3. No backwards-compatibility aliases/shims: replace direct literals at callsites/tests with canonical constants.
4. Preferred shape for long-term robustness: define one `MISSING_BINDING_POLICY_CONTEXTS` object and derive `MissingBindingPolicyContext` from its values to eliminate duplicate literal ownership.

## What to Change

### 1. Add canonical context identifier map

Create an exported `MISSING_BINDING_POLICY_CONTEXTS` constant object (or equivalent) as the single source of context literals.

### 2. Migrate callsites and tests

Replace context string literals in legal-move and policy tests with the canonical constant values.

## Files to Touch

- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)

## Out of Scope

- Changing defer semantics per context
- New legal-move admission flows
- GameSpecDoc/visual-config data changes

## Acceptance Criteria

### Tests That Must Pass

1. Kernel callsites use canonical exported context identifiers instead of ad-hoc string literals.
2. Policy tests remain exhaustive for all supported contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Missing-binding context ownership is centralized to one kernel policy module surface.
2. GameDef/simulator remain game-agnostic with no game-specific branching introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — update source-shape assertions to reference canonical context constants.
2. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — verify all canonical contexts map to intended defer semantics.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — ensure admission helper context wiring still holds via canonical constants.
4. `packages/engine/test/unit/kernel/action-pipeline-predicates.test.ts` — add/adjust coverage so discovery predicate deferral is validated through canonical context identifiers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - Added canonical context map `MISSING_BINDING_POLICY_CONTEXTS` and derived `MissingBindingPolicyContext` from it in `packages/engine/src/kernel/missing-binding-policy.ts`.
  - Migrated all production missing-binding policy context callsites to canonical constants in:
    - `packages/engine/src/kernel/legal-moves.ts`
    - `packages/engine/src/kernel/legal-moves-turn-order.ts`
    - `packages/engine/src/kernel/action-pipeline-predicates.ts`
    - `packages/engine/src/kernel/missing-binding-policy.ts` (`shouldDeferFreeOperationZoneFilterFailure`)
  - Updated tests to consume canonical constants and prevent literal drift:
    - `packages/engine/test/unit/kernel/missing-binding-policy.test.ts`
    - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
    - `packages/engine/test/unit/kernel/legal-moves.test.ts` (AST guards now enforce `MISSING_BINDING_POLICY_CONTEXTS` import/member access in source)
- **Deviations from original plan**:
  - Corrected scope to include `action-pipeline-predicates.ts` (missing in original file list) and removed mandatory edits to `move-decision-sequence.ts` (no direct literal ownership there).
  - Existing behavior coverage in `action-pipeline-predicates.test.ts` was already sufficient for deferral semantics; no new test file was required.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
