# TOKFILT-001: Enforce token-filter prop declaration in kernel GameDef validator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel validation (`validate-gamedef-behavior.ts`) and tests
**Deps**: None

## Problem

Compiler lowering now rejects token-filter predicates that reference undeclared token props. However, kernel-side `GameDef` behavior validation does not enforce the same invariant. This leaves a parity gap: externally sourced or post-processed `GameDef` payloads can still contain invalid token-filter prop names and bypass compile-time guarantees.

## Assumption Reassessment (2026-02-28)

1. `compile-conditions.ts` now emits `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` for undeclared token-filter props — confirmed in current uncommitted code.
2. Kernel behavior validation currently validates token-filter values but not token-filter prop names against declared token type props — confirmed in `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
3. Runtime token filtering supports intrinsic token field `id` in addition to `token.props.*` fields — confirmed in `packages/engine/src/kernel/token-filter.ts`; validator scope must include `id` as a valid intrinsic prop.
4. No active ticket in `tickets/*` currently tracks this compiler/runtime parity hardening — confirmed.

## Architecture Check

1. This is cleaner than relying only on compiler enforcement, because `GameDef` is a public agnostic contract that may be produced by multiple sources.
2. Validation remains game-agnostic: it derives allowed props from `GameDef.tokenTypes` plus intrinsic token fields; no game-specific branching.
3. No backwards-compatibility aliases/shims: invalid `GameDef` payloads should fail validation deterministically.

## What to Change

### 1. Add token-filter prop-name validation to kernel behavior validator

In `validate-gamedef-behavior.ts`, extend token-filter validation to:

1. Build allowed token-filter prop set from union of declared `tokenTypes[*].props`.
2. Include intrinsic token prop `id`.
3. Emit validator diagnostic for unknown token-filter `prop` names in all token-filter-bearing query/effect surfaces.

### 2. Keep diagnostics explicit and contract-oriented

Add/extend diagnostic code(s) under kernel validator diagnostics (or existing generic validator code path) to make failures actionable (path, unknown prop, alternatives).

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify only if diagnostic wiring requires it)
- `packages/engine/test/unit/validate-gamedef-behavior.test.ts` (modify or add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify only if parity assertion belongs in integration)

## Out of Scope

- Changing token-filter runtime execution semantics
- Compiler-side prop validation changes (already implemented)
- Any visual config concerns

## Acceptance Criteria

### Tests That Must Pass

1. Validator rejects `GameDef` queries/effects containing token-filter props not in declared token type props and not equal to `id`.
2. Validator accepts token-filter prop `id` even when not declared in token type runtime props.
3. Validator accepts declared token-filter props across mixed token type schemas.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler and kernel validator enforce the same token-filter prop contract.
2. `GameDef`/kernel remain game-agnostic; enforcement is schema-derived only.
3. No aliasing/backwards-compatibility path for unknown token-filter props.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef-behavior.test.ts` — assert validator errors on unknown token-filter prop and allows `id`.
2. `packages/engine/test/unit/token-filter.test.ts` — keep/extend intrinsic `id` behavior coverage if needed for parity clarity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef-behavior.test.js`
3. `pnpm turbo test && pnpm turbo lint`
