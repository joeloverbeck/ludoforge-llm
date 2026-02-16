# TEXHOLKERPRIGAMTOU-016: Canonical Action Phase Contract (No Alias Forms)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: None
**Blocks**: TEXHOLKERPRIGAMTOU-017, TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-020

## Reassessed assumptions (2026-02-16)

Current code does **not** use a single canonical action-phase shape yet:

1. `GameSpecDoc` action phase is currently `string | string[]` (`src/cnl/game-spec-doc.ts`).
2. Core runtime type is currently `PhaseId | readonly PhaseId[]` (`src/kernel/types-core.ts`).
3. Runtime schema accepts both forms (`src/kernel/schemas-core.ts`, `schemas/GameDef.schema.json`).
4. Compiler lowering currently normalizes by deduplicating array entries and collapsing one-item arrays back to a scalar (`src/cnl/compile-lowering.ts`).
5. Validation/cross-validation/runtime all contain union-shape branching for scalar-vs-array action phases (`src/cnl/validate-actions.ts`, `src/cnl/validate-spec-core.ts`, `src/cnl/cross-validate.ts`, `src/kernel/action-applicability-preflight.ts`, `src/kernel/validate-gamedef-core.ts`).
6. Existing tests and fixtures include many scalar `phase: 'main'` action definitions and some assertions that rely on scalar output shape.

Ticket assumptions were directionally correct but incomplete on migration scope: test/fixture updates are required for this contract change.

## 1) What must change / be implemented

Move action phase representation to one canonical form across GameSpecDoc -> GameDef -> runtime:

1. Replace all action `phase` contracts from `string | string[]` to `string[]` (non-empty).
2. Enforce duplicate phase ids as hard errors (deterministic diagnostics); do not silently deduplicate.
3. Keep game engine/compiler generic and game-agnostic.
4. No backward compatibility path and no aliasing.

Required code scope:

- `src/cnl/game-spec-doc.ts`
- `src/cnl/validate-actions.ts`
- `src/cnl/validate-spec-core.ts`
- `src/cnl/compile-lowering.ts`
- `src/cnl/cross-validate.ts`
- `src/kernel/types-core.ts`
- `src/kernel/schemas-core.ts`
- `src/kernel/action-applicability-preflight.ts`
- `src/kernel/validate-gamedef-core.ts`
- `schemas/GameDef.schema.json` (via artifact generation)

Migration scope (required):

- Update affected unit/integration tests and any fixture assumptions that currently depend on scalar action phase representation.

## 2) Invariants that should pass

1. Exactly one canonical action phase shape exists everywhere: non-empty phase-id array.
2. Duplicate phase ids in one action are rejected with deterministic diagnostics.
3. Phase applicability semantics remain deterministic (`currentPhase` membership check in declared phase array).
4. Existing game behavior is unchanged except for the intentional contract shape change.
5. Runtime/schema/type artifacts remain synchronized.

## 3) Tests that should pass

1. Unit: validator rejects scalar `action.phase`; accepts non-empty string arrays.
2. Unit: validator/compiler rejects duplicate phase ids in one action.
3. Unit: compiler preserves canonical phase arrays (including single-item arrays) without scalar collapse.
4. Unit: legality/applicability checks work with canonical phase arrays.
5. Unit: schema/top-level validation accepts only array action phases.
6. Regression: `npm run build`, `npm run lint`, `npm test`.

## 4) Architectural rationale

Canonical `string[]` action phases are preferable to the current union because they:

1. Remove repeated scalar/array branching across compiler and runtime paths.
2. Eliminate silent data mutation (dedupe + scalar collapse) during lowering.
3. Make validation and diagnostics explicit and deterministic.
4. Reduce long-term maintenance complexity for future compiler/runtime features.

This is an intentional contract break to improve robustness and extensibility.

## Outcome

**Completion date**: 2026-02-16

**What changed**
1. Canonical contract implemented end-to-end: action `phase` is now a non-empty array in GameSpecDoc, lowering output, runtime core types, and runtime schemas.
2. Duplicate action-phase ids now fail deterministically in both CNL validation and lowering; runtime GameDef validation also rejects malformed/duplicate phase arrays defensively.
3. Scalar-vs-array branching was removed from cross-validation, applicability preflight, and core GameDef validation paths.
4. JSON schema artifacts were regenerated and synchronized with source contracts (`schemas/GameDef.schema.json` updated).
5. Test and fixture migration completed across unit/integration/golden/property fixtures and the FITL production GameSpec data to use canonical phase arrays.

**Deviations from original plan**
1. Scope expanded to include broad fixture and production GameSpec migration; this was required to keep the full test corpus and production compile path valid after the intentional contract break.
2. Runtime boundary hardening was added (`ACTION_PHASE_INVALID`) to prevent TypeError crashes when malformed external GameDefs provide scalar/non-array `action.phase`.

**Verification**
1. `npm run build` passed.
2. `npm run lint` passed.
3. `npm test` passed (unit + integration + schema artifact check).
