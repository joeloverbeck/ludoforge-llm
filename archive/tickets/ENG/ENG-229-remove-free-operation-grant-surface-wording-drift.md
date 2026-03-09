# ENG-229: Remove Free-Operation Grant Surface Wording Drift

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unify the malformed free-operation `sequenceContext` invariant message across schema/compiler/runtime surfaces while preserving the current contract-boundary architecture
**Deps**: archive/tickets/ENG-226-express-free-operation-grant-coupling-in-structural-schemas.md, archive/tickets/ENG/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md, archive/tickets/ENG/ENG-228-lower-free-operation-sequence-context-in-cnl-effects.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/free-operation-sequence-context-schema.ts, packages/engine/src/kernel/free-operation-grant-zod.ts

## Problem

At the start of this ticket, one wording drift remained for the same generic invariant:

1. The shared free-operation grant contract reported `sequenceContext must declare at least one capture/require key.`
2. `FreeOperationSequenceContextSchema` still reported `sequenceContext must include captureMoveZoneCandidatesAs or requireMoveZoneCandidatesFrom.`
3. Compiler lowering preserved the schema message, while validator/runtime surfaces already used the shared contract wording.

This was not a gameplay bug, but it left one invariant with two messages depending on which boundary rejected it.

## Assumption Reassessment (2026-03-09)

1. `collectTurnFlowFreeOperationGrantContractViolations(...)` is still the canonical semantic detector for free-operation grant contract violations.
2. `renderTurnFlowFreeOperationGrantContractViolation(...)` is already the shared surface adapter used by compiler, validator, and runtime. That is cleaner than scattering formatting logic back into each boundary.
3. `packages/engine/src/kernel/free-operation-grant-zod.ts` remains an active shared helper and is part of the relevant architecture.
4. `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts` was the right place to strengthen parity coverage instead of creating another redundant guard.
5. The real discrepancy was narrower than the original ticket assumed: keep the shared renderer, but eliminate duplicated wording sources for malformed `sequenceContext`.

## Architecture Check

1. The current shared renderer is beneficial relative to the original ticket assumption. It centralizes generic free-operation grant surface text and avoids boundary-specific drift.
2. The better long-term architecture is to keep one canonical message source for the malformed `sequenceContext` invariant and have schema/compiler/runtime surfaces consume that source.
3. No backward-compatibility aliases were added. The fix standardizes on one canonical message and updates tests to match it.

## What Changed

### 1. Preserved the shared renderer

`renderTurnFlowFreeOperationGrantContractViolation(...)` stayed in the contracts layer. Reassessment confirmed the current ownership split is already the cleaner long-term architecture.

### 2. Canonicalized malformed `sequenceContext` wording

Introduced a single shared message constant in the free-operation grant contract and pointed `FreeOperationSequenceContextSchema` at that same source so schema parsing, compiler lowering, and runtime failures converge on one wording.

### 3. Strengthened parity coverage

Extended the existing contract/schema parity test to assert the canonical schema and shared contract detector emit the same malformed-`sequenceContext` wording.

## Files Touched

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`
- `packages/engine/src/kernel/free-operation-sequence-context-schema.ts`
- `packages/engine/test/unit/schemas-ast.test.ts`
- `packages/engine/test/unit/compile-effects.test.ts`
- `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts`
- `tickets/ENG-229-remove-free-operation-grant-surface-wording-drift.md`

## Out of Scope

- Moving rendering ownership out of contracts.
- New grant semantics, new free-operation contract fields, or schema shape changes.
- Game-specific behavior, content, or presentation work.
- Reworking validator/runtime flow structure when message canonicalization alone is sufficient.

## Acceptance Criteria

### Tests That Must Pass

1. The malformed `sequenceContext` invariant emits one canonical user-facing message across schema/compiler/validator/runtime surfaces that intentionally expose it.
2. The shared contract renderer remains the presentation path for grant-contract surfaces that already rely on it.
3. Existing suites: `pnpm -F @ludoforge/engine test`
4. Lint: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Semantic contract detection remains centralized and game-agnostic.
2. Shared generic wording is not duplicated across schema/compiler/runtime boundaries when one canonical source can own it.
3. No aliases or backward-compatibility message fallbacks were introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts` — asserts the canonical schema and shared grant contract expose the same malformed-`sequenceContext` wording.
2. `packages/engine/test/unit/schemas-ast.test.ts` — pins the schema-facing wording for malformed `grantFreeOperation.sequenceContext`.
3. `packages/engine/test/unit/compile-effects.test.ts` — pins compiler-lowering diagnostics for malformed `grantFreeOperation.sequenceContext`.
4. `packages/engine/test/unit/effects-turn-flow.test.ts` — existing runtime wording coverage remained valid against the canonical message and passed unchanged.
5. `packages/engine/test/unit/validate-gamedef.test.ts` — existing validator coverage remained valid and passed unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-09
- What actually changed: introduced one shared message constant for malformed free-operation `sequenceContext`, pointed `FreeOperationSequenceContextSchema` at that canonical source, and updated schema/compiler/parity tests to assert the unified wording.
- Deviations from original plan: did not move `renderTurnFlowFreeOperationGrantContractViolation(...)` out of contracts and did not change validator/runtime implementation structure, because the current shared renderer is the cleaner long-term architecture and only the schema-owned wording source was drifting.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed.
