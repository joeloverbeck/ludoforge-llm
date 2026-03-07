# TOKFILAST-042: Separate Structural Normalization from Boundary Message Policy in Token-Filter Mapping

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime/validator token-filter boundary mapping policy
**Deps**: archive/tickets/TOKFILAST-038-token-filter-dual-traversal-modes-and-boundary-mapper-unification.md, archive/tickets/TOKFILAST-041-token-filter-traversal-reason-exhaustiveness-guard.md

## Problem

Current shared traversal normalization helper still mixes structural mapping with boundary-facing text (`message`, `suggestion`). That blurs layer ownership and makes it unclear which boundary owns message policy.

## Assumption Reassessment (2026-03-07)

1. `normalizeTokenFilterTraversalError` currently returns structural metadata plus boundary-facing text fields (`message`, `suggestion`) in `packages/engine/src/kernel/token-filter-expr-utils.ts`.
2. Runtime boundary currently throws `TYPE_MISMATCH` with `normalizedError.message` instead of preserving the traversal error message source (`error.message`) in `packages/engine/src/kernel/token-filter-runtime-boundary.ts`.
3. Validator boundary currently also consumes normalized boundary-facing text from shared normalization in `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
4. Existing tests assert deterministic outputs, but do not explicitly enforce that shared normalization is structural-only.

## Architecture Check

1. Structural normalization should be boundary-agnostic and return only contextual mapping metadata (`reason`, `op`, path suffix, field suffix).
2. Boundary layers should own presentation policy:
- runtime boundary preserves traversal error message source at handoff.
- validator boundary composes deterministic diagnostic message/suggestion locally.
3. This is cleaner and more extensible than centralizing all text production in a low-level helper.
4. Remains game-agnostic kernel architecture work; no game-specific logic.
5. No backwards-compatibility aliases/shims.

## What to Change

### 1. Split normalization responsibilities

Refactor token-filter normalization so shared core returns structural metadata only (`reason`, `op`, `entryPathSuffix`, `errorFieldSuffix`).

### 2. Enforce runtime message-source policy

Update runtime mapper to preserve traversal message source (`error.message`) while using shared normalization only for deterministic context shaping.

### 3. Keep validator text policy at validator boundary

Update validator traversal diagnostic mapping to derive deterministic message/suggestion at the validator boundary from normalized structural metadata.

### 4. Add/adjust policy tests

Add or adjust tests that lock:
- structural normalization output parity without boundary-facing text
- runtime message-source preservation (including non-canonical/custom traversal messages)
- validator deterministic message/suggestion/path outputs

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter-runtime-boundary.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Introducing new traversal operators or traversal error reasons.
- CNL predicate shape/alias tickets (`TOKFILAST-039`, `TOKFILAST-040`).
- Any `GameSpecDoc`/`visual-config.yaml` game-content change.

## Acceptance Criteria

### Tests That Must Pass

1. Shared normalization provides deterministic structural mapping only.
2. Runtime boundary preserves traversal message source while still mapping context deterministically.
3. Validator boundary keeps deterministic diagnostic message/suggestion/path outputs.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. `GameDef` and simulation/runtime remain game-agnostic.
2. Boundary contracts remain deterministic and free of alias/back-compat behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — assert structural-only normalization outputs and runtime message-source preservation.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert validator message/suggestion/path determinism after layering split.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - `normalizeTokenFilterTraversalError` now returns structural metadata only (`reason`, `op`, `entryPathSuffix`, `errorFieldSuffix`).
  - Runtime boundary now preserves traversal message source (`error.message`) while enriching TYPE_MISMATCH context with structural suffix metadata.
  - Validator now composes message/suggestion at the boundary from structural normalization rather than receiving preformatted text from the shared helper.
  - Added dedicated validator boundary policy module `packages/engine/src/kernel/token-filter-validator-boundary.ts` to keep boundary text policy explicit and reusable.
  - Tests were updated to lock structural-only normalization output and runtime message-source preservation, including a custom-message edge case.
  - Added focused boundary-policy unit coverage in `packages/engine/test/unit/kernel/token-filter-validator-boundary.test.ts`.
- Deviations from planned scope:
  - Added a small dedicated validator-boundary policy module and a focused unit test to harden long-term architecture against policy drift.
- Verification:
  - Passed `pnpm turbo build`
  - Passed `pnpm -F @ludoforge/engine test:unit`
  - Passed `pnpm -F @ludoforge/engine lint`
