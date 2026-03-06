# LEGACTTOO-012: Normalize Foundation-Ticket Dependency Semantics for check:ticket-deps

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — ticket metadata and dependency-check workflow contract
**Deps**: tickets/LEGACTTOO-001-tooltip-ir-types-verbalization-def-schema.md

## Problem

`pnpm run check:ticket-deps` currently fails because `LEGACTTOO-001` declares `**Deps**: None (foundation ticket)`, which is parsed as an unresolved dependency path. This breaks the repository quality gate even when code is otherwise valid.

## Assumption Reassessment (2026-03-06)

1. `tickets/LEGACTTOO-001-tooltip-ir-types-verbalization-def-schema.md` currently uses a non-path dependency literal.
2. `scripts/check-ticket-deps.mjs` expects dependency entries to resolve to existing repository paths.
3. Mismatch: foundation-ticket intent is valid, but its dependency encoding violates the enforced dependency-path contract.

## Architecture Check

1. Normalizing dependency metadata to machine-verifiable paths is cleaner and more robust than allowing ad-hoc free-text values.
2. This change is process-contract hardening only and does not affect GameSpecDoc, GameDef, or simulation/runtime architecture boundaries.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Correct foundation-ticket dependency encoding

Update `LEGACTTOO-001` dependency metadata to conform to path-based dependency integrity rules.

### 2. Clarify canonical no-dependency representation

Document the accepted `**Deps**` contract for zero-dependency/foundation tickets in `tickets/README.md` (for example explicit empty marker format compatible with current checker behavior, or an explicit self/README path convention if required by current parser rules).

### 3. Verify checker compatibility

Run dependency integrity validation after metadata normalization to ensure root quality gates pass.

## Files to Touch

- `tickets/LEGACTTOO-001-tooltip-ir-types-verbalization-def-schema.md` (modify)
- `tickets/README.md` (modify)
- `scripts/check-ticket-deps.mjs` (modify, only if README-contract-aligned zero-dependency form is not currently supported)
- `packages/engine/test/unit/ticket-deps-check.test.ts` (new, if script behavior is changed)

## Out of Scope

- Tooltip IR or verbalization feature implementation work (`tickets/LEGACTTOO-001-tooltip-ir-types-verbalization-def-schema.md` scope).
- Engine/runtime behavior changes.
- Ticket archival policy changes outside dependency semantics.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm run check:ticket-deps` passes with foundation ticket dependencies encoded per contract.
2. No other active tickets regress dependency-path integrity.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit` (only if script/test files are modified under test coverage).

### Invariants

1. Active ticket dependencies remain machine-verifiable and path-resolvable.
2. Ticket metadata contract remains deterministic and repository-wide.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/ticket-deps-check.test.ts` (optional) — lock checker behavior for foundation/no-dependency encoding if script logic changes.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine test:unit` (if checker test coverage is added/changed)

