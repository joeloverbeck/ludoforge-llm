# ENGINEARCH-102: Derive Illegal-Move Context Field Types from Canonical Kernel Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime error context type cleanup + shared type reuse
**Deps**: tickets/ENGINEARCH-101-runtime-error-contract-layer-decoupling.md

## Problem

Several `IllegalMoveContextByReason` fields use inline literal unions (for example action class values and compound timing keys). This duplicates canonical contract definitions and increases drift risk when shared kernel contracts evolve.

## Assumption Reassessment (2026-02-27)

1. `runtime-error.ts` currently hardcodes several unions already represented elsewhere in kernel contracts.
2. Existing tests catch behavior-level regressions, but type-drift between duplicated unions can still accumulate silently.
3. Mismatch: architecture goal is single-source contract definitions. Corrected scope is replacing inline unions with derived/shared types.

## Architecture Check

1. Reusing canonical types is cleaner and more robust than duplicating literals in runtime error contracts.
2. This remains fully game-agnostic and keeps GameDef/runtime contracts generic.
3. No backwards-compatibility aliasing/shims; remove duplicated unions directly.

## What to Change

### 1. Replace inline literal unions in illegal-move contexts

Reference canonical types for:
- action class fields
- compound timing field/enum values
- other duplicated kernel contract literals in `IllegalMoveContextByReason`

### 2. Centralize shared contract aliases where needed

If canonical source types are not directly reusable, add neutral aliases in a shared contract module and consume those aliases.

### 3. Strengthen contract tests

Add/adjust tests to ensure typed context fields remain aligned with canonical contract values.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-contract.ts` (modify only if shared aliases are needed)
- `packages/engine/src/kernel/` (modify/add shared contract alias module if needed)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)

## Out of Scope

- Illegal-move reason taxonomy changes.
- Runtime behavior changes unrelated to typing.

## Acceptance Criteria

### Tests That Must Pass

1. `IllegalMoveContextByReason` no longer hardcodes duplicated literal unions where canonical types exist.
2. Runtime error contract tests remain green and validate stable typed context shape.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime error contracts derive from single-source kernel contracts where applicable.
2. Kernel remains game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — verify typed context stability after derived-type refactor.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
