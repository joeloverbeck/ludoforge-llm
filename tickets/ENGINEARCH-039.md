# ENGINEARCH-039: Decouple zoneVar type metadata contracts from globalVar typing in validator context

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator type contract cleanup + targeted tests
**Deps**: none

## Problem

`ValidationContext.zoneVarTypesByName` is currently typed via `GameDef['globalVars'][number]['type']` to keep zoneVar boolean checks compilable after zoneVars became int-only. This is an architectural coupling smell and obscures ownership of zoneVar typing contracts.

## Assumption Reassessment (2026-02-25)

1. `GameDef.zoneVars` is now int-only by type/schema contract.
2. `validate-gamedef-behavior.ts` still contains boolean-target checks for zoneVar transfer endpoints, and context typing was widened indirectly through globalVar typing to satisfy that path.
3. **Mismatch + correction**: validator context contracts should be explicit and self-owned (not coupled to unrelated globalVar type definitions), with boolean zoneVar handling resolved intentionally.

## Architecture Check

1. Explicit, locally-owned type contracts are cleaner and safer than cross-domain type coupling hacks.
2. This is pure engine contract hygiene in agnostic validation code, with no game-specific behavior.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Introduce explicit variable-type alias usage in validator context

Refactor validator context typing for scoped variable type maps to use explicit/shared variable-type contract types (for example `VariableDef['type']` or dedicated alias), not `globalVars` as a proxy.

### 2. Make zoneVar boolean checks intentional under new int-only contract

Resolve zoneVar boolean-target checks by design:
- either remove unreachable zoneVar boolean checks in behavior validation and rely on structure/contract diagnostics,
- or preserve a clearly documented degraded-input path without type coupling.

### 3. Add/adjust tests for diagnostic ownership

Ensure test coverage makes diagnostic ownership explicit for invalid zoneVar type definitions vs downstream zoneVar operation diagnostics.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` or shared type module (modify only if alias extraction needed)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- CNL compiler diagnostic gating (covered separately)
- Game-specific rules or data changes

## Acceptance Criteria

### Tests That Must Pass

1. Validator context type maps are explicit and decoupled from globalVar type definitions.
2. ZoneVar invalid-type diagnostics remain deterministic and non-ambiguous under int-only contract.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped variable type metadata contracts are explicit, local, and maintainable.
2. ZoneVar contract violations fail at the intended layer without hidden coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — verify diagnostic ownership for invalid zoneVars definitions and downstream effects.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert no regressions for valid zoneVar int operation flows.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/validate-gamedef.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
