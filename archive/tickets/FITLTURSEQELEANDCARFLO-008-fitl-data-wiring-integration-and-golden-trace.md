# FITLTURSEQELEANDCARFLO-008 - FITL Data Wiring, Integration, and Golden Trace

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`, `FITLTURSEQELEANDCARFLO-002`, `FITLTURSEQELEANDCARFLO-003`, `FITLTURSEQELEANDCARFLO-004`, `FITLTURSEQELEANDCARFLO-005`, `FITLTURSEQELEANDCARFLO-006`, `FITLTURSEQELEANDCARFLO-007`

## Goal
Wire FITL sequencing metadata through `GameSpecDoc` fixtures and close Spec 17 with integration and golden-trace coverage for pass chains, overrides, monsoon, and coup handoff.

## Reassessed assumptions (2026-02-11)
- The spec path in this ticket is correct (`specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`), but this ticket should not assume a misspelled filename variant.
- Dependencies `FITLTURSEQELEANDCARFLO-001` through `-007` are already completed and archived under `archive/tickets/`.
- Most Spec 17 integration coverage already exists:
  - `test/integration/fitl-card-lifecycle.test.ts`
  - `test/integration/fitl-eligibility-window.test.ts`
  - `test/integration/fitl-eligibility-pass-chain.test.ts`
  - `test/integration/fitl-option-matrix.test.ts`
  - `test/integration/fitl-monsoon-pivotal-windows.test.ts`
  - `test/integration/fitl-card-flow-determinism.test.ts`
- `test/fixtures/trace/fitl-turn-flow.golden.json` does not currently exist and must be created if we require FITL-specific golden-trace assertions.
- Existing `test/integration/sim/simulator-golden.test.ts` and `test/fixtures/trace/simulator-golden-trace.json` are simulator-level golden checks, not FITL turn-flow golden coverage.
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` currently lacks explicit `turnFlow` metadata and therefore does not yet represent full Spec 17 sequencing metadata wiring in `GameSpecDoc`.

## Scope
- Update FITL fixture docs to include explicit Spec 17 turn-flow metadata wiring in `GameSpecDoc`:
  - faction/symbol order (`turnFlow.eligibility.factions`),
  - pass reward table,
  - option matrix,
  - lifecycle slots,
  - override durations,
  - monsoon/pivotal metadata.
- Close any remaining integration coverage gaps (without duplicating already-covered behavior), including complete first/second option-matrix permutations.
- Add FITL-specific golden trace coverage for at least one deterministic sequence that includes pass chain, eligibility override, monsoon window, and coup handoff observability.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`
- `test/fixtures/trace/fitl-turn-flow.golden.json` (new)
- `test/fixtures/trace/fitl-foundation-initial-state.golden.json` (update if fixture state shape/hash changes)
- `test/integration/fitl-option-matrix.test.ts` (if permutation gap remains)
- `test/integration/sim/simulator-golden.test.ts` (or `test/integration/sim/fitl-turn-flow-golden.test.ts`)
- `tickets/FITLTURSEQELEANDCARFLO-008-fitl-data-wiring-integration-and-golden-trace.md`

## Out of scope
- Expanding to full FITL card pack implementation (Spec 20).
- Implementing Spec 18 operation details beyond sequencing legality required by Spec 17.
- Implementing Spec 19 scoring/victory internals.
- Adding runtime dependency on `data/fitl/...` fixture files.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/sim/simulator-golden.test.js`
- `node --test dist/test/unit/initial-state.test.js`
- `npm test`

## Invariants that must remain true
- FITL sequence executes entirely via `GameSpecDoc` -> `GameDef` -> simulation.
- Golden trace includes required Spec 17 observability fields.
- No required runtime filesystem lookup under `data/fitl/...`.
- Non-FITL fixtures and integration pipelines continue to pass unchanged.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Updated `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` to encode Spec 17 turn-flow metadata directly in `GameSpecDoc` fixture data (eligibility order, pass rewards, option matrix, lifecycle slots, override windows, monsoon, pivotal).
  - Updated `test/fixtures/trace/fitl-foundation-initial-state.golden.json` to reflect fixture wiring changes.
  - Added missing first/second option-matrix permutation coverage in `test/integration/fitl-option-matrix.test.ts` for first-action `operationPlusSpecialActivity`.
  - Added FITL-specific golden trace coverage with `test/integration/fitl-turn-flow-golden.test.ts` and `test/fixtures/trace/fitl-turn-flow.golden.json`, asserting deterministic pass-chain, override creation, monsoon-gated legal move surface, and coup-handoff lifecycle trace visibility.
- **Deviations from original plan**:
  - Kept `test/integration/sim/simulator-golden.test.ts` focused on simulator-generic golden stability; FITL-specific golden assertions were implemented in a dedicated integration golden test file.
  - Did not add runtime/compiler FITL-specific branches; all behavior remains data-driven and generic.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/initial-state.test.js` passed.
  - `node --test dist/test/integration/fitl-turn-flow-golden.test.js` passed.
  - `node --test dist/test/integration/fitl-card-lifecycle.test.js` passed.
  - `node --test dist/test/integration/fitl-eligibility-window.test.js` passed.
  - `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js` passed.
  - `node --test dist/test/integration/fitl-option-matrix.test.js` passed.
  - `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/integration/sim/simulator-golden.test.js` passed.
  - `npm test` passed.
