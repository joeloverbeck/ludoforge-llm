# ARCHGSD-001 - GameSpecDoc Modular Composition and Imports

**Status**: TODO  
**Priority**: P0  
**Type**: Architecture / Compiler  
**Depends on**: none

## Why this ticket exists
Large real-world games will exceed practical single-file limits and become hard to maintain. We need first-class modular composition in GameSpecDoc so game definitions scale without inflating parser block ceilings.

## 1) Specification (what must change)
- Add native composition support to GameSpecDoc via explicit imports/includes (for example, `imports:` section or equivalent canonical form).
- Support deterministic merge semantics across imported fragments:
  - deterministic import order;
  - deterministic section merge behavior;
  - explicit diagnostics for duplicate IDs/conflicts.
- Treat composition as canonical compiler input (not preprocessor hacks).
- Keep GameDef and simulator game-agnostic; all game-specific structure remains in GameSpecDoc fragments.
- No backward-compat aliasing layer for composition syntax. Choose one canonical syntax and enforce it.

## 2) Invariants (must remain true)
- Same logical spec content yields identical compiled GameDef regardless of file split granularity.
- Diagnostic paths remain deterministic and source-mapped to the correct imported file/section.
- Conflicting definitions fail fast with explicit conflict diagnostics.
- Composition cannot introduce engine/game-specific branching in kernel runtime.

## 3) Tests that must pass
## New tests to add
- `test/unit/cnl/compose-gamespec.test.ts`
  - deterministic merge order;
  - conflict diagnostics;
  - source-map correctness across imports.
- `test/integration/compile-pipeline-compose.test.ts`
  - compile identical monolithic vs composed specs and assert GameDef equivalence.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`

