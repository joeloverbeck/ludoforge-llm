# FITLTURSEQELEANDCARFLO-001 - Turn Flow Data Contracts and Schema

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: None

## Goal
Introduce generic `GameSpecDoc`/`GameDef` contracts for card-flow sequencing, eligibility windows, duration metadata, pass rewards, and option-matrix definitions so Spec 17 semantics can be encoded as data instead of runtime FITL branches.

## Reassessed assumptions
- The current codebase does not yet expose a `turnFlow`-style section in `GameSpecDoc`, parser section resolution, or `GameDef` schema.
- Compile-time shape diagnostics for game-spec sections are primarily owned by `src/cnl/validate-spec.ts` (and compiler-level diagnostics for compiled fields), not by `src/kernel/validate-gamedef.ts` alone.
- Existing acceptance test list misses `validate-spec` coverage that must enforce malformed/missing sequencing metadata at spec-validation time.
- This ticket should establish generic contracts and validation scaffolding only; runtime sequencing behavior is implemented by downstream tickets (`002+`).

## Scope
- Add optional generic schema/type fields for:
  - card lifecycle slot model (`played`, `lookahead`, `leader`),
  - eligibility state and override-window declarations,
  - first/second eligible option matrix,
  - pass reward table keyed by faction class,
  - lasting-effect duration declarations (card/next-card/coup/campaign).
- Add parser/compiler/spec-validation diagnostics for malformed or incomplete sequencing metadata when `turnFlow` is declared.
- Preserve backwards compatibility by keeping new fields optional.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/section-identifier.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-spec.ts`
- `src/kernel/types.ts`
- `src/cnl/compiler.ts`
- `src/kernel/schemas.ts`
- `schemas/GameDef.schema.json`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/compile-top-level.test.ts`

## Out of scope
- Runtime sequencing execution behavior.
- FITL-specific values hardcoded in engine/compiler.
- Monsoon/pivotal enforcement logic.
- Coup-round scoring or victory logic (Spec 19).
- Event payload transcription (Spec 20).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`
- `node --test dist/test/unit/validate-spec.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`

## Invariants that must remain true
- Canonical path remains `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.
- New sequencing contracts are generic and reusable by non-FITL games.
- Compiler diagnostics remain deterministic in ordering and field completeness.
- No required runtime reads from `data/fitl/...`.

## Outcome
- **Completion date**: 2026-02-11
- **What was changed**:
  - Added optional generic `turnFlow` contracts to `GameSpecDoc` and `GameDef` (`cardLifecycle`, `eligibility`, `optionMatrix`, `passRewards`, `durationWindows`).
  - Added parser/section support for singleton `turnFlow`.
  - Added compile/spec-validation diagnostics for malformed or incomplete `turnFlow` metadata.
  - Added runtime schema support (`zod` + JSON schema) for optional `GameDef.turnFlow`.
  - Added focused unit tests covering empty-doc defaults, compiler pass-through/diagnostics, schema validation, and spec validator diagnostics.
- **Deviations from original plan**:
  - `src/cnl/compiler-diagnostics.ts` and `src/kernel/validate-gamedef.ts` did not require modification for this contract-only scope.
  - Acceptance coverage was corrected to include `validate-spec` tests instead of relying only on `validate-gamedef`.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/game-spec-doc.test.js dist/test/unit/schemas-top-level.test.js dist/test/unit/validate-spec.test.js dist/test/unit/compile-top-level.test.js` passed.
  - Additional regression: `node --test dist/test/unit/validate-gamedef.test.js` passed.
