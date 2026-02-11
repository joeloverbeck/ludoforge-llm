# FITLTURSEQELEANDCARFLO-008 - FITL Data Wiring, Integration, and Golden Trace

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-001`, `FITLTURSEQELEANDCARFLO-002`, `FITLTURSEQELEANDCARFLO-003`, `FITLTURSEQELEANDCARFLO-004`, `FITLTURSEQELEANDCARFLO-005`, `FITLTURSEQELEANDCARFLO-006`, `FITLTURSEQELEANDCARFLO-007`

## Goal
Wire FITL sequencing metadata through `GameSpecDoc` fixtures and close Spec 17 with integration and golden-trace coverage for pass chains, overrides, monsoon, and coup handoff.

## Scope
- Add or update FITL fixture docs with:
  - symbol order,
  - pass reward table,
  - option matrix,
  - lifecycle slots,
  - override durations,
  - monsoon/pivotal metadata.
- Add integration tests covering:
  - all first/second matrix permutations,
  - monsoon restrictions and pivotal disallow when coup is next,
  - at least one pass-chain + override + monsoon + coup-handoff sequence.
- Add/update golden trace artifact asserting required trace fields.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`
- `test/fixtures/trace/fitl-turn-flow.golden.json` (new)
- `test/integration/compile-pipeline.test.ts`
- `test/integration/fitl-option-matrix.test.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-monsoon-pivotal-windows.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/sim/simulator-golden.test.ts`

## Out of scope
- Expanding to full FITL card pack implementation (Spec 20).
- Implementing Spec 18 operation details beyond sequencing legality required by Spec 17.
- Implementing Spec 19 scoring/victory internals.
- Adding runtime dependency on `data/fitl/...` fixture files.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/sim/simulator-golden.test.js`
- `npm test`

## Invariants that must remain true
- FITL sequence executes entirely via `GameSpecDoc` -> `GameDef` -> simulation.
- Golden trace includes required Spec 17 observability fields.
- No required runtime filesystem lookup under `data/fitl/...`.
- Non-FITL fixtures and integration pipelines continue to pass unchanged.
