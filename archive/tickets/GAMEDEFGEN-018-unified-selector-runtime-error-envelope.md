# GAMEDEFGEN-018: Unified Selector Runtime Error Envelope Across All Selector Failures

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) Reassessed Assumptions

1. The original scope ("all selector-dependent execution paths") is broader than current architecture intent.
2. Current architecture already canonicalizes runtime selector envelopes for action applicability boundaries (`legalMoves`, `legalChoices`, `applyMove`) via `selectorInvalidSpecError` and shared preflight.
3. Non-applicability selector errors (for example deep effect/query selector failures) intentionally remain under their own runtime/eval error channels and are not currently part of this ticket's boundary contract.
4. Existing tests already cover cross-surface parity for invalid actor/executor selectors and ordered multi-violation payloads.

## 2) Updated Scope

1. Keep this ticket strictly scoped to **action selector contract failures surfaced at runtime applicability boundaries**:
   - `legalMoves`
   - `legalChoices`
   - `applyMove`
2. Confirm shared envelope remains:
   - `code: RUNTIME_CONTRACT_INVALID`
   - `context.reason: invalidSelectorSpec`
   - `context.surface`, `context.selector`, `context.actionId`
   - optional deterministic `context.selectorContractViolations` list
3. Do not broaden this ticket to unrelated selector/effect/eval error channels.

## 3) Remaining Work

1. Add/strengthen one parity test for executor-primary selector-contract failure ordering to close current edge-case coverage gap.
2. Run relevant selector/runtime-contract suites plus lint and ensure they pass.

## 4) Invariants

1. Applicability-boundary selector invalid-spec failures share one stable metadata schema.
2. Equivalent boundary failures across the 3 runtime surfaces expose equivalent reason/context fields.
3. Multi-violation selector-contract failures preserve deterministic ordered violation lists.
4. No game-specific error taxonomy or branching is introduced.

## 5) Tests

1. Unit: selector envelope parity for boundary failures remains green.
2. Unit: executor-primary violation scenarios preserve deterministic payload ordering and selector attribution.
3. Regression: existing legality/runtime-contract suites pass.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Reassessed and corrected ticket assumptions/scope to match current architecture boundaries.
  - Added executor-primary selector-contract parity coverage in `test/unit/kernel/legality-surface-parity.test.ts`.
  - Verified with `npm run lint`, `npm run build`, and `npm run test:all`.
- Deviations from original plan:
  - Original ticket implied broad selector-failure unification across all selector-dependent paths; scope was narrowed to applicability-boundary selector contract errors only (`legalMoves` / `legalChoices` / `applyMove`) because that is the intentionally shared contract.
- Verification results:
  - Lint passed.
  - Build passed.
  - Full test suite passed (212/212).
