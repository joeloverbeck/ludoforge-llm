# 65INTINTDOM-007: ActionId, PhaseId, SeatId migration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — branded.ts (3 ID types), all kernel/cnl/sim/agents/runner modules referencing these types
**Deps**: `tickets/65INTINTDOM-006.md`

## Problem

After ZoneId migration (Phase 1), the remaining string-branded domain IDs — `ActionId`, `PhaseId`, `SeatId` — still contribute to string comparison overhead (`Builtins_StringEqual` at 2.12%, `Builtins_FindOrderedHashSetEntry` at 3.15%). Migrating these to `Brand<number>` follows the same pattern as ZoneId and eliminates the remaining string-based domain ID operations.

## Assumption Reassessment (2026-04-03)

1. `ActionId` is `Brand<string, 'ActionId'>` in `branded.ts:6` — ~53 files import it across engine.
2. `PhaseId` is `Brand<string, 'PhaseId'>` in `branded.ts:7`.
3. `SeatId` is `Brand<string, 'SeatId'>` in `branded.ts:9`.
4. `TriggerId` is `Brand<string, 'TriggerId'>` in `branded.ts:8` — remains string (unique per definition, not a domain enum). NOT migrated.
5. `TokenId` is `Brand<string, 'TokenId'>` in `branded.ts:5` — remains string (unique per-instance). NOT migrated.
6. Intern table from ticket 001 already has `actions`, `seats`, `phases` arrays.
7. Runner imports `ActionId` and `SeatId` — runner must also be migrated.

## Architecture Check

1. Same pattern as ZoneId migration (ticket 002) — change `Brand<string>` to `Brand<number>`, fix compilation errors, update tests. Mechanical transformation.
2. Intern table already has slots for these ID types (ticket 001). Compiler already generates the mapping.
3. No backwards-compatibility shims — all three types change atomically in one commit. Foundation 14.
4. Extern/intern functions at serialization boundaries extend the pattern from ticket 004.

## What to Change

### 1. Change branded types in `branded.ts`

Change `ActionId`, `PhaseId`, `SeatId` from `Brand<string>` to `Brand<number>`. Update their `as*` constructors and `is*` guards.

### 2. Fix all compilation errors across engine

Same process as ticket 002 — run `pnpm turbo typecheck`, fix every error. Patterns are identical to ZoneId migration.

### 3. Fix falsy-check hazard

Grep for bare truthiness checks on `ActionId`, `PhaseId`, `SeatId`. Replace with explicit `!== undefined` checks. Index 0 is valid for all these types.

### 4. Update compiler to emit integer IDs

Compiler modules that emit ActionId, PhaseId, SeatId values use intern table lookups.

### 5. Add extern/intern integration at serialization boundaries

Extend the serialization boundary from ticket 004 to cover ActionId, PhaseId, SeatId in traces, agent output, and diagnostics.

### 6. Update runner

Fix all runner files that import ActionId or SeatId. Same pattern as ticket 005 (runner zone migration).

### 7. Update tests and golden fixtures

All test files constructing or comparing these ID types update to integer values.

## Files to Touch

- `packages/engine/src/kernel/branded.ts` (modify) — ActionId, PhaseId, SeatId types
- All kernel modules importing these types (modify) — ~53 files
- `packages/engine/src/cnl/` (modify) — compiler ID emission
- `packages/engine/src/sim/` (modify) — trace serialization for action/phase/seat IDs
- `packages/engine/src/agents/` (modify) — agent decision traces
- `packages/runner/src/` (modify) — runner files using ActionId, SeatId
- All test files and golden fixtures (modify)

## Out of Scope

- `TokenId` migration — remains string (unique per-instance, not domain enum)
- `TriggerId` migration — remains string (unique per definition)
- Variable name interning (ticket 009)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes with zero errors
2. No bare truthiness checks on ActionId, PhaseId, SeatId remain
3. Serialized traces contain string action/phase/seat names (via extern)
4. FITL and Texas Hold'em compile, run, and produce valid traces
5. Existing suite: `pnpm turbo test`

### Invariants

1. `ActionId`, `PhaseId`, `SeatId` are `Brand<number>` — never strings at runtime
2. `TokenId` and `TriggerId` remain `Brand<string>` — unchanged
3. All serialization boundaries convert integer IDs to human-readable strings

## Test Plan

### New/Modified Tests

1. All tests constructing ActionId/PhaseId/SeatId — update from string to integer
2. `packages/engine/test/unit/kernel/branded.test.ts` — verify all migrated types accept number

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`
