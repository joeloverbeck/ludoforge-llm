# FITLFOUINTTESANDTRA-004 - Operations, Limited Ops, and Eligibility Sequencing

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`

## Goal
Add integration tests validating operation legality checks, limited-op behavior, and eligibility/ineligibility transitions in deterministic FITL campaign slices.

## Implementation Tasks
1. Extend operation integration tests for legal/illegal move boundaries.
2. Add limited-op behavior assertions across representative factions.
3. Assert eligibility state transitions across successive actor windows in one card cycle.

## File list it expects to touch
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-eligibility-pass-chain.test.ts`

## Out of scope
- Event 82/27 execution assertions.
- Coup resource/support/redeploy/reset/victory assertions.
- Golden trace update workflow.
- Architecture hardcoding audits and non-FITL regression paths.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-coin-operations.test.js`
- `node --test dist/test/integration/fitl-insurgent-operations.test.js`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Legality checks remain declarative and deterministic.
- Limited-op constraints do not require FITL-specific engine branching.
- Eligibility transitions are deterministic and consistent with turn-flow state machine contracts.

