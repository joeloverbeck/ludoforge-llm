# ENGINEARCH-028: Make transfer/resource endpoints discriminated contracts across AST, runtime types, and schemas

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — AST/runtime types, validators, schemas, resource-transfer execution path
**Deps**: none

## Problem

`transferVar`/`resourceTransfer` endpoint payloads currently allow invalid field combinations at type/schema boundaries (for example wrong optional `player`/`zone` pairings per scope). Runtime validators catch some issues, but invalid states are still representable in core contracts. This weakens engine invariants and makes long-term extension risky.

## Assumption Reassessment (2026-02-25)

1. `transferVar` now supports `zoneVar` endpoints in compiler/runtime, but endpoint contracts remain broad object shapes with optional fields instead of strict discriminated unions.
2. `resourceTransfer` trace endpoints now include `zone` support, but schema/type shape still permits cross-scope field drift (`player` and `zone` both optional regardless of scope).
3. **Mismatch + correction**: current behavior is stricter than current contract model; ticket scope must harden the contracts themselves so invalid states are unrepresentable before runtime.

## Architecture Check

1. Discriminated endpoint contracts are cleaner and more robust than permissive optional-field objects because scope-specific requirements are encoded directly in type/schema structure.
2. This remains game-agnostic engine work: it tightens shared transfer/trace contracts without embedding game-specific logic.
3. No backwards-compatibility aliases/shims: remove permissive endpoint shapes and require strict scope-compatible payloads everywhere.

## What to Change

### 1. Introduce shared discriminated endpoint contracts

Define canonical endpoint unions for:
- AST `transferVar` endpoints (`global`, `pvar`, `zoneVar`)
- runtime trace `resourceTransfer` endpoints (`global`, `perPlayer`, `zone`)

Each branch must require only the fields valid for that scope and forbid the others.

### 2. Rewire types/schemas/runtime helpers to use the canonical contracts

Refactor type and schema definitions to reuse canonical endpoint contracts instead of duplicating ad-hoc object literals. Update runtime helper signatures in `effects-resource.ts`/related validator helpers so contracts stay aligned.

### 3. Preserve and enforce strict invariants

Ensure schema validation, compile-time type checks, and runtime paths all agree on the same endpoint invariants with no drift.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifacts)
- `packages/engine/schemas/Trace.schema.json` (modify via artifacts)

## Out of Scope

- New game mechanics beyond endpoint contract hardening
- Runner/UI formatting behavior
- Game-specific transfer semantics

## Acceptance Criteria

### Tests That Must Pass

1. AST/schema parsing rejects endpoint payloads that do not match scope-specific required/forbidden fields.
2. Runtime transfer and trace contracts are structurally aligned with schema artifacts for all endpoint scopes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Endpoint contract invalid states are unrepresentable in core type/schema models.
2. Compiler/runtime/schema endpoint contracts remain in lockstep (no scope-field drift).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — enforce strict endpoint branch acceptance/rejection by scope.
2. `packages/engine/test/unit/json-schema.test.ts` — enforce strict serialized trace endpoint contract shape.
3. `packages/engine/test/unit/transfer-var.test.ts` — ensure runtime behavior matches tightened endpoint contracts.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
