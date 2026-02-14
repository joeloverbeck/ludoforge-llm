# ARCHGSD-001 - GameSpecDoc Modular Composition and Imports

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / Compiler  
**Depends on**: none

## Why this ticket exists
Large real-world games will exceed practical single-file limits and become hard to maintain. We need first-class modular composition in GameSpecDoc so game definitions scale without inflating parser block ceilings.

## Reassessed baseline (current code/tests)
- `parseGameSpec` already provides deterministic intra-file multi-block merging.
- Singleton sections currently use parser-level "first definition wins" with warning (`CNL_PARSER_DUPLICATE_SINGLETON_SECTION`).
- List sections already append deterministically in encounter order.
- Source-map anchoring for parsed sections already exists and is deterministic for a single markdown input.
- Compiler/validator already enforce many duplicate-ID and cross-ref invariants deterministically.
- Missing capability: native cross-file composition/import resolution with deterministic merge semantics and import-aware diagnostics/source attribution.

## 1) Specification (what must change)
- Add native composition support via canonical `imports` in GameSpec YAML fragments.
- Add a first-class composition API in `src/cnl` that resolves imports recursively and returns:
  - composed `GameSpecDoc`;
  - composed `GameSpecSourceMap`;
  - composition diagnostics.
- Define deterministic composition semantics:
  - deterministic import traversal order (declared order);
  - deterministic section merge behavior across fragments;
  - explicit diagnostics for import cycles, unresolved imports, and singleton/list conflicts.
- Keep composition a compiler-adjacent first-class stage (not ad hoc script/preprocessing).
- Keep GameDef and runtime engine game-agnostic; only spec content and assets are game-specific.
- No alias syntax (`include`, `extends`, etc). Canonical keyword is `imports`.

## 2) Invariants (must remain true)
- Same logical spec content yields identical compiled GameDef regardless of file split granularity.
- Diagnostics remain deterministic and source-mapped to the correct fragment origin.
- Conflicting definitions fail fast with explicit composition diagnostics.
- Composition introduces no game-specific branching in kernel runtime/compiler core.

## 3) Tests that must pass
## New tests to add
- `test/unit/compose-gamespec.test.ts`
  - deterministic recursive import traversal and merge order;
  - cycle and unresolved-import diagnostics;
  - singleton conflict diagnostics;
  - deterministic source-map attribution to imported fragments.
- `test/integration/compile-pipeline-compose.test.ts`
  - compile identical monolithic vs composed specs and assert GameDef equivalence.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`

## 4) Architecture decision rationale
- Benefit over current architecture:
  - today, modularity is limited to multiple fenced YAML blocks in one markdown source;
  - cross-file decomposition is a missing primitive that hurts maintainability for large specs;
  - explicit composition API creates one deterministic, testable path instead of bespoke file concatenation in tooling.
- Risks/constraints:
  - composition semantics must be strict and deterministic to avoid hidden override behavior;
  - diagnostics must preserve fragment provenance so failures remain debuggable.

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added canonical `imports` section support to `GameSpecDoc` and parser merging.
  - Added `composeGameSpec` API with deterministic recursive import traversal, cycle/missing/resolve/singleton-conflict diagnostics, and merged source-map output.
  - Extended source-map spans with optional `sourceId` provenance so composed diagnostics remain attributable to originating fragments.
  - Added test coverage in:
    - `test/unit/compose-gamespec.test.ts`
    - `test/integration/compile-pipeline-compose.test.ts`
    - parser/game-spec/golden updates for new `imports` shape and source-map provenance behavior.
- Deviations from original plan:
  - Kept existing parser semantics for intra-file duplicate singleton sections (warning + first-wins) and enforced strict conflicts at composition stage across imported fragments.
  - Implemented composition as an explicit CNL API rather than changing runtime/kernel behavior.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
