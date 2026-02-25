# ENGINEARCH-034: Make zoneVars contract explicitly integer-only end-to-end

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — core type/schema contract hardening + validator/tests
**Deps**: none

## Problem

`zoneVars` runtime/storage and mutation semantics are integer-oriented, but top-level variable contracts still permit boolean variable definitions in generic `VariableDef` usage. This creates a type-contract ambiguity that can leak invalid game definitions toward runtime.

## Assumption Reassessment (2026-02-25)

1. Runtime state stores `zoneVars` as numeric maps and `addVar`/`transferVar` expect numeric behavior.
2. Validator/runtime already contain boolean-target rejection paths for zone-scoped numeric operations, indicating intended numeric-only semantics.
3. **Mismatch + correction**: `GameDef`/schema typing does not yet encode this intent explicitly for `zoneVars`; the contract should be made explicit at definition time.

## Architecture Check

1. Encoding integer-only zone variable semantics at the contract boundary is cleaner than permitting broader definitions and rejecting later by operation type.
2. This preserves game-agnostic architecture: constraint is generic engine data semantics, not game-specific branching.
3. No backwards-compatibility shims: non-conforming zone variable definitions become invalid by contract.

## What to Change

### 1. Harden zoneVars type contracts

Update type/schema surfaces so `zoneVars` accepts only integer variable definitions (not boolean), including:
- top-level `GameDef` type shape
- zod schema for `GameDef`
- generated JSON schemas

### 2. Align validator diagnostics

Ensure validator diagnostics clearly surface invalid `zoneVars` definitions at definition/contract time, rather than only through downstream operation checks.

### 3. Add regression coverage

Add tests proving:
- boolean `zoneVars` definitions are rejected by schema/validation.
- integer `zoneVars` definitions remain valid.
- no regressions for existing zone-var integer operation flows.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify, if relevant to mirrored contracts)
- `packages/engine/src/kernel/schemas-top-level.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/transfer-var.test.ts` (modify if fixtures need tightening)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifacts)
- `packages/engine/schemas/EvalReport.schema.json` (modify via artifacts if transitive)

## Out of Scope

- Changes to `GameSpecDoc` or `visual-config.yaml` data conventions
- Runner event-log rendering
- Non-zone variable contract changes

## Acceptance Criteria

### Tests That Must Pass

1. `GameDef` schema/validation rejects boolean `zoneVars` definitions.
2. Existing integer `zoneVars` compile/validate/execute flows remain green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `zoneVars` definition contract is explicit and consistent with runtime numeric semantics.
2. Invalid zone variable type definitions fail early at contract boundaries.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — reject boolean `zoneVars` definitions.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — validator diagnostics for invalid `zoneVars` definition type.
3. `packages/engine/test/unit/transfer-var.test.ts` — ensure integer `zoneVars` behavior remains unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test -- test/unit/schemas-top-level.test.ts test/unit/validate-gamedef.test.ts test/unit/transfer-var.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
