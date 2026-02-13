# ARCDECANDGEN-011: Coup Workflow Cross-Reference Contract

**Status**: 📝 PROPOSED
**Phase**: 3B (Coup-Domain Cross-Reference Design)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-010

## Problem

`coupPlan.phases[].id` and `turnStructure.phases[].id` are not the same identifier domain in current architecture.
Enforcing `coupPlan -> turnStructure` as a hard reference is incorrect and creates false diagnostics.

## Goal

Define and implement a correct, game-agnostic coup workflow contract so coup references are validated strictly without coupling to unrelated phase identifiers.

## Proposed Contract (Design Target)

1. Introduce explicit coup-step identifiers (or enum-backed step kinds) for coup workflow sections.
2. Validate `coupPlan.phases[].steps[]` against declared coup-step IDs.
3. Validate `finalRoundOmitPhases[]` against declared `coupPlan.phases[].id`.
4. Keep `turnStructure` phase validation independent from coup workflow validation.

## Files likely to touch

- `src/kernel/types-turn-flow.ts` (or successor turn-order types)
- `src/cnl/compile-victory.ts`
- `src/cnl/cross-validate.ts`
- `src/cnl/game-spec-doc.ts`
- `test/unit/cross-validate.test.ts`
- `test/unit/compile-top-level.test.ts`
- `specs/32-architecture-decomposition-and-generalization.md`

## Acceptance Criteria

- No `coupPlan -> turnStructure` ID coupling remains.
- Coup references are validated against coup-domain declarations only.
- Diagnostics are deterministic and path-specific.
- `npm run typecheck`, `npm run lint`, and `npm test` pass.

