# TOKFILAST-033: Deduplicate Internal Condition-Surface Literal Ownership for Shared Suffixes

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — contract internal maintenance hardening
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

Family-scoped suffix ownership intentionally uses the same emitted literal (`if.when`) in both `valueExpr` and `effect` families. The duplicated inline literal is valid but still allows accidental divergence if one side is edited independently.

## Assumption Reassessment (2026-03-06)

1. `CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen` and `.effect.ifWhen` currently repeat `'if.when'` inline.
2. Family-scoped API is intentional and should remain explicit; this ticket concerns internal literal ownership only.
3. Existing unit coverage already pins both family outputs to `if.when` (`packages/engine/test/unit/validate-gamedef.test.ts`), so this ticket is maintenance hardening rather than a runtime-bug fix.
4. No active ticket currently centralizes shared literal declaration for this specific cross-family suffix.

## Architecture Check

1. Centralizing shared literal constants internally is cleaner than repeated inline literals because it makes ownership explicit and single-source.
2. Benefit versus current architecture: modest but positive; behavior is already guarded by tests, but source-level consistency and future extensibility improve.
3. This is contract hygiene in agnostic infrastructure; no game-specific behavior is introduced.
4. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Introduce internal shared literal constant(s)

Define a private internal constant (for example `const IF_WHEN_SUFFIX = 'if.when' as const`) and reuse it in family maps.

### 2. Keep public API unchanged and family-scoped

Retain family-scoped external shape and helper signatures; do not reintroduce generic/legacy surfaces.

### 3. Strengthen regression assertion minimally

Keep existing literal assertions and add/retain an explicit equality assertion between family-scoped `ifWhen` entries.

## Files to Touch

- `packages/engine/src/contracts/condition-surface-contract.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Contract surface renaming.
- Validator callsite changes beyond what internal constant reuse requires.

## Acceptance Criteria

### Tests That Must Pass

1. Family-scoped `ifWhen` suffix values remain exactly `if.when`.
2. Family-scoped `ifWhen` suffix entries remain equal to each other.
3. Contract continues to expose family-scoped APIs only.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Family-scoped condition-surface ownership remains explicit in public API.
2. `GameDef` and simulator/runtime remain game-agnostic.
3. Shared suffix literals are declared once internally and reused across families.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — retain canonical `if.when` assertions and add a direct family-to-family equality assertion for `ifWhen`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What actually changed:
  - Introduced one private internal literal owner (`IF_WHEN_SUFFIX`) in `condition-surface-contract.ts` and reused it for `valueExpr.ifWhen` and `effect.ifWhen`.
  - Strengthened condition-surface taxonomy regression coverage in `validate-gamedef.test.ts` with an explicit family-to-family equality assertion for `ifWhen`.
  - Updated this ticket assumptions/scope before implementation to reflect current baseline coverage and architectural intent.
- Deviations from original plan:
  - None; implementation stayed within the planned contract + test surface.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
