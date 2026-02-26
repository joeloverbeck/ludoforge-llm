# ENGINEARCH-044: Encode zoneVar int-only invariants directly in behavior-validator type contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator contract hardening + focused tests
**Deps**: none

## Problem

After decoupling `zoneVar` typing from `globalVars`, behavior validation still uses generic scoped-var type helper shapes that include boolean for all scopes. This leaves an avoidable ambiguity: zoneVar paths are int-only by contract and should not be represented as potentially boolean in behavior helper signatures.

## Assumption Reassessment (2026-02-26)

1. `GameDef.zoneVars` is int-only by type/schema/structure-validation contract.
2. `validate-gamedef-behavior.ts` still exposes shared scoped-var type retrieval signatures that return `int | boolean | undefined` without encoding zoneVar int-only constraints in function-level contracts.
3. **Mismatch + correction**: internal behavior-validator helper contracts should express scope-specific invariants directly, reducing drift surface and dead conditional branches.

## Architecture Check

1. Scope-specific helper contracts are cleaner and more robust than broad unions that encode impossible states.
2. This hardening stays within agnostic validator internals; no game-specific branches leak into `GameDef`/runtime/simulator.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Refine behavior-validator helper contracts

Refactor scoped-var type helper(s) in `validate-gamedef-behavior.ts` so zoneVar paths are modeled as int-only (or do not use type lookup where unnecessary), while preserving global/pvar boolean handling.

### 2. Remove stale impossible-state checks

Eliminate/avoid helper-level branches and call sites that rely on impossible zoneVar boolean states, keeping diagnostics ownership in structure validation.

### 3. Add targeted tests for helper-driven behavior invariants

Add/adjust tests to ensure behavior diagnostics still fire correctly for boolean global/pvar targets and stay absent for zoneVar boolean-target behavior paths.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify only if context type simplification is required)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime effect execution changes
- CNL compiler diagnostic indexing work
- Game-specific GameSpecDoc or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Behavior-validator helper contracts no longer model zoneVar type as potentially boolean.
2. Existing global/pvar boolean-target diagnostics remain intact.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. ZoneVar int-only rule is encoded consistently across validator structure and behavior layers.
2. Validator contracts stay explicit, local, and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — assert boolean-target diagnostics remain for global/pvar paths.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert no zoneVar boolean-target behavior diagnostics are emitted for invalid zoneVar definitions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
