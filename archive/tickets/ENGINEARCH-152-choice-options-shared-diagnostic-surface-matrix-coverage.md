# ENGINEARCH-152: Expand Shared Choice-Options Diagnostic Surface Matrix Coverage

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — test coverage hardening for shared kernel diagnostic helper
**Deps**: archive/tickets/ENGINEARCH-147-choice-options-diagnostic-details-remove-redundant-alternatives-field.md

## Problem

The shared choice-options runtime-shape diagnostic helper has focused unit coverage, but the matrix does not explicitly lock both emission surfaces with full payload assertions (`code`, `path`, `severity`, `message`, `suggestion`, `alternatives`). This leaves room for silent drift.

## Assumption Reassessment (2026-02-28)

1. `choice-options-runtime-shape-diagnostic.test.ts` already validates:
   - a null return for encodable query shapes,
   - deterministic output for a non-encodable query,
   - canonical code literals for both supported surfaces.
2. The remaining gap is narrower than originally phrased: current tests do not lock the complete emitted payload (`code`, `path`, `severity`, `message`, `suggestion`, `alternatives`) for both surfaces in one table-driven matrix.
3. Corrected scope: strengthen shared-helper unit coverage with a compact full-payload surface matrix; keep parity test focused as a cross-layer guardrail.

## Architecture Check

1. Strong surface-matrix tests provide cleaner contract ownership and reduce future drift risk after refactors.
2. This is pure kernel test hardening and remains game-agnostic.
3. No backwards-compatibility aliasing/shims; tests lock canonical behavior as-is.

## What to Change

### 1. Add two-surface matrix assertions in shared-helper unit tests

Extend shared-helper tests to validate exact, deterministic payload fields for both compiler and validator code paths in one table-driven assertion matrix.

### 2. Preserve existing parity tests as integration guardrail

Keep `choice-options-runtime-shape-diagnostic-parity.test.ts` unchanged unless minimal assertion alignment is required by helper-test hardening.

## Files to Touch

- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify only if assertion tightening requires)

## Out of Scope

- Runtime/compile behavior changes.
- Diagnostic wording changes.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Shared helper test matrix explicitly covers compiler and validator surfaces with full payload assertions.
2. Cross-layer parity test remains passing and deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Shared helper remains the single payload-construction owner for choice-options runtime-shape diagnostics.
2. Compiler/validator surfaces stay parity-locked for message/suggestion/alternatives behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` — add table-driven assertions for both code surfaces with exact payload fields.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — retain as end-to-end parity guard.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Reassessed and corrected ticket assumptions/scope before implementation to reflect that two-surface code-literal checks already existed.
  - Added a new table-driven shared-helper unit test that locks full emitted payloads across compiler and validator surfaces (`code`, `path`, `severity`, `message`, `suggestion`, `alternatives`).
  - Preserved parity coverage as-is; no parity test changes were required.
- **Deviations From Original Plan**:
  - `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` did not require changes after helper-test hardening.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm run check:ticket-deps` ✅
