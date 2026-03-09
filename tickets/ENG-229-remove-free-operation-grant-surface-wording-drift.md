# ENG-229: Remove Free-Operation Grant Surface Wording Drift

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared diagnostic/rendering boundaries, schema/runtime wording parity, and free-operation contract surface ownership
**Deps**: archive/tickets/ENG-226-express-free-operation-grant-coupling-in-structural-schemas.md, archive/tickets/ENG/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/free-operation-sequence-context-schema.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

The recent cleanup reduced drift in free-operation grant diagnostics, but the architecture still has two related issues:

1. Shared contract validation and Zod boundary validation use different human-facing wording for the same `sequenceContext` invariant.
2. The contracts layer now owns some consumer-facing label rendering (`grantFreeOperation`, `freeOperationGrant`), which blurs the boundary between semantic contract detection and surface-specific presentation.

This is not a gameplay bug today, but it leaves the engine with avoidable wording drift and weaker ownership boundaries in a core agnostic contract surface.

## Assumption Reassessment (2026-03-09)

1. `collectTurnFlowFreeOperationGrantContractViolations(...)` is the canonical semantic detector for free-operation grant contract violations.
2. `renderTurnFlowFreeOperationGrantContractViolation(...)` now lives in the contracts layer and formats consumer-facing text with surface labels.
3. Mismatch: schema boundaries still emit a different `sequenceContext` message, and contract code now mixes semantic detection with consumer-specific presentation. Correction: restore a cleaner ownership split so the contract layer exposes canonical structured violations while boundary adapters own exact wording consistently.

## Architecture Check

1. A cleaner architecture keeps contracts semantic and structured, then lets compiler/kernel/schema adapters render surface-specific text from one canonical boundary policy.
2. This preserves the engine boundary correctly: no game-specific behavior moves into contracts, `GameDef`, or simulation; only generic grant-contract rendering is normalized.
3. No backwards-compatibility shims or alias messages should be added. Choose one canonical wording policy and make all surfaces use it.

## What to Change

### 1. Move presentation ownership out of the contracts layer

Reassess `renderTurnFlowFreeOperationGrantContractViolation(...)`. Either move it to a boundary-focused module or replace it with a more structured adapter input so contracts stop owning surface labels directly.

### 2. Normalize `sequenceContext` wording across boundaries

Make schema, compiler, validator, and runtime surfaces emit consistent wording for the same invariant, especially the “must declare/include at least one capture/require key” rule.

### 3. Add parity coverage for cross-boundary messaging

Add focused tests that assert the same free-operation grant invariant renders consistently across the supported boundaries that intentionally expose user-facing diagnostics/errors.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify)
- `packages/engine/src/kernel/free-operation-sequence-context-schema.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify if compiler wording ownership changes)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify if compiler wording changes)

## Out of Scope

- Structural schema-coupling work already addressed in ENG-226.
- New grant semantics or new free-operation contract fields.
- Any game-specific content or visual-config behavior.

## Acceptance Criteria

### Tests That Must Pass

1. The same `sequenceContext` invariant produces consistent user-facing wording across the selected schema/compiler/validator/runtime boundaries.
2. The contracts layer no longer has to hardcode consumer-specific surface labels if a cleaner boundary adapter is introduced.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Semantic contract detection remains centralized and game-agnostic.
2. Presentation wording for generic contract violations is owned by boundary adapters, not scattered independently across schema/compiler/validator/runtime surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — pin the chosen canonical wording at the schema boundary.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — keep behavioral diagnostics aligned with the same wording policy.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep runtime error text aligned for the same invariant.
4. `packages/engine/test/unit/compile-effects.test.ts` — keep compiler diagnostics aligned if compiler-facing text is part of the shared wording policy.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/schemas-ast.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
4. `pnpm -F @ludoforge/engine test`
