# ENG-207: Consolidate Sequence-Context Schema Ownership

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schema contract deduplication and ownership cleanup
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts

## Problem

`FreeOperationSequenceContextSchema` is currently duplicated in multiple schema modules. This creates drift risk and weakens contract ownership clarity.

## Assumption Reassessment (2026-03-09)

1. Sequence-context schema shape/refinement is duplicated in AST and extension schema modules.
2. Current duplicates are equivalent now, but future edits can diverge silently.
3. Mismatch: schema ownership is not single-source. Correction: extract one canonical schema helper and import it everywhere.

## Architecture Check

1. Single-source schema ownership is cleaner and reduces contract drift risk.
2. The change is purely agnostic infrastructure and does not introduce game-specific logic into runtime or `GameDef`.
3. No compatibility layer: replace duplicate definitions with canonical imports.

## What to Change

### 1. Extract canonical schema helper

Move `FreeOperationSequenceContextSchema` to one owned module (for example shared kernel schema contracts) with exact current refinement semantics.

### 2. Replace duplicate local definitions

Update `schemas-ast` and `schemas-extensions` to import the canonical schema helper.

### 3. Add drift guard

Add/extend a unit test to enforce single-source ownership for free-operation sequence-context schema.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/<new-or-existing-shared-schema-module>.ts` (new/modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)

## Out of Scope

- Behavioral changes to sequence-context runtime matching.
- Ia Drang/event-data updates.

## Acceptance Criteria

### Tests That Must Pass

1. Both AST and extension schema paths still validate/reject sequence-context payloads identically.
2. There is a single canonical schema definition source for sequence-context shape/refinement.
3. Existing suite: `node --test packages/engine/dist/test/unit/schemas-ast.test.js`

### Invariants

1. Sequence-context schema contract remains unchanged in behavior.
2. Contract ownership is centralized to one source of truth.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — preserve schema behavior parity.
2. `packages/engine/test/unit/schemas-top-level.test.ts` — ensure top-level schema still accepts canonical sequence-context contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/schemas-ast.test.js`
3. `node --test packages/engine/dist/test/unit/schemas-top-level.test.js`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`
