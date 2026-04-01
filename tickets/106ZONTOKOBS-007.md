# 106ZONTOKOBS-007: Diagnostic codes, schema artifacts, and full verification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `compiler-diagnostic-codes.ts`, schema artifacts
**Deps**: `archive/tickets/106ZONTOKOBS-001.md`, `archive/tickets/106ZONTOKOBS-002.md`, `archive/tickets/106ZONTOKOBS-003.md`, `tickets/106ZONTOKOBS-004.md`, `tickets/106ZONTOKOBS-005.md`, `tickets/106ZONTOKOBS-006.md`, `specs/106-zone-token-observer-integration.md`

## Problem

New diagnostic codes used by zone validation and compilation must be registered in the canonical diagnostic codes registry to pass the diagnostic registry audit test. Schema artifacts must be regenerated and verified idempotent. Full verification must pass.

## Assumption Reassessment (2026-04-01)

1. `compiler-diagnostic-codes.ts` exists with `COMPILER_DIAGNOSTIC_CODES_COMPILER_CORE` object — confirmed. New observer zone codes must be added here.
2. The diagnostic registry audit test (`compiler-diagnostic-registry-audit.test.ts`) forbids inline diagnostic string literals outside canonical registries — confirmed (encountered during Spec 102 ticket 005).
3. `schema:artifacts:check` validates schema artifacts are in sync — confirmed.

## Architecture Check

1. All diagnostic codes registered in the canonical registry — consistent with codebase conventions.
2. Schema artifacts regenerated from Zod schemas — the zone types added in tickets 001 automatically flow into the JSON schema.
3. Full verification is the final gate before the spec is considered complete.

## What to Change

### 1. Register diagnostic codes in `compiler-diagnostic-codes.ts`

Add new codes to `COMPILER_DIAGNOSTIC_CODES_COMPILER_CORE`:

- `CNL_COMPILER_OBSERVER_ZONE_UNKNOWN_BASE` — zone base ID not found in game spec
- `CNL_COMPILER_OBSERVER_ZONE_ENTRY_INVALID` — zone entry missing tokens/order or has invalid values
- `CNL_COMPILER_OBSERVER_ZONE_ORDER_SET_WARNING` — order differs from tokens on set-type zone
- `CNL_COMPILER_OBSERVER_ZONE_OWNER_NONE_WARNING` — owner visibility on non-owned zone

### 2. Update inline diagnostic codes in `validate-observers.ts` and `compile-observers.ts`

Replace any inline string literals with canonical `CNL_COMPILER_DIAGNOSTIC_CODES.*` references.

### 3. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

### 4. Full verification

Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/validate-observers.ts` (modify — use canonical codes)
- `packages/engine/src/cnl/compile-observers.ts` (modify — use canonical codes)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)

## Out of Scope

- New feature work — this is a cleanup/verification ticket
- Runner or simulator changes

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic registry audit test passes (no inline diagnostic literals outside canonical registries)
2. `schema:artifacts:check` passes (idempotent)
3. `pnpm turbo build` — build succeeds
4. `pnpm turbo test` — all tests pass
5. `pnpm turbo lint` — lint passes (0 warnings)
6. `pnpm turbo typecheck` — typecheck passes

### Invariants

1. All diagnostic codes are in the canonical registry
2. Schema artifacts are always in sync with Zod schemas

## Test Plan

### New/Modified Tests

1. No new test files — verification of existing tests and diagnostic audit

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate schemas
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` — full verification
