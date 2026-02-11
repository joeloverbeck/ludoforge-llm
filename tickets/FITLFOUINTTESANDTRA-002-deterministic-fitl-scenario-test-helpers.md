# FITLFOUINTTESANDTRA-002 - Deterministic FITL Scenario Test Helpers

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`

## Goal
Create concise test-helper utilities for deterministic FITL scenario setup overrides without adding FITL-only engine hooks.

## Implementation Tasks
1. Introduce helper APIs for scenario override composition (seed, eligible factions, board track presets, card window entry).
2. Refactor at least one existing FITL integration test to consume the helper.
3. Ensure helper behavior is deterministic and does not bypass compiler/runtime contracts.

## File list it expects to touch
- `test/integration/fitl-events-test-helpers.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-option-matrix.test.ts` (optional if needed for first helper adoption)

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

