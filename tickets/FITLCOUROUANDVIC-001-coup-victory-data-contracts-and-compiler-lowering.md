# FITLCOUROUANDVIC-001 - Coup/Victory Data Contracts and Compiler Lowering

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: Spec 17/18 data-path foundations already in repo

## Goal
Add generic `GameSpecDoc` and `GameDef` contract support for declarative Coup-phase plans and victory definitions so Spec 19 can be encoded in YAML without FITL-specific runtime branching.

## Implementation Tasks
1. Extend `GameSpecDoc` schema/types with generic Coup/victory declarative sections.
2. Lower those sections in compiler output into runtime `GameDef` structures.
3. Add structural validation and blocking diagnostics for malformed declarations.
4. Keep all new contracts title-agnostic (no FITL literals or special-case branches).

## File List Expected To Touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/compiler.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/validate-gamedef.ts`
- `src/kernel/index.ts`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- Executing any Coup phase behavior.
- Track recomputation algorithms.
- Final ranking/margin calculations.
- FITL YAML content authoring beyond minimal fixtures needed for compilation tests.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`
- `node --test dist/test/unit/validate-gamedef.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Compiler path remains `GameSpecDoc` -> `GameDef` with deterministic output ordering.
- Runtime/compiler modules contain no FITL-identifier branching.
- Invalid declarations fail with deterministic diagnostics (`code`, `path`, `message` non-empty).

