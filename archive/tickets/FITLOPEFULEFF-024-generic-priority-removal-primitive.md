# FITLOPEFULEFF-024: Generic Priority Removal Primitive

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Large (1-2 days)
**Spec reference**: Spec 13a effect macros, Spec 25a/25c effect expressiveness
**Depends on**: FITLOPEFULEFF-022

## Summary

Introduce a game-agnostic kernel/compiler primitive for bounded token removal by ordered priorities, then simplify FITL removal macros to use it.

Goal: remove fragile hand-written nested damage bookkeeping in YAML while keeping game-specific policy in GameSpecDoc.

## Assumption Reassessment (2026-02-13)

### Confirmed
- `piece-removal-ordering` in `data/games/fire-in-the-lake.md` currently uses deeply nested `if`/`let`/`forEach` flow for budget propagation.
- There is no existing generic ordered-removal effect primitive in kernel AST/runtime/compiler.

### Discrepancies
- Current FITL removal integration tests are partially scaffolded and do not fully assert end-to-end macro semantics for priority-group budget exhaustion.
- The original "Files to Touch" list is incomplete for this architecture change. A new effect primitive requires updates across AST types, compiler lowering, runtime dispatch, behavior validation, legal-choice walker, exhaustive type tests, and JSON schema artifacts.
- `data/games/fire-in-the-lake.md` should be treated as production fixture/spec data used by tests, not as a required runtime external input for evolved specs.

### Updated Scope
- Add one new kernel/CNL effect primitive for ordered bounded removals and per-group removal counts.
- Refactor FITL removal macros to use the primitive while preserving game-specific policy in GameSpecDoc data.
- Strengthen tests to cover:
  - primitive semantics (ordering, budget exhaustion, zero budget no-op),
  - FITL regression behavior through compiled production spec paths.

## Problem

`piece-removal-ordering` in FITL currently encodes complex nested control flow for:
- Damage budget propagation
- Multiple priority tiers
- Conditional base handling

This is error-prone and difficult to audit/extend.

## Proposed Architecture

Add a generic effect primitive (name TBD) that:
1. Accepts a `budget` (ValueExpr int)
2. Accepts ordered target groups (query/filter per group)
3. Removes tokens in order until budget exhausted
4. Exposes removed counts per group via bindings

Keep game-specific consequences in GameSpecDoc macros:
- COIN Assault macro applies +6 Aid per insurgent base removed
- Insurgent Attack macro applies attacker attrition / casualty routing rules

## Files to Touch

- `src/kernel/types-ast.ts`
- `src/kernel/schemas-ast.ts`
- `src/kernel/effect-dispatch.ts` and control/runtime modules
- `src/kernel/legal-choices.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- `src/cnl/compile-effects.ts`
- `src/cnl/cross-validate.ts` (if nested effect walking requires explicit support)
- `schemas/GameDef.schema.json` (and related schema artifacts if effect union definitions are duplicated)
- `data/games/fire-in-the-lake.md` — refactor `piece-removal-ordering` and wrappers to use primitive
- `test/unit/*` and `test/integration/*` coverage for primitive semantics and FITL regressions

## Out of Scope

- FITL capability/momentum modifiers
- Turn-order/action-class redesign

## Acceptance Criteria

### Tests That Must Pass
1. Primitive correctly enforces removal order and budget exhaustion.
2. Primitive handles zero budget as deterministic no-op without runtime errors.
3. Primitive exposes per-group removed counts via explicit bindings usable by subsequent effects.
4. FITL COIN Assault and Insurgent Attack behavior remains rule-consistent after macro refactor.
5. FITL removal-ordering tests are strengthened to assert macro behavior (not only isolated scaffold effects).

### Invariants
- Primitive is fully game-agnostic
- Game-specific targeting and side effects remain in GameSpecDoc data
- No backwards-compatibility dual execution paths
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: 2026-02-13
- Implemented:
  - Added game-agnostic `removeByPriority` effect primitive across kernel AST, compiler lowering, runtime dispatch/control-flow execution, legal-choice walking, behavior validation, and cross-validation traversal.
  - Added `remainingBind` and per-group `countBind` support to expose removal accounting without nested YAML arithmetic chains.
  - Refactored FITL `piece-removal-ordering` macro in `data/games/fire-in-the-lake.md` to use `removeByPriority` for troops + active guerrilla ordered removal, while preserving base/tunnel handling and wrapper-specific game policy.
  - Updated schema artifacts (`src/kernel/schemas-ast.ts`, `schemas/GameDef.schema.json`) and exhaustive/schema unit coverage.
  - Strengthened tests with new primitive runtime tests and explicit integration assertion that compiled FITL effects include `removeByPriority`.
- Deviations from original plan:
  - Base/tunnel resolution logic remained a `forEach` + conditional block after ordered piece removal, rather than being absorbed into the primitive, to keep primitive game-agnostic and avoid hardcoding FITL tunnel semantics.
  - `GameDef.schema.json` `removeByPriority.groups[].over` is currently permissive (`type: object`) rather than fully mirroring the full `OptionsQuery` union shape.
- Verification:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (143 tests).
