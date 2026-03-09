# ENG-215: Align Sequence-Context Linkage Validation with Runtime Issuance Scopes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation sequence-context validator scope semantics
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/event-execution.ts

## Problem

Static sequence-context linkage validation currently partitions event-side and effect-side grant scopes differently than runtime issuance/execution. This can reject valid contracts where capture and require are split across side+branch arrays that are combined at runtime.

## Assumption Reassessment (2026-03-09)

1. Runtime combines side and selected-branch free-operation grants in one issuance set (`collectFreeOperationGrants`), so chain linkage may legally span side+branch grants.
2. Runtime combines side and selected-branch effect arrays into one effect execution list (`collectEventEffects`), so effect-issued grant linkage may legally span side+branch effects.
3. Mismatch: current validator checks side/branch scopes independently and can emit false-positive linkage errors. Correction: validate per runtime-equivalent issuance scope.

## Architecture Check

1. Matching static validation scope to runtime scope is cleaner and prevents semantic drift between compile-time and execution-time behavior.
2. The change is purely contract validation logic and keeps GameDef/simulator/kernel game-agnostic (no game/card identifiers).
3. No backwards-compatibility aliases/shims: use one canonical scoping model based on runtime issuance semantics.

## What to Change

### 1. Event grant scope parity with runtime

Validate `freeOperationGrants` in the exact scopes runtime can issue:
- side-only scope
- side+branch scope for each branch candidate

### 2. Effect-issued grant scope parity with runtime

Validate `grantFreeOperation` linkage in the same effect-list scopes runtime executes:
- side effects scope
- side+branch effects scope for each branch candidate

### 3. Add regression coverage for valid cross-array linkage

Add tests that would currently fail incorrectly (capture in side, require in branch; and vice versa) and assert they now pass validation.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Denial-cause taxonomy changes (`tickets/ENG-206-sequence-context-denial-cause-parity.md`).
- Schema ownership deduplication (`tickets/ENG-207-consolidate-sequence-context-schema-ownership.md`).
- Mandatory grant/outcome contracts (`tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md`).

## Acceptance Criteria

### Tests That Must Pass

1. A card with side capture + branch require on same chain validates successfully.
2. A card with side effect-issued capture + branch effect-issued require on same chain validates successfully.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Static linkage validation scope is isomorphic to runtime issuance/execution scope.
2. Validation remains generic and does not encode FITL/card-specific identifiers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add side+branch linkage pass cases for event grant arrays and effect-issued arrays.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify runtime-legal side+branch linkage definitions are accepted at boundary and execute.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`
