# CONCPAR-007: Reveal/Conceal contract parity guardrail tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — tests (cross-layer parity)
**Deps**: Archived predecessor complete (`archive/tickets/CONCPAR-001.md`)

## Problem

Reveal and conceal are a paired hidden-information contract, but parity is currently verified only indirectly through scattered tests. This increases drift risk across AST type, schema, behavior validation, and runtime reason contracts.

## Assumption Reassessment (2026-02-21)

1. Reveal and conceal intentionally differ only on selector direction (`to` vs `from`) and trace payload direction (`observers` vs `from`), with selective conceal already implemented in `archive/tickets/CONCPAR-003.md`.
2. Existing tests already cover substantial hidden-info behavior and runtime reason taxonomy:
   - runtime reasons are asserted in `packages/engine/test/unit/kernel/runtime-reasons.test.ts`
   - reveal/conceal runtime behavior is asserted in `packages/engine/test/unit/effects-reveal.test.ts`
   - conceal schema/validator negatives exist in `packages/engine/test/unit/schemas-ast.test.ts` and `packages/engine/test/unit/validate-gamedef.test.ts`
3. The remaining gap is a single focused parity guardrail that mirrors reveal/conceal contract checks side-by-side across AST schema, behavior validation, and runtime reason taxonomy, with equivalent negative-path coverage.
4. This parity-guardrail work is still outside CONCPAR-002/003/004 implementation scopes.

## Architecture Check

1. A dedicated parity guardrail test suite is a low-cost way to keep hidden-information architecture coherent over time.
2. Tests stay game-agnostic and enforce only engine-level contracts.
3. No backward-compatibility path: tests encode the canonical contract and fail on drift.

## What to Change

### 1. Add a focused parity test suite

Create unit tests that assert reveal/conceal parity across layers:
- AST acceptance parity for `zone + selector + filter`
- schema acceptance/rejection parity for equivalent shapes, including mirrored malformed selector/filter rejections
- behavior validator parity for selector and filter validation, including reveal-side negative tests matching existing conceal-side checks
- runtime reason taxonomy parity (`REVEAL_RUNTIME_VALIDATION_FAILED` and `CONCEAL_RUNTIME_VALIDATION_FAILED` both present)

### 2. Keep parity scope explicit

Document in test names/comments that parity targets cross-layer contracts; runtime conceal selection semantics are already covered in `archive/tickets/CONCPAR-003.md` and should not be duplicated here.

## Files to Touch

- `packages/engine/test/unit/` (new test file; exact file name up to implementer, e.g. `reveal-conceal-parity.test.ts`)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify only if parity assertions are centralized there)
- `packages/engine/test/unit/validate-gamedef.test.ts` (only if mirrored reveal validator negatives are added there instead of the dedicated parity file)

## Out of Scope

- Re-implementing selective conceal runtime removal — already completed in `archive/tickets/CONCPAR-003.md`
- Compiler lowering implementation — CONCPAR-002
- Trace entry model changes — CONCPAR-004

## Acceptance Criteria

### Tests That Must Pass

1. Parity tests fail if reveal/conceal type/schema/validator reason contracts diverge unintentionally.
2. Existing reveal/conceal behavior tests remain green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hidden-information effect contracts stay symmetrical where intentionally designed.
2. Any future reveal/conceal surface change requires explicit, synchronized updates across layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/reveal-conceal-parity.test.ts` (new) — targeted cross-layer contract guardrails.
2. `packages/engine/test/unit/validate-gamedef.test.ts` (optional modification) — mirrored reveal-side validator negatives if not colocated in parity suite.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|parity"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-02-21
- What changed:
  - Reassessed and corrected assumptions/scope to reflect existing coverage and the true remaining parity gap.
  - Added `packages/engine/test/unit/reveal-conceal-parity.test.ts` as a focused cross-layer parity guardrail suite.
  - Added shared fixture helpers in `packages/engine/test/helpers/gamedef-fixtures.ts` and reused them in parity/validator tests to keep GameDef contract setup centralized and DRY.
- Deviations from original plan:
  - Kept parity additions in a dedicated new test file; no `runtime-reasons` or production engine code changes were required.
  - Included a small test-architecture cleanup (fixture extraction) beyond the original minimum parity scope.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|parity"` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
