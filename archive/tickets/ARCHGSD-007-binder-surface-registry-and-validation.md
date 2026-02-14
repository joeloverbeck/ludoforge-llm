# ARCHGSD-007 - Binder Surface Registry and Exhaustive Validation

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Architecture / Compiler Infrastructure  
**Depends on**: `ARCHGSD-005`

## Why this ticket exists
Binder behavior is currently duplicated across multiple compiler paths, which makes semantic drift likely as new effect nodes are added. A universal game DSL needs one authoritative binder-surface registry consumed consistently by hygiene rewriting and compiler binding validation.

## Reassessed assumptions (2026-02-14)
- Binder declarations/references were hardcoded in `src/cnl/expand-effect-macros.ts` (`collectDeclaredBinders` + `rewriteBindings`) and in `src/cnl/compile-effects.ts` (`registerSequentialBinding` + lexical scope lowering), with overlapping but separately maintained node knowledge.
- `src/cnl/compile-operations.ts` had additional hardcoded stage-boundary propagation (`chooseOne` + `forEach`) that diverged from lowering semantics.
- There was no binder-surface registry module.
- Current test coverage lived in existing unit files; no `test/unit/cnl/` layout existed.

## Architectural rationale
A shared binder-surface registry is more beneficial than the prior architecture because it provides:
- One source of truth for binder-producing fields and binder-reference rewrite surfaces.
- Deterministic failure guardrails when AST support expands without binder-surface updates.
- Lower maintenance risk by removing duplicated binder maps.

## 1) Specification (implemented)
- Introduced internal compiler registries:
  - `src/cnl/effect-kind-registry.ts`
  - `src/cnl/binder-surface-registry.ts`
- Registry now enumerates binder-producing surfaces and sequentially visible binder outputs per effect kind.
- Macro binder declaration collection and binder-template rewriting are now driven by the shared binder registry.
- Action-pipeline cross-stage binder carry-over now uses registry semantics (sequential binders only).
- Kernel/runtime remained game-agnostic and unchanged.

## 2) Invariants (preserved)
- Binder handling is centralized, deterministic, and schema-aligned.
- New binder-capable surfaces are guarded by registry + tests.
- Game-specific behavior remains encoded in `GameSpecDoc`/data assets.

## 3) Tests added/modified
## New tests
- `test/unit/binder-surface-registry.test.ts`
  - validates registry coverage across all supported effect kinds.
  - validates binder candidate extraction and declaration rewrite behavior.
  - validates sequential visibility semantics.
  - adds source-level exhaustiveness guard that compares `EffectAST` binder-capable variants to registry binder-producer kinds.

## Test updates in existing files
- `test/unit/compile-top-level.test.ts`
  - added cross-stage coverage proving `chooseN` + `rollRandom` bindings carry across pipeline stages.
  - added regression proving lexical-only binders (`forEach.bind`) do not leak across stages.

## Existing tests/commands that pass
- `npm run build` ✅
- `npm run lint` ✅
- `npm test` ✅

## Outcome
- **Completion date**: 2026-02-14
- **What changed vs originally planned**:
  - Implemented a stronger architecture than ad hoc patching by introducing explicit shared registries for both supported effect kinds and binder surfaces.
  - Expanded scope slightly to include `compile-operations` stage binder propagation, because this was an active discrepancy revealed by reassessment.
  - Kept runtime/kernel untouched while tightening compiler consistency.
- **Verification results**:
  - Full compile, lint, and repository test suite passed after refactor and new tests.
