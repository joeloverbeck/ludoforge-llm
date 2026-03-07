# FITLEVENTARCH-005: Event Target JSON Schema Contract Parity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schema artifact contract generation/parity
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, packages/engine/schemas/GameDef.schema.json

## Problem

Runtime/Zod validation enforces `application: each` requires non-empty `targets[].effects`, but generated `GameDef.schema.json` currently does not encode that conditional. External schema consumers can accept structurally-invalid canonical event targets.

## Assumption Reassessment (2026-03-07)

1. `EventCardTargetSchema` in kernel schema extensions has a super-refinement requiring `effects` for `application: each`.
2. Current generated `GameDef.schema.json` requires `application` but lacks explicit conditional requirement for `effects` when `application` is `each`.
3. Mismatch: external schema contract is weaker than runtime contract and should be aligned.

## Architecture Check

1. One canonical contract across runtime and exported schema prevents drift and integration bugs.
2. This is infrastructure-level and game-agnostic; no game-specific behavior leaks into engine logic.
3. No backward-compatibility shims: schema should encode canonical strictness directly.

## What to Change

### 1. Encode conditional requirement in exported schema

Ensure generated `GameDef.schema.json` (and source-generation path) captures: `application == "each" => effects required (minItems: 1)`.

### 2. Add schema-parity tests

Add/update unit tests that fail if generated schema drops the `each -> effects` requirement.

### 3. Keep artifact workflow deterministic

Regenerate artifacts through standard script and verify schema-check gate remains stable.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts` (modify if needed for JSON-schema emission compatibility)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/schema-artifacts-sync.test.ts` (modify, if required)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifact generation)

## Out of Scope

- Event execution/runtime logic changes
- FITL card content migrations
- Runner validation UX changes

## Acceptance Criteria

### Tests That Must Pass

1. Generated `GameDef.schema.json` rejects event targets with `application: each` and missing `effects`.
2. Runtime and exported schema behavior are aligned for event-target application contract.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Exported schema and runtime schema contract remain semantically equivalent for event targets.
2. Contract remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — add negative parse case for `application: each` without effects.
2. `packages/engine/test/unit/schema-artifacts-sync.test.ts` — ensure generated artifacts preserve conditional contract.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/schemas-top-level.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
