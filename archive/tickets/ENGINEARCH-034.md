# ENGINEARCH-034: Make zoneVars contract explicitly integer-only end-to-end

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — core type/schema contract hardening + validator/tests
**Deps**: none

## Problem

`zoneVars` runtime/storage and mutation semantics are integer-oriented, but top-level variable contracts still permit boolean variable definitions in generic `VariableDef` usage. This creates a type-contract ambiguity that can leak invalid game definitions toward runtime.

## Assumption Reassessment (2026-02-25)

1. Runtime state stores `zoneVars` as numeric maps and `addVar`/`transferVar` expect numeric behavior.
2. Validator/runtime already contain boolean-target rejection paths for zone-scoped numeric operations, indicating intended numeric-only semantics.
3. `GameDefSchema` currently allows `zoneVars` to use generic `VariableDef` (`int | boolean`), so contract-level schema parsing does not fail early for boolean `zoneVars`.
4. `validateGameDef` is semantic-only and does not parse through `GameDefSchema`; malformed/casted inputs can bypass schema-only safeguards unless structure validation also enforces the invariant.
5. **Mismatch + correction**: contract hardening must cover both schema contracts and semantic validation (`validateGameDef`) so the invariant holds regardless of entry path.

## Architecture Check

1. Encoding integer-only zone variable semantics at the contract boundary is cleaner than permitting broader definitions and rejecting later by operation type.
2. This preserves game-agnostic architecture: constraint is generic engine data semantics, not game-specific branching.
3. No backwards-compatibility shims: non-conforming zone variable definitions become invalid by contract.

## What to Change

### 1. Harden zoneVars type contracts

Update type/schema surfaces so `zoneVars` accepts only integer variable definitions (not boolean), including:
- top-level `GameDef` type shape
- zod schema for `GameDef` (from `schemas-core.ts`; there is no `schemas-top-level.ts` file in current codebase)
- generated JSON schemas

### 2. Align validator diagnostics

Ensure validator diagnostics clearly surface invalid `zoneVars` definitions at definition/contract time, not only via downstream operation checks. This must be enforced in semantic validation as well, because `validateGameDef` can run on pre-cast input without schema parsing.

### 3. Add regression coverage

Add tests proving:
- boolean `zoneVars` definitions are rejected by schema/validation.
- integer `zoneVars` definitions remain valid.
- no regressions for existing zone-var integer operation flows.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify, if relevant to mirrored contracts)
- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/transfer-var.test.ts` (modify only if required by contract changes)
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
2. `packages/engine/test/unit/validate-gamedef.test.ts` — semantic validator diagnostics for invalid `zoneVars` definition type, including cases that do not exercise `addVar`/`transferVar`.
3. `packages/engine/test/unit/transfer-var.test.ts` — unchanged unless contract tightening requires fixture updates.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test -- test/unit/schemas-top-level.test.ts test/unit/validate-gamedef.test.ts test/unit/transfer-var.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What was changed**:
  - Hardened `GameDef.zoneVars` type contract to integer-only (`IntVariableDef[]`) in core types.
  - Hardened `GameDefSchema` (`schemas-core.ts`) so `zoneVars` accepts only integer variable definitions.
  - Added semantic validator guard (`validate-gamedef-structure.ts`) to emit `ZONE_VAR_TYPE_INVALID` for non-int `zoneVars` when schema parsing is bypassed.
  - Extended compiler lowering (`compiler-core.ts`) to reject non-int `doc.zoneVars` with explicit diagnostics and emit only integer `zoneVars` in compiled `GameDef`.
  - Regenerated schema artifacts (`GameDef.schema.json`, `Trace.schema.json`, `EvalReport.schema.json`).
  - Added regression tests for schema-level and semantic-level rejection of boolean `zoneVars`.
- **Deviation from original plan**:
  - Ticket initially targeted `schemas-top-level.ts`, which no longer exists; implementation was correctly applied in `schemas-core.ts`.
  - Added a compiler-layer invariant guard not explicitly listed in the original ticket to preserve end-to-end contract consistency.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine schema:artifacts` ✅
  - `pnpm -F @ludoforge/engine test -- test/unit/schemas-top-level.test.ts test/unit/validate-gamedef.test.ts test/unit/transfer-var.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
