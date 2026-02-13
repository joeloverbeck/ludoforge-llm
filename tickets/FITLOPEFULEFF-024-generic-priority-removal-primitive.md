# FITLOPEFULEFF-024: Generic Priority Removal Primitive

**Status**: Pending
**Priority**: P1
**Estimated effort**: Large (1-2 days)
**Spec reference**: Spec 13a effect macros, Spec 25a/25c effect expressiveness
**Depends on**: FITLOPEFULEFF-022

## Summary

Introduce a game-agnostic kernel/compiler primitive for bounded token removal by ordered priorities, then simplify FITL removal macros to use it.

Goal: remove fragile hand-written nested damage bookkeeping in YAML while keeping game-specific policy in GameSpecDoc.

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

- `src/kernel/effect-dispatch.ts` and effect runtime modules
- `src/cnl` compiler mapping for new effect primitive
- shared schemas/types for effect AST
- `data/games/fire-in-the-lake.md` — refactor `piece-removal-ordering` and wrappers to use primitive
- unit/integration tests covering primitive semantics and FITL regressions

## Out of Scope

- FITL capability/momentum modifiers
- Turn-order/action-class redesign

## Acceptance Criteria

### Tests That Must Pass
1. Primitive correctly enforces removal order and budget exhaustion.
2. Primitive handles zero budget as deterministic no-op without runtime errors.
3. FITL COIN Assault and Insurgent Attack behavior remains rule-consistent after macro refactor.
4. Existing FITL removal-ordering integration tests pass unchanged or with justified updates.

### Invariants
- Primitive is fully game-agnostic
- Game-specific targeting and side effects remain in GameSpecDoc data
- No backwards-compatibility dual execution paths
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)
