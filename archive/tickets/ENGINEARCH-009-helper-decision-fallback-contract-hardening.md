# ENGINEARCH-009: Helper Decision Fallback Contract Hardening

**Status**: ✅ COMPLETED
**Priority**: P2
**Depends on**: ENGINEARCH-006 (`archive/tickets/ENGINEARCH-006-canonical-option-policy-consolidation.md`)

---

## Summary

Align test helper decision resolution with kernel chooser semantics: unresolved decisions must remain `undefined` (never helper-fabricated `null`/`[]` sentinels), and helper orchestration must fail fast with explicit diagnostics when a decision sequence cannot be completed.

---

## Reassessed Current State (Code + Tests)

- The following helpers currently fabricate sentinel fallbacks when deterministic canonical selection is unresolved:
  - `packages/engine/test/helpers/decision-param-helpers.ts`
  - `packages/engine/test/helpers/move-decision-helpers.ts`
  - `packages/engine/test/helpers/runtime-smoke-harness.ts`
  - `packages/engine/test/helpers/legality-surface-parity-helpers.ts`
- Additional discrepancy: `normalizeDecisionParamsForMove` in `packages/engine/test/helpers/decision-param-helpers.ts` currently catches resolver exceptions and silently returns the input move, which can mask decision-completion failures and reduce diagnostic quality.
- Existing targeted tests currently cover only part of this surface:
  - Present: `packages/engine/test/unit/decision-param-helpers.test.ts`
  - Present: `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
  - Present: `packages/engine/test/integration/runtime-smoke-harness.test.ts`
  - Missing direct coverage for `packages/engine/test/helpers/move-decision-helpers.ts`

---

## Architectural Decision

Adopt a single helper contract consistent with kernel semantics:

- `undefined` means unresolved decision.
- Helpers may pick deterministic canonical values, but must not synthesize non-canonical placeholders.
- Incomplete decision sequences are surfaced immediately with actionable diagnostics (decision id/name, action id, and context) instead of being hidden behind fallback mutation.

This is more robust/extensible than the current architecture because it preserves one meaning for unresolved across kernel and helpers, removes implicit behavior, and makes failures local and debuggable.

---

## What Needs to Change

- Replace helper chooser fallbacks (`null`/`[]` on unresolved) with canonical chooser behavior (`pickDeterministicChoiceValue` result as-is).
- Harden helper orchestration to fail fast with explicit diagnostics when resolution is incomplete.
- Remove silent exception masking in decision-param helper normalization path; keep helper failures explicit.
- Touch helper modules:
  - `packages/engine/test/helpers/decision-param-helpers.ts`
  - `packages/engine/test/helpers/move-decision-helpers.ts`
  - `packages/engine/test/helpers/runtime-smoke-harness.ts`
  - `packages/engine/test/helpers/legality-surface-parity-helpers.ts`

---

## Invariants That Should Pass

- Helpers never fabricate move params that are not selectable under canonical policy.
- `undefined` remains the only unresolved signal across kernel + helpers.
- Unresolvable pending decisions are surfaced as explicit incomplete/diagnostic outcomes.
- Helper behavior remains deterministic for fixed seed/input.

---

## Tests That Should Pass

- Add/expand helper-driven tests in:
  - `packages/engine/test/unit/decision-param-helpers.test.ts`
  - `packages/engine/test/unit/move-decision-helpers.test.ts` (new)
  - `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
  - `packages/engine/test/integration/runtime-smoke-harness.test.ts`
- Verify no regressions in existing integration suites that depend on helper orchestration.
- Quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`

---

## Outcome

- Completion date: 2026-02-18
- Implemented changes:
  - Removed helper-level synthetic unresolved fallbacks (`null`/`[]`) and aligned helper chooser defaults to canonical `undefined` unresolved semantics.
  - Hardened helper diagnostics for incomplete decision sequences in decision-param, move-decision, legality parity, and runtime smoke helper flows.
  - Added direct unit coverage for move-decision helpers and expanded existing helper-oriented tests for unresolved canonical-decision scenarios.
  - Updated affected FITL integration assertions to reflect stricter surfaced runtime contracts (`choiceRuntimeValidationFailed` / option-domain validation) after removing helper sentinel masking.
- Deviations from original plan:
  - Scope expanded to include expectation updates in dependent FITL integration suites because stricter helper semantics exposed more specific runtime errors than previous generic illegal-move assertions.
  - Added a new test file (`packages/engine/test/unit/move-decision-helpers.test.ts`) that was missing from the original test inventory.
- Verification:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
