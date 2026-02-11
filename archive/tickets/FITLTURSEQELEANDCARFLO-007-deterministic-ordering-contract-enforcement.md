# FITLTURSEQELEANDCARFLO-007 - Deterministic Ordering Contract Enforcement

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-002`, `FITLTURSEQELEANDCARFLO-003`, `FITLTURSEQELEANDCARFLO-006`

## Goal
Codify and enforce the Spec 17 ordering contract at compiler/runtime boundaries for all non-choice sequencing sites used in turn/card flow.

## Reassessed assumptions
- Spec reference path is correct: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`.
- Existing FITL integration coverage is already present under:
  - `test/integration/fitl-card-lifecycle.test.ts`
  - `test/integration/fitl-eligibility-window.test.ts`
  - `test/integration/fitl-eligibility-pass-chain.test.ts`
  - `test/integration/fitl-option-matrix.test.ts`
  - `test/integration/fitl-monsoon-pivotal-windows.test.ts`
- Ticket paths `test/integration/fitl-ordering-contract.test.ts` and `test/integration/fitl-card-flow-determinism.test.ts` do not currently exist and must not be assumed as pre-existing.
- Runtime ordering behavior for faction scan/pass replacement/eligibility commit/lifecycle sequencing is already implemented in `src/kernel/turn-flow-eligibility.ts`, `src/kernel/turn-flow-lifecycle.ts`, and `src/kernel/legal-moves.ts`.
- Main remaining gap is compiler-side enforcement for unresolved turn-flow ordering metadata (especially interrupt precedence contracts), plus focused deterministic replay coverage for FITL card-flow turns.

## Scope
- Keep runtime ordering logic as-is unless test evidence shows a bug.
- Add compiler diagnostics for unresolved deterministic turn-flow ordering metadata, specifically:
  - duplicate `eligibility.factions`,
  - duplicate `optionMatrix.first` rows,
  - ambiguous pivotal interrupt metadata when multiple pivotal actions are declared without precedence,
  - invalid pivotal interrupt precedence entries (duplicates or unknown factions).
- Add/adjust focused tests to prove these diagnostics and FITL card-flow deterministic replay behavior.

## File list it expects to touch
- `src/cnl/compiler.ts`
- `test/unit/compile-top-level.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts` (new, if needed)
- `tickets/FITLTURSEQELEANDCARFLO-007-deterministic-ordering-contract-enforcement.md`

## Out of scope
- New operation or event mechanics beyond ordering guarantees.
- UI/CLI presentation changes.
- FITL scenario content expansion unrelated to deterministic ordering.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-eligibility-pass-chain.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js` (new)

## Invariants that must remain true
- Identical seed and move sequence yields byte-identical trace.
- Compiler/runtime reject unresolved ordering in non-choice sequencing paths.
- Ordering policy is global and generic, not FITL-special-cased.
- Existing determinism guarantees for current games are preserved.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added compiler-side deterministic ordering diagnostics in `src/cnl/compiler.ts` for:
    - duplicate `turnFlow.eligibility.factions`,
    - duplicate `turnFlow.optionMatrix.first` rows,
    - missing pivotal interrupt precedence when multiple pivotal actions are declared,
    - invalid pivotal precedence entries (unknown factions, duplicates).
  - Added/strengthened tests:
    - `test/unit/compile-top-level.test.ts` with new blocking-diagnostic coverage for unresolved turn-flow ordering metadata.
    - `test/integration/fitl-card-flow-determinism.test.ts` for same-seed/same-move FITL replay equivalence (state + trace log).
- **Deviations from original plan**:
  - Did not add `test/integration/fitl-ordering-contract.test.ts`; equivalent ordering coverage already existed across `fitl-option-matrix`, `fitl-eligibility-pass-chain`, `fitl-eligibility-window`, and `fitl-monsoon-pivotal-windows`.
  - Kept runtime ordering logic unchanged because existing behavior and tests were already correct; scope was narrowed to compiler enforcement + deterministic replay coverage.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/compile-top-level.test.js dist/test/unit/legal-moves.test.js` passed.
  - `node --test dist/test/integration/determinism-full.test.js dist/test/integration/fitl-card-lifecycle.test.js dist/test/integration/fitl-eligibility-window.test.js dist/test/integration/fitl-eligibility-pass-chain.test.js dist/test/integration/fitl-option-matrix.test.js dist/test/integration/fitl-monsoon-pivotal-windows.test.js` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
