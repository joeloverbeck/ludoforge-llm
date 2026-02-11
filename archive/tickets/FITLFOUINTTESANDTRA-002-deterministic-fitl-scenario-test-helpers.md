# FITLFOUINTTESANDTRA-002 - Deterministic FITL Scenario Test Helpers

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`

## Goal
Create concise test-helper utilities for deterministic FITL scenario override composition without adding FITL-only engine hooks.

## Assumption Reassessment (updated)
- `test/integration/fitl-events-test-helpers.ts` currently provides compiler-fixture helpers only; it does not provide deterministic scenario override composition helpers.
- FITL integration tests currently duplicate FITL override directive strings (for example `eligibilityOverride:*` and `freeOpGranted:*`) inline across files.
- Current coverage for this ticket does not require new board-track preset builders or card-window entry APIs because those setup paths are not exercised by the targeted tests in this ticket.
- Spec 21 requires concise deterministic test utilities and no FITL-only runtime hooks; this ticket should focus on test-only helper composition and adoption in existing integration tests.

## Implementation Tasks
1. Introduce test-only helper APIs for deterministic FITL override composition used by integration tests (eligibility override directives and free-op directives).
2. Refactor at least one existing FITL integration test to consume the helper and remove inline duplicate directive construction.
3. Keep helper behavior purely declarative/test-only so compiler/runtime contracts and production semantics are unchanged.

## File list it expects to touch
- `test/integration/fitl-events-test-helpers.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts` (optional, if needed to remove duplicate directive literals)
- `test/integration/fitl-option-matrix.test.ts` (optional, expected unchanged)

## Out of scope
- Adding runtime/compiler/kernel production code for helper-specific behavior.
- New FITL event/op/coup rules.
- Golden trace fixture generation policy.
- Architecture static audits.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Helpers are test-only and do not alter production runtime semantics.
- Given identical input seed and move sequence, helper-driven tests are deterministic.
- Scenario setup remains declarative and reproducible from explicit fixture inputs.

## Outcome
- Completion date: 2026-02-11
- What changed:
  - Corrected ticket assumptions/scope to match the current repository: this ticket now targets deterministic FITL override directive composition helpers (not board-track/card-window builders).
  - Added test-only helper APIs in `test/integration/fitl-events-test-helpers.ts` for deterministic directive construction:
    - `FITL_NO_OVERRIDE`
    - `createEligibilityOverrideDirective(...)`
    - `createFreeOpGrantedDirective(...)`
  - Refactored existing FITL integration tests to consume helpers and remove duplicated directive literals:
    - `test/integration/fitl-eligibility-window.test.ts`
    - `test/integration/fitl-card-flow-determinism.test.ts`
  - Added focused coverage for helper determinism and numeric faction formatting:
    - `test/integration/fitl-events-test-helpers.test.ts`
- Deviations from original plan:
  - Did not add board-track preset or card-window entry helper APIs because those paths are not exercised by the scoped target tests and were out of alignment with current code assumptions.
  - `test/integration/fitl-option-matrix.test.ts` remained unchanged because it does not consume FITL override directives.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-eligibility-window.test.js` passed.
  - `node --test dist/test/integration/fitl-option-matrix.test.js` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/integration/fitl-events-test-helpers.test.js` passed.
  - `npm test` passed.
