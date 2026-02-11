# FITLTURSEQELEANDCARFLO-007 - Deterministic Ordering Contract Enforcement

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-002`, `FITLTURSEQELEANDCARFLO-003`, `FITLTURSEQELEANDCARFLO-006`

## Goal
Codify and enforce the Spec 17 ordering contract at compiler/runtime boundaries for all non-choice sequencing sites used in turn/card flow.

## Scope
- Enforce deterministic policies for:
  - faction scan order,
  - pass replacement order,
  - eligibility-adjustment write commit order,
  - deck promotion/reveal sequencing,
  - interrupt window precedence.
- Add compile/runtime diagnostics that reject unresolved unordered semantics at these sites.
- Add deterministic trace assertions for same-seed/same-moves replay equivalence.

## File list it expects to touch
- `src/kernel/determinism.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/diagnostics.ts`
- `src/cnl/compiler.ts`
- `src/cnl/compiler-diagnostics.ts`
- `test/unit/determinism-state-roundtrip.test.ts`
- `test/unit/legal-moves.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/integration/fitl-ordering-contract.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts` (new)

## Out of scope
- New operation or event mechanics beyond ordering guarantees.
- UI/CLI presentation changes.
- FITL scenario content expansion unrelated to deterministic ordering.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/determinism-state-roundtrip.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `node --test dist/test/integration/fitl-ordering-contract.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Identical seed and move sequence yields byte-identical trace.
- Compiler/runtime reject unresolved ordering in non-choice sequencing paths.
- Ordering policy is global and generic, not FITL-special-cased.
- Existing determinism guarantees for current games are preserved.
