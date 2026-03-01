# TOKFILT-001: Enforce token-filter prop declaration in kernel GameDef validator

**Status**: COMPLETED (2026-03-01)
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel validation (`validate-gamedef-behavior.ts`) and tests
**Deps**: None

## Problem

Compiler lowering now rejects token-filter predicates that reference undeclared token props. However, kernel-side `GameDef` behavior validation does not enforce the same invariant. This leaves a parity gap: externally sourced or post-processed `GameDef` payloads can still contain invalid token-filter prop names and bypass compile-time guarantees.

## Assumption Reassessment (2026-02-28)

1. `compile-conditions.ts` emits `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` for undeclared token-filter props — confirmed in `packages/engine/src/cnl/compile-conditions.ts` and integration coverage in `packages/engine/test/integration/compile-pipeline.test.ts`.
2. Kernel behavior validation currently validates token-filter values only for `tokensInZone`, `tokensInAdjacentZones`, `reveal.filter`, and `conceal.filter`; it does not validate token-filter prop names against declared token type props — confirmed in `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
3. Kernel behavior validation currently does not visit `tokensInMapSpaces` at all, so it validates neither token-filter values nor token-filter prop names for that query kind — confirmed in `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
4. Runtime token filtering supports intrinsic token field `id` in addition to `token.props.*` fields — confirmed in `packages/engine/src/kernel/token-filter.ts`; validator scope must include `id` as a valid intrinsic prop.
5. No active ticket in `tickets/*` currently tracks this compiler/runtime parity hardening — confirmed.

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
4. Ensure `tokensInMapSpaces` is behavior-validated and participates in the same token-filter prop/value checks.

### 2. Keep diagnostics explicit and contract-oriented

Add/extend diagnostic code(s) under kernel validator diagnostics (or existing generic validator code path) to make failures actionable (path, unknown prop, alternatives).

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-structure.ts` (modify to expose token-filter prop vocabulary in validation context)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add behavior-validation coverage)
- `packages/engine/test/unit/eval-query.test.ts` (modify only if runtime id/intrinsic parity guard needs strengthening)

## Out of Scope

- Changing token-filter runtime execution semantics
- Compiler-side prop validation changes (already implemented)
- Any visual config concerns

## Acceptance Criteria

### Tests That Must Pass

1. Validator rejects `GameDef` queries/effects containing token-filter props not in declared token type props and not equal to `id`.
2. Validator accepts token-filter prop `id` even when not declared in token type runtime props.
3. Validator accepts declared token-filter props across mixed token type schemas.
4. Validator applies token-filter checks consistently to `tokensInMapSpaces`.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler and kernel validator enforce the same token-filter prop contract.
2. `GameDef`/kernel remain game-agnostic; enforcement is schema-derived only.
3. No aliasing/backwards-compatibility path for unknown token-filter props.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — assert validator errors on unknown token-filter props, allows `id`, and validates `tokensInMapSpaces` token filters.
2. `packages/engine/test/unit/token-filter.test.ts` — keep/extend intrinsic `id` behavior coverage if needed for parity clarity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test && pnpm turbo lint`

## Outcome

1. Added kernel-side token-filter prop-name validation for `tokensInZone`, `tokensInAdjacentZones`, `tokensInMapSpaces`, `reveal.filter`, and `conceal.filter`.
2. Extended `ValidationContext` with token-filter prop vocabulary derived from `tokenTypes[*].props`, while preserving intrinsic `id` handling.
3. Added unit coverage in `validate-gamedef.test.ts` for unknown prop rejection, intrinsic `id` acceptance, mixed token-type prop unions, and `tokensInMapSpaces` parity.
4. Compared to the initial plan, implementation intentionally widened to include the pre-existing `tokensInMapSpaces` behavior-validation gap discovered during assumption reassessment.
