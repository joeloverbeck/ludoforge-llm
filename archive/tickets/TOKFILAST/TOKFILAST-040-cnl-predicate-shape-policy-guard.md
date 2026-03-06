# TOKFILAST-040: Guard CNL Predicate Canonical Shape Policy Against Mixed-Form Regression

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guardrail coverage
**Deps**: archive/tickets/TOKFILAST-039-cnl-predicate-canonical-shape-strict-alias-key-rejection.md

## Problem

Even with behavior tests, there is no dedicated policy guard that prevents future reintroduction of mixed-form predicate acceptance patterns (`source.op` + ignored alias keys) in CNL lowering paths.

## Assumption Reassessment (2026-03-07)

1. CNL predicate lowering is the only authoring boundary where token-filter/asset-row predicate shape is normalized.
2. Existing policy coverage already guards predicate-op contract ownership/import provenance broadly across `src/kernel` + `src/cnl` (`predicate-op-contract-ownership-policy.test.ts`), so this is not a missing boundary today.
3. What is still missing is a CNL-targeted guard that fails if `compile-conditions.ts` reintroduces alias-property reads (`source.eq`/`source.neq`/`source.in`/`source.notIn`) in token-filter/assetRows predicate lowering code paths.
4. Without this CNL-local guardrail, permissive mixed-shape acceptance can reappear via local edits that still pass broad compilation tests.

## Architecture Check

1. Explicit policy guards for canonical-shape contracts reduce drift and reviewer-memory dependence.
2. This preserves game-agnostic boundaries: it constrains compiler contract hygiene, not game-specific behavior.
3. No aliases/shims are introduced; this hardens no-backwards-compatibility enforcement.

## What to Change

### 1. Add policy test for canonical predicate shape enforcement in CNL

Add a lint/policy test that inspects `compile-conditions.ts` and fails if token-filter/asset-row predicate lowering reintroduces alias fallback reads (`source.eq`, `source.neq`, `source.in`, `source.notIn`).

### 2. Lock canonical import/contract usage in CNL predicate lowering

Do not duplicate existing ownership policy coverage. Reuse current broad guard (`predicate-op-contract-ownership-policy.test.ts`) as the contract-import source of truth and keep this ticket focused on the missing alias-read regression guard.

## Files to Touch

- `packages/engine/test/unit/lint/cnl-predicate-shape-policy.test.ts` (new)

## Out of Scope

- Runtime validator traversal-mode work (`archive/tickets/TOKFILAST-038-token-filter-dual-traversal-modes-and-boundary-mapper-unification.md`).
- Predicate runtime semantics or diagnostic code taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Policy fails when CNL predicate lowering reads alias keys for token-filter or `assetRows.where` parsing.
2. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Canonical predicate shape contract remains centralized and fail-closed in CNL.
2. `GameDef` runtime/simulator remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-predicate-shape-policy.test.ts` — guard no-alias parsing in `compile-conditions.ts` token-filter and `assetRows.where` predicate lowering paths.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - Added `packages/engine/test/unit/lint/cnl-predicate-shape-policy.test.ts` to enforce a CNL-local policy that forbids alias-property reads (`source.eq`, `source.neq`, `source.in`, `source.notIn`) inside `lowerTokenFilterEntry` and `lowerAssetRowFilterEntry`.
  - Added structural guard assertions that both predicate-lowering functions explicitly invoke `rejectPredicateAliasKeysWhenCanonicalShapePresent`.
  - Updated this ticket's assumptions/scope to acknowledge that predicate-op import ownership is already covered by existing broad policy tests.
- Deviations from original plan:
  - No helper changes were needed in `packages/engine/test/helpers/lint-policy-helpers.ts`.
  - No engine source changes were needed; existing architecture already enforces canonical runtime behavior, and only the missing regression policy test was added.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
