# FITLFOUINTTESANDTRA-004 - Operations, Limited Ops, and Eligibility Sequencing

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`

## Goal
Add integration tests validating operation legality checks, limited-op behavior, and eligibility/ineligibility transitions in deterministic FITL campaign slices.

## Assumption Reassessment
- Limited-op behavior is enforced through turn-flow option-matrix classification (`limitedOperation` classified as `operation`), not per-faction operation-profile fixtures.
- Existing legality and cost guard assertions are split across operation and special-activity integration suites rather than isolated in a single operations-only file.
- Eligibility transitions are validated through both override-window and pass-chain integration tests.

## Implementation Tasks
1. Extend operation integration tests for legal/illegal move boundaries.
2. Add limited-op behavior assertions in turn-flow option-matrix integration coverage.
3. Assert eligibility state transitions across successive actor windows in one card cycle.

## File list it expects to touch
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-option-matrix.test.ts`
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
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`

## Invariants that must remain true
- Legality checks remain declarative and deterministic.
- Limited-op constraints remain option-matrix driven (`limitedOperation` classified as `operation`) and do not require FITL-specific engine branching.
- Eligibility transitions are deterministic and consistent with turn-flow state machine contracts.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Reassessed and corrected ticket assumptions so limited-op coverage references `fitl-option-matrix` integration tests.
  - Updated expected touched-file list and acceptance commands to include `fitl-option-matrix` verification.
  - Re-ran the ticket-targeted FITL integration suite plus full `npm test` regression suite.
- **Deviation from original plan**:
  - No engine/runtime or test-source code edits were required because existing integration tests already satisfied legality, limited-op sequencing, and eligibility-transition coverage.
- **Verification results**:
  - `npm run build`: pass
  - Updated targeted integration commands: pass
  - `npm test`: pass
