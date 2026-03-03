# ENGINEARCH-203: Document Canonical Binding Contract for GameSpecDoc Authoring

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation/spec clarity only
**Deps**: tickets/README.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md

## Problem

Canonical binding identifier requirements are enforced in code but not clearly documented as a hard authoring rule for GameSpecDoc. This increases churn and avoidable invalid specs when adding games.

## Assumption Reassessment (2026-03-03)

1. Engine contracts enforce canonical binder identifiers by requiring a leading `$` on declared binder surfaces (for example `bind`, `countBind`, `itemBind`, `accBind`, `resultBind`) and selected contract surfaces (for example action actor/executor bindings, `aggregate.bind`, `nextInOrderByCondition.bind`).
2. Current code/tests intentionally allow non-prefixed binding identifiers in some reference-only surfaces when they are explicitly declared in scope (for example action params referenced as `{ ref: binding, name: targetSpace }`).
3. Mismatch corrected: previous ticket wording implied universal `$name` enforcement for all binding references. Scope is now limited to documenting the real contract boundary: strict canonical declaration surfaces vs allowed reference-only surfaces.

## Architecture Check

1. Explicit docs for core syntax contracts improve extensibility and reduce accidental invalid specs.
2. The clean architecture is to enforce canonical form only where identifiers are declared or contract-critical, while avoiding artificial constraints on plain action parameter names.
3. This keeps game-specific behavior in GameSpecDoc while reinforcing game-agnostic compiler/runtime contract boundaries.
4. No compatibility shims or aliases are added.

## What to Change

### 1. Add/clarify canonical binding rule in spec documentation

Document that canonical binding enforcement is mandatory on declaration/contract surfaces (leading `$` required), while ordinary action parameter names remain plain identifiers unless a specific surface requires canonical binding tokens.

### 2. Update examples to canonical form

Ensure representative examples in affected spec/rules docs use canonical bind declarations consistently and do not mislabel plain action parameter references as violations.

### 3. Add a short authoring checklist note

Add a concise checklist entry that flags non-canonical bind declarations as invalid and clarifies the declaration/reference distinction.

## Files to Touch

- `specs/29-fitl-event-card-encoding.md` (modify)
- `data/games/fire-in-the-lake/20-macros.md` (modify examples/comments if needed)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify examples/comments if needed)

## Out of Scope

- Runtime/schema behavior changes.
- Visual config documentation.
- Backfill of unrelated historical docs outside the chosen authoritative files.

## Acceptance Criteria

### Tests That Must Pass

1. Docs/spec examples reflect canonical declaration syntax consistently in touched sections and correctly preserve allowed plain action-param references.
2. Existing suite remains green:
   - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-bindings.test.ts`
   - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-conditions.test.ts`
   - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/cross-validate.test.ts`
   - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts`
   - `pnpm turbo test`

### Invariants

1. Binding syntax guidance is explicit and unambiguous (`$name` only).
2. Docs do not incorrectly redefine plain action parameter identifiers as canonical bind declarations.
3. Documentation preserves GameSpecDoc vs visual-config boundary guidance.

## Test Plan

### New/Modified Tests

1. No new test files expected (documentation-only change).
   - Rationale: ticket changes authoring guidance, while behavior is already covered by existing unit tests for canonical declaration surfaces and scoped binding references.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-bindings.test.ts`
2. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-conditions.test.ts`
3. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/cross-validate.test.ts`
4. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts`
5. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Reassessed assumptions against current compiler/runtime tests and corrected scope to distinguish canonical declaration/contract surfaces (`$name`) from allowed plain action-parameter references.
  - Updated canonical-binding guidance in:
    - `specs/29-fitl-event-card-encoding.md`
    - `data/games/fire-in-the-lake/20-macros.md`
    - `data/games/fire-in-the-lake/30-rules-actions.md`
  - Added explicit authoring notes to prevent incorrect “all binding references must be `$name`” interpretation.
- **Deviations from original plan**:
  - Original wording implied universal canonical `$name` usage on both introduced and referenced identifiers; this was corrected to match actual contract boundaries validated in code/tests.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-bindings.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/compile-conditions.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` passed.
  - `pnpm -F @ludoforge/engine test` passed (371/371).
