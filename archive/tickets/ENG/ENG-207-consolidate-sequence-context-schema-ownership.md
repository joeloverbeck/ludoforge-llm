# ENG-207: Consolidate Sequence-Context Schema Ownership

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schema contract deduplication and ownership cleanup
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts

## Problem

`FreeOperationSequenceContextSchema` is currently duplicated in multiple schema modules. This creates drift risk and weakens contract ownership clarity.

## Assumption Reassessment (2026-03-09)

1. Sequence-context schema shape/refinement is duplicated in AST and extension schema modules.
2. Current duplicates are equivalent now, but they are consumed through `EffectASTSchema` and `EventCardFreeOperationGrantSchema`, not through a dedicated top-level schema test surface.
3. Existing behavioral validation for sequence-context linkage already lives in `packages/engine/test/unit/validate-gamedef.test.ts`; the ticket's original test plan under-targeted direct schema ownership/parity.
4. Mismatch: schema ownership is not single-source. Correction: extract one canonical schema helper and import it everywhere.

## Architecture Check

1. Single-source schema ownership is cleaner and reduces contract drift risk.
2. The change is purely agnostic infrastructure and does not introduce game-specific logic into runtime or `GameDef`.
3. No compatibility layer: replace duplicate definitions with canonical imports.
4. Broader ideal architecture would also centralize the sequence-context type contract, not just the Zod schema. That larger contract-surface unification is out of scope for this ticket unless implementation proves it is required.

## What to Change

### 1. Extract canonical schema helper

Move `FreeOperationSequenceContextSchema` to one owned module (for example shared kernel schema contracts) with exact current refinement semantics.

### 2. Replace duplicate local definitions

Update `schemas-ast` and `schemas-extensions` to import the canonical schema helper.

### 3. Add drift guard

Add/extend direct unit tests to enforce single-source ownership and parity across the AST/event schema entry points that actually consume this contract.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/<new-or-existing-shared-schema-module>.ts` (new/modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts` (new)
- `packages/engine/test/unit/validate-gamedef.test.ts` (verify existing coverage; modify only if needed)

## Out of Scope

- Behavioral changes to sequence-context runtime matching.
- Ia Drang/event-data updates.

## Acceptance Criteria

### Tests That Must Pass

1. Both AST and extension schema paths still validate/reject sequence-context payloads identically.
2. There is a single canonical schema definition source for sequence-context shape/refinement.
3. Existing suites: `node --test packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js`

### Invariants

1. Sequence-context schema contract remains unchanged in behavior.
2. Contract ownership is centralized to one source of truth.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — preserve schema behavior parity.
2. `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts` — guard canonical ownership and AST/event schema parity for sequence-context payloads.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — retain linkage diagnostics coverage as the behavioral backstop; update only if implementation changes surfaced gaps.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What changed:
  - Extracted `FreeOperationSequenceContextSchema` into a dedicated kernel module and switched both `schemas-ast.ts` and `schemas-extensions.ts` to import it.
  - Added direct AST schema coverage for valid and invalid `grantFreeOperation.sequenceContext` payloads.
  - Added a kernel contract-guard test that enforces canonical ownership and AST/event-schema parity for sequence-context payloads.
  - Kept existing `validate-gamedef` linkage diagnostics coverage unchanged because it already covered the behavioral invariant this ticket depends on.
- Deviations from original plan:
  - Did not modify `packages/engine/test/unit/schemas-top-level.test.ts`; it was not the right ownership/parity surface for this contract.
  - Did not broaden scope to unify the duplicated type contract across `types-ast.ts` and `types-turn-flow.ts`; that remains a separate architectural follow-up.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js` passed
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm -F @ludoforge/engine test` passed
