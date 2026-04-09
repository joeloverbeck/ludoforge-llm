# 122CROSEAVIC-002: Recognize `$seat` placeholder in policy surface reference resolution

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/policy-surface
**Deps**: `archive/tickets/122CROSEAVIC-001.md`

## Problem

The policy surface reference resolver (`parseAuthoredPolicySurfaceRef()` and `resolvePolicyRoleSelector()`) only recognizes `self`, `active`, and literal seat names in seat-token positions. References like `victory.currentMargin.$seat` return `null` (no match). The `seatAgg` operator needs `$seat` as a context-variable placeholder that resolves to the currently iterated seat during aggregation.

This is a **novel placeholder pattern** — existing aggregation operators (`globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg`) use imperative iteration without placeholder variables. `$seat` is the first context-variable-based aggregation binding in the Agent Policy DSL.

## Assumption Reassessment (2026-04-09)

1. `parseAuthoredPolicySurfaceRef()` lives at `packages/engine/src/agents/policy-surface.ts:26` — confirmed. It uses string prefix matching on reference paths.
2. `resolvePolicyRoleSelector()` lives at `packages/engine/src/agents/policy-surface.ts:280` — confirmed. It handles `self`, `active`, and literal seat tokens.
3. `SurfaceSelector` type with `kind: 'role'` and `seatToken: string` already supports arbitrary seat tokens — confirmed. No type change needed; only the resolution function needs to handle `$seat`.
4. Victory margin references are parsed from paths like `victory.currentMargin.<seatToken>` at lines 114-129 — confirmed.

## Architecture Check

1. `$seat` is recognized as a valid seat token at parse time (alongside `self` and `active`), and resolved at evaluation time by the evaluator (ticket 005). This maintains the compiler-kernel boundary: the surface module parses and validates, the evaluator resolves.
2. Game-agnostic: `$seat` is a generic placeholder, not a game-specific seat name.
3. No backwards-compatibility shims — `$seat` is additive to the existing seat-token recognition.

## What to Change

### 1. Recognize `$seat` in `parseAuthoredPolicySurfaceRef()` (policy-surface.ts)

In every code path that extracts a seat token from a reference path (e.g., `victory.currentMargin.<seatToken>`, `var.player.<seatToken>`, etc.), accept `$seat` as a valid seat token value. Currently these paths accept `self`, `active`, and literal seat names — add `$seat` to the acceptance set.

### 2. Extend `resolvePolicyRoleSelector()` to handle `$seat` (policy-surface.ts)

Add a case for `seatToken === '$seat'`:
- Accept a `seatContext` parameter (or retrieve it from the evaluation context passed to the resolver).
- When `$seat` is encountered and a seat context is bound, return the bound seat ID.
- When `$seat` is encountered and no seat context is bound, return `undefined` — this signals a compile-time error if `$seat` is used outside a `seatAgg` expression.

### 3. Unit tests for `$seat` resolution

Test cases:
- `$seat` with a bound seat context → returns the bound seat ID.
- `$seat` with no bound seat context → returns `undefined`.
- `$seat` in `victory.currentMargin.$seat` → parses successfully with `seatToken: '$seat'`.
- Existing `self` and `active` resolution unchanged.

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/test/unit/agents/policy-surface.test.ts` (modify — add `$seat` test cases)

## Out of Scope

- Compilation of `seatAgg` expressions (ticket 003)
- Runtime seat-context binding in `PolicyEvaluationContext` (ticket 005)
- Validation that `$seat` only appears within `seatAgg.expr` (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. `parseAuthoredPolicySurfaceRef('victory.currentMargin.$seat', ...)` returns a valid `SurfaceSelector` with `seatToken: '$seat'`.
2. `resolvePolicyRoleSelector(...)` with `seatToken: '$seat'` and a bound seat context returns the correct seat ID.
3. `resolvePolicyRoleSelector(...)` with `seatToken: '$seat'` and no seat context returns `undefined`.
4. Existing `self` and `active` resolution tests continue to pass.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `$seat` is recognized only as a seat-token placeholder — it must not be confused with a literal seat name.
2. Existing seat-token resolution for `self`, `active`, and literal names is unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-surface.test.ts` — add `$seat` parse and resolve test cases

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-09

Implemented the live resolver gap in `packages/engine/src/agents/policy-surface.ts` by adding optional `seatContext` support to `resolvePolicyRoleSelector()` and returning `undefined` for unbound `$seat`.

Kept parse-time behavior unchanged because the current parser already accepts arbitrary role seat tokens, including `$seat`, for `victory.currentMargin.<seatToken>` and related role-token surfaces. Added unit coverage in `packages/engine/test/unit/agents/policy-surface.test.ts` to prove that existing behavior explicitly.

Updated the direct runtime fallout in `packages/engine/src/agents/policy-preview.ts` and `packages/engine/src/agents/policy-runtime.ts` so unbound `$seat` resolves fail closed as unavailable/undefined instead of flowing into seat-map or player-index lookups.

Deviation from original plan: the ticket claimed parse-time `$seat` recognition was missing, but reassessment showed the parser already accepted arbitrary role seat tokens. The implemented change therefore focused on resolver behavior and tests, while leaving parse logic unchanged.

Verification completed with:

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
