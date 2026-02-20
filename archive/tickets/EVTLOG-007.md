# EVTLOG-007: Harden trusted macro-origin architecture (no `__compilerMeta` migration)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — validator/lowering guardrails + test hardening
**Deps**: EVTLOG-006

## Problem

This ticket originally proposed moving control-flow `macroOrigin` provenance into a string-keyed reserved envelope such as `__compilerMeta`. After reassessing the current code, that migration would add architectural churn without improving trust boundaries.

The current system already uses a compiler-private trust channel (`Symbol` marker in `macro-origin-trust.ts`) while rejecting authored provenance. What is still missing is a strict guard against authored reserved metadata keys (for example `__compilerMeta`) so future work cannot accidentally introduce authorable compiler internals.

## Assumption Reassessment (2026-02-20)

1. `expand-effect-macros.ts` already writes `macroOrigin` onto expanded `forEach`/`reduce` nodes and marks carriers with compiler-private trust metadata (`markTrustedMacroOriginByExpansion`).
2. `compile-effects.ts` already enforces trust (`isTrustedMacroOriginCarrier`) and rejects authored `macroOrigin` payloads.
3. Runtime trace provenance already flows from lowered AST into `effects-control.ts`/`control-flow-trace.ts`; runner-facing trace contract is already covered.
4. Existing tests already cover key invariants for trusted propagation, authored rejection, and trace emission:
   - `packages/engine/test/unit/expand-effect-macros.test.ts`
   - `packages/engine/test/unit/compile-effects.test.ts`
   - `packages/engine/test/unit/execution-trace.test.ts`
   - `packages/engine/test/integration/effect-macro-compile.test.ts`
5. **Discrepancy in prior ticket scope**: a string-keyed `__compilerMeta` migration is not currently a net architectural gain; the real remaining gap is explicit rejection of authored reserved metadata keys.

## Architecture Decision

1. Keep the current trusted compiler provenance channel (symbol-trusted carriers + typed `macroOrigin` consumed by runtime trace).
2. Do **not** add a new string-keyed metadata envelope on effect DSL/control-flow nodes in this ticket.
3. Strengthen architecture by forbidding authored reserved compiler metadata keys so compiler internals cannot leak into GameSpecDoc authoring.

## What to Change

### 1. Add reserved-key guardrails for authored effect metadata

- Reject authored `forEach.__compilerMeta` and `reduce.__compilerMeta` during validation.
- Reject the same keys during lowering as a compiler defense-in-depth check.

### 2. Keep current provenance pipeline unchanged

- Keep trusted `macroOrigin` propagation/consumption as-is.
- Keep runtime trace schema contract unchanged.

## Files to Touch

- `packages/engine/src/cnl/validate-actions.ts` (modify — reject authored reserved metadata keys)
- `packages/engine/src/cnl/compile-effects.ts` (modify — defense-in-depth rejection of authored reserved metadata keys)
- `packages/engine/test/unit/validate-spec.test.ts` (modify — reserved metadata validator diagnostics)
- `packages/engine/test/unit/compile-effects.test.ts` (modify — reserved metadata lowering diagnostics)

## Out of Scope

- Replacing symbol-trust provenance with string-key metadata envelope.
- Adding provenance for non-control-flow effect kinds.
- Runner UI feature changes.

## Acceptance Criteria

### Tests That Must Pass

1. Validator rejects authored `forEach.__compilerMeta` / `reduce.__compilerMeta`.
2. Lowering rejects authored reserved metadata keys even if validator is bypassed.
3. Existing macro-origin trace behavior remains unchanged.
4. Existing suites: `pnpm turbo test`

### Invariants

1. Compiler-private provenance remains compiler-owned and non-authorable from GameSpecDoc YAML.
2. No new public/authorable metadata envelope is introduced for control-flow effects in this ticket.
3. Trace contract remains explicit and stable for runner consumption.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — add assertions for reserved metadata rejection diagnostics.
2. `packages/engine/test/unit/compile-effects.test.ts` — add lowering-time rejection of authored reserved metadata keys.
3. `packages/engine/test/unit/expand-effect-macros.test.ts` — existing coverage remains; no functional change required.
4. `packages/engine/test/unit/execution-trace.test.ts` — existing coverage remains; no functional change required.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/unit/validate-spec.test.ts test/unit/compile-effects.test.ts test/unit/expand-effect-macros.test.ts test/unit/execution-trace.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

## Outcome

- **Completed on**: 2026-02-20
- **What changed**:
  - Reassessed and corrected ticket scope before implementation.
  - Kept the existing trusted macro-origin architecture (symbol-trusted compiler provenance) and did not migrate to a string-keyed metadata envelope.
  - Added defense-in-depth rejection for authored `__compilerMeta` on control-flow effects in validation and lowering.
  - Added/updated unit tests to cover reserved metadata rejection.
- **Deviations from original plan**:
  - Original proposal to introduce `__compilerMeta` as the primary provenance channel was intentionally dropped after reassessment because it would add churn without improving trust boundaries.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
