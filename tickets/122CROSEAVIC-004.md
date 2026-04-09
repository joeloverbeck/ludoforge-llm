# 122CROSEAVIC-004: Validate `seatAgg` structure and `$seat` usage scope

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl/validate-agents
**Deps**: `tickets/122CROSEAVIC-003.md`

## Problem

The agent validator does not check `seatAgg` expressions. Without validation, authors could use `$seat` outside of a `seatAgg.expr` context (which would be meaningless at runtime), or provide malformed `seatAgg` structures that pass compilation but fail at evaluation time.

## Assumption Reassessment (2026-04-09)

1. Agent validation lives at `packages/engine/src/cnl/validate-agents.ts` (387 lines) — confirmed.
2. The validator performs structural and semantic checks on authored agent YAML before compilation.
3. `$seat` recognition is handled by the surface parser (ticket 002), but scope enforcement (only within `seatAgg.expr`) needs to be validated here.

## Architecture Check

1. Foundation 12 (Compiler-Kernel Boundary): Scope validation for `$seat` is knowable from the spec alone — it belongs in the compiler/validator, not at runtime.
2. Follows existing validation patterns — structural checks on expression nodes, cross-referencing against GameDef declarations.
3. No backwards-compatibility shims.

## What to Change

### 1. Add `seatAgg` structural validation (validate-agents.ts)

Validate that `seatAgg` expressions have:
- `over`: must be `'opponents'`, `'all'`, or an array of strings.
- `expr`: must be a valid expression node.
- `aggOp`: must be a valid `AgentPolicyZoneTokenAggOp`.
- No extra unrecognized keys.

### 2. Add `$seat` scope enforcement

Static check: `$seat` must only appear in reference paths within a `seatAgg.expr` subtree. If `$seat` appears in a reference path outside of any `seatAgg` context, emit a validation error: "$seat placeholder can only be used within seatAgg.expr."

Implementation approach: Track whether the current expression being validated is inside a `seatAgg.expr` context (e.g., via a boolean flag or context parameter). When validating reference paths, check for `$seat` and reject it if not in a `seatAgg` context.

### 3. Unit tests

Test cases:
- `$seat` used inside `seatAgg.expr` → valid.
- `$seat` used outside any `seatAgg` → validation error.
- `$seat` used in a nested expression inside `seatAgg.expr` → valid.
- Malformed `seatAgg` (missing `aggOp`, missing `expr`, extra keys) → validation error.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/test/unit/validate-agents.test.ts` (modify — add seatAgg validation tests; verify this file exists, create if needed)

## Out of Scope

- Runtime evaluation (ticket 005)
- Compilation logic (ticket 003)
- Explicit seat list validation against GameDef.seats (handled in ticket 003 at compile time)

## Acceptance Criteria

### Tests That Must Pass

1. `$seat` in a reference path inside `seatAgg.expr` passes validation.
2. `$seat` in a reference path outside `seatAgg` produces a validation error.
3. Malformed `seatAgg` (missing required fields) produces a validation error.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing expression validation rules continue to apply unchanged.
2. `$seat` scope enforcement is a compile-time check — no runtime overhead.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-agents.test.ts` — add `seatAgg` validation and `$seat` scope tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
