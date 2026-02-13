# ARCDECANDGEN-019: Canonical GameSpecDoc-to-GameDef Mapping and Compilation Order Documentation

**Status**: ✅ COMPLETED
**Phase**: 7A + 7B (GameSpecDoc Section Mapping)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-013, ARCDECANDGEN-014, ARCDECANDGEN-018
**Reference**: `specs/32-architecture-decomposition-and-generalization.md` (Phase 7)

## Goal (Corrected)

Document the canonical mapping from current `GameSpecDoc` sections to current `GameDef` fields, and document the real compilation order implemented by `compileGameSpecToGameDef`/`compileExpandedDoc`.

This ticket is documentation-first with targeted verification tests to lock down section-order and independence guarantees.

## Reassessed Assumptions vs Current Code

1. The old Phase 7 table in Spec 32 is not aligned with implemented shapes.
- Current CNL authoring model is unified `terminal`, not top-level `endConditions`/`victory`/`scoring`.
- Current `GameDef` field is `eventCards`, not `eventDecks`.

2. The parser/canonical section model currently contains 15 sections, not 20.
- Confirmed in `src/cnl/section-identifier.ts` and `src/cnl/game-spec-doc.ts`.
- Sections such as `stackingConstraints`, `markerLattices`, and top-level `eventDecks` are not canonical GameSpecDoc sections today.

3. Coverage already exists for structured section outputs and cross-reference behavior.
- `test/unit/compiler-structured-results.test.ts` and `test/unit/cross-validate.test.ts` already validate major parts of the section contract.
- Original assumption of introducing a brand new integration harness from scratch is outdated.

4. `src/cnl/compiler-core.ts` already enforces a stable lowering sequence.
- The gap is documentation drift and missing direct order-regression assertions, not missing compiler plumbing.

## Architecture Reassessment

Is the corrected work more beneficial than leaving current architecture as-is? **Yes**.

Benefits:
- Eliminates documentation drift against the real CNL and compiler contracts.
- Makes section boundaries explicit and stable for future refactors.
- Adds focused regression tests around section independence and ordering assumptions without introducing compatibility aliases.
- Preserves the agnostic engine boundary by documenting generic compiler contracts instead of game-specific behavior.

What this ticket explicitly avoids:
- No API aliasing/backward-compat layers.
- No speculative schema expansion to non-implemented sections.
- No large compiler rewrites.

## Updated Scope

### In Scope

1. Update Phase 7 in `specs/32-architecture-decomposition-and-generalization.md` to match implemented section names, mappings, and compile order.
2. Add/strengthen tests that assert section-order invariants and section independence where dependencies permit.
3. Verify with relevant compiler/unit test suites plus lint/typecheck.

### Out of Scope

1. Renaming `eventCards` to `eventDecks` in runtime/kernel types.
2. Adding new GameSpecDoc sections not currently supported.
3. Changing compiler behavior beyond tests and documentation alignment.
4. Any game-specific behavior changes.

## Files to Touch (Corrected)

### Files to modify
- `specs/32-architecture-decomposition-and-generalization.md`
- `test/unit/compiler-structured-results.test.ts`

### Optional file (only if needed)
- `test/unit/compilation-order.test.ts`

## Corrected Acceptance Criteria

1. Spec 32 Phase 7 table exactly matches implemented `GameSpecDoc` and `GameDef` contracts.
2. Documented compile order matches real `compileGameSpecToGameDef`/`compileExpandedDoc` flow.
3. Tests cover at least one explicit order/independence invariant not previously pinned.
4. `npm run typecheck` passes.
5. `npm run lint` passes.
6. Relevant unit tests pass.

## Invariants to Preserve

1. Required sections (`metadata`, `zones` or derivable zones, `turnStructure`, `actions`, `terminal`) still gate `gameDef` materialization.
2. Optional absent sections remain non-blocking.
3. Cross-validation runs after section lowering and does not emit dependency-cascade noise when prerequisite sections are null.
4. Compiler remains generic and data-driven.

## Test Plan (Corrected)

1. Extend compiler structured-results coverage to assert a concrete independence/order scenario where:
- an earlier section compiles,
- a dependent section fails,
- unrelated sections still compile,
- and `gameDef` remains null when required fields fail.

2. Run:
- `npm run typecheck`
- `npm run lint`
- targeted unit tests for compiler structured results and cross-validation

## Outcome

**Completed on**: 2026-02-13

What was changed vs originally planned:
- Corrected ticket assumptions to match the implemented architecture (15 canonical sections, unified `terminal`, `eventCards` via data assets, and existing unit-level structured-results/cross-validation coverage).
- Updated Spec 32 Phase 7 mapping and compilation-order documentation to match current compiler behavior.
- Strengthened regression coverage in `test/unit/compiler-structured-results.test.ts` with an explicit section-independence/order test showing `actions` failures do not short-circuit later independent sections (`triggers`, `terminal`).

Verification:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `node --test dist/test/unit/compiler-structured-results.test.js dist/test/unit/cross-validate.test.js` passed.
- `npm test` passed.
