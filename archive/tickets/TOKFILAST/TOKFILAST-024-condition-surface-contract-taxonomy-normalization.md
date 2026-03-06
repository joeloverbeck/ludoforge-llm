# TOKFILAST-024: Normalize Condition-Surface Contract Taxonomy for Extensibility

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — contract API shape cleanup (no behavior change)
**Deps**: archive/tickets/TOKFILAST-023-condition-surface-contract-guardrail-policy.md

## Problem

The condition-surface contract currently encodes distinct semantic surfaces that share identical suffix strings (for example two separate `if.when` keys). This is valid but increases API ambiguity and makes future contract growth harder to reason about.

## Assumption Reassessment (2026-03-06)

1. `CONDITION_SURFACE_SUFFIX` currently includes multiple semantically distinct entries that map to identical string values.
2. Existing callsites rely on string output only; no runtime behavior depends on specific constant key names.
3. Active neighboring tickets (`TOKFILAST-025`..`029`) do not scope condition-surface suffix taxonomy normalization specifically; they target predicate-operator and boolean-arity contracts.
4. Scope correction: duplicated `if.when` suffix ownership is consumed in `validate-gamedef-behavior.ts` callsites and unit tests; `validate-gamedef-core.ts` and `validate-gamedef-extensions.ts` do not currently depend on duplicated suffix keys.

## Architecture Check

1. A normalized taxonomy (for example grouped surface namespaces or canonical shared suffix constants with semantic wrappers) is cleaner and easier to extend safely.
2. This is pure contract-API hygiene in agnostic engine infrastructure; no game-specific branching is introduced.
3. No backwards-compatibility aliases/shims are introduced; callers are migrated directly.
4. Decision: use one canonical `ifWhen` suffix key instead of multiple semantic aliases mapping to the same literal, because semantic duplication without path differentiation adds maintenance risk without adding expressive power.

## What to Change

### 1. Normalize condition-surface suffix taxonomy

Refactor contract exports so suffix ownership is explicit while avoiding duplicated literal keys. Adopt one canonical key for shared `if.when` path ownership.

### 2. Migrate callsites/tests to normalized API

Update validator behavior and unit-test callsites to the normalized contract API shape.

### 3. Preserve exact diagnostic path outputs

Ensure emitted path strings remain unchanged from current behavior.

## Files to Touch

- `packages/engine/src/contracts/condition-surface-contract.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- New validator/runtime semantics.
- Any game-specific logic additions.

## Acceptance Criteria

### Tests That Must Pass

1. Contract API no longer relies on ambiguous duplicated semantic keys.
2. Diagnostic path strings for all existing covered condition surfaces remain exactly stable.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition-surface path ownership remains centralized and explicit.
2. GameDef/runtime/simulator remain game-agnostic.
3. One canonical suffix key represents each emitted suffix literal in the shared contract API.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — retain/extend condition-surface path assertions to confirm no path-output drift through contract normalization.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-06
- Completion date: 2026-03-06
- What actually changed:
  - Normalized `CONDITION_SURFACE_SUFFIX` into family-scoped namespaces (`valueExpr`, `query`, `effect`, `actionPipeline`) with explicit, local ownership keys.
  - Migrated `validate-gamedef-behavior.ts` and `validate-gamedef-extensions.ts` callsites to family-scoped helpers and suffix accessors.
  - Added/updated regression coverage in `validate-gamedef.test.ts` and lint policy coverage in `condition-surface-validator-callsites-policy.test.ts` to enforce family-scoped helper usage and non-duplicated suffixes per family.
  - Updated this ticket assumptions/scope as a historical record, then amended outcome to reflect the post-archive migration of `validate-gamedef-extensions.ts` to family-scoped helpers.
  - Post-archive refinement replaced the flat suffix map with family-scoped suffix namespaces and family-scoped append helpers (`appendValueExpr|Query|Effect|ActionPipelineConditionSurfacePath`) to encode ownership at the type level.
- Deviations from original plan:
  - Narrowed implementation surface to behavior validator + tests after reassessment confirmed no duplicated-key dependency in core/extensions validators.
  - Extended the implementation to migrate `validate-gamedef-extensions.ts` and lint policy tests to the new family-scoped helper API for stronger compile-time boundary enforcement.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
