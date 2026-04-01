# 102SHAOBSMOD-003: Create observer validation (`validate-observers.ts`)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new `validate-observers.ts`, modified `validate-agents.ts`
**Deps**: `archive/tickets/102SHAOBSMOD-002.md`, `specs/102-shared-observer-model.md`

## Problem

Observer profiles need structural validation before compilation: checking surface family keys, visibility class values, `extends` references, depth limits, reserved keys, built-in name collisions, and per-variable override references. This logic does not belong in agent validation since observers are a shared concern.

## Assumption Reassessment (2026-04-01)

1. `validate-agents.ts` exists at `packages/engine/src/cnl/validate-agents.ts` — confirmed.
2. Existing surface validation in `validate-agents.ts` covers `agents.visibility` — this will be extracted/adapted for observer profiles.
3. The known surface family keys match the `CompiledSurfaceCatalog` shape in `types-core.ts` (after ticket 001 rename): `globalVars`, `perPlayerVars`, `derivedMetrics`, `victory`, `activeCardIdentity`, `activeCardTag`, `activeCardMetadata`, `activeCardAnnotation` — confirmed.
4. The compiler diagnostic pattern used in the codebase passes `diagnostics` arrays — the new validator will follow the same pattern.

## Architecture Check

1. Extracted into its own file rather than growing `validate-agents.ts` — observer validation is a separate concern from agent policy validation.
2. Game-agnostic: validates structural rules only, no game-specific knowledge.
3. No shims — `validate-agents.ts` loses observer-specific checks; they move to the new file.

## What to Change

### 1. Create `packages/engine/src/cnl/validate-observers.ts`

Implement `validateObservers(observability, knownSurfaceIds, diagnostics)`:

- **Known surface family keys**: reject any key in `surfaces` not in the allowed set.
- **Visibility class values**: each value must be `'public' | 'seatVisible' | 'hidden'`.
- **`extends` validation**:
  - Target must exist in the same `observers` map.
  - Target must not itself use `extends` (max depth = 1).
  - No circular references (A extends B, B extends A).
  - Cannot extend built-in names (`omniscient`, `default`).
- **Built-in name collision**: reject user-defined observers named `omniscient` or `default`.
- **Reserved key `zones`**: emit diagnostic error if present in any observer profile.
- **Per-variable override validation**: for map-type surfaces (`globalVars`, `perPlayerVars`, `derivedMetrics`), verify that per-variable override keys reference variables that exist in the game spec's declared variables (passed via `knownSurfaceIds`).
- **Shorthand syntax validation**: `surfaceName: 'public'` is valid shorthand.
- **Full syntax validation**: `{ current: ..., preview: { visibility: ..., allowWhenHiddenSampling: ... } }` structure.
- **`_default` key**: valid only in map-type surfaces, not in scalar surfaces.

### 2. Extract observer-related checks from `validate-agents.ts`

If `validate-agents.ts` currently validates `agents.visibility` structure, extract those checks to avoid duplication. The agents validator will later (ticket 006) validate the `observer` field reference instead.

## Files to Touch

- `packages/engine/src/cnl/validate-observers.ts` (new)
- `packages/engine/src/cnl/validate-agents.ts` (modify — extract observer checks if present)

## Out of Scope

- Compilation of observers — that is ticket 004
- Wiring validation into the compiler pipeline — that is ticket 005
- Agent profile `observer` field validation — that is ticket 006
- Zone/token visibility validation — Spec 106

## Acceptance Criteria

### Tests That Must Pass

1. Valid observer profile passes validation with no diagnostics
2. Unknown surface family key (e.g., `foo: public`) produces diagnostic error
3. Invalid visibility class (e.g., `globalVars: 'restricted'`) produces diagnostic error
4. `extends` referencing non-existent observer produces diagnostic error
5. `extends` chain deeper than 1 produces diagnostic error
6. Circular `extends` produces diagnostic error
7. User-defined observer named `omniscient` or `default` produces diagnostic error
8. `zones` key in observer profile produces reserved-key diagnostic error
9. Per-variable override referencing non-existent globalVar produces diagnostic error
10. `_default` key in a non-map surface produces diagnostic error

### Invariants

1. Validation is pure — no side effects, no mutation of input
2. All diagnostics include the observer profile name for traceability
3. Validation does not depend on any game-specific knowledge beyond passed `knownSurfaceIds`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-observers.test.ts` — comprehensive validation tests covering all rules above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern validate-observers` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness

## Outcome

- **Completion date**: 2026-04-01
- **What changed**:
  - Created `packages/engine/src/cnl/validate-observers.ts` with `validateObservers(observability, knownSurfaceIds, diagnostics)` implementing all validation rules: surface family keys, visibility class values, `extends` validation (existence, depth-1, circular, built-in rejection), built-in name collision, reserved key `zones`, per-variable override validation, shorthand/full syntax, `_default` restriction to map-type surfaces
  - Created `packages/engine/test/unit/cnl/validate-observers.test.ts` with 28 tests covering all 10 acceptance criteria, 3 invariants, and additional structural edge cases
  - No extraction from `validate-agents.ts` — the existing `agents.visibility` validation uses a different schema format; the new observer validation handles the new `observability.observers` schema independently. `agents.visibility` removal is deferred to ticket 006.
- **Deviations**: No code was extracted from `validate-agents.ts` because the old and new schemas are structurally different (no shared validation logic). This is a non-issue since ticket 006 will remove `agents.visibility` and its validation entirely.
- **Verification**: `pnpm turbo typecheck` passes, `pnpm turbo lint` passes, `pnpm -F @ludoforge/engine test` passes (5405/5405)
