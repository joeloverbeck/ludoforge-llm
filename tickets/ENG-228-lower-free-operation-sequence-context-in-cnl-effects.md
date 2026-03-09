# ENG-228: Lower Free-Operation Sequence Context in CNL Effects

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL effect lowering, shared grant contract parity, and compile/runtime regression coverage
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/types-ast.ts

## Problem

`grantFreeOperation.sequenceContext` is part of the generic effect AST/runtime contract, but the CNL effect-lowering path still does not read or emit it. That means CNL-authored `GameSpecDoc` effects can silently lose a game-agnostic free-operation capability even though validator/runtime/event paths support it. Silent lowering loss is not acceptable for an engine that aims to compile arbitrary board/card game behavior from declarative specs into an agnostic `GameDef`.

## Assumption Reassessment (2026-03-09)

1. `EffectAST` already includes `grantFreeOperation.sequenceContext` via `FreeOperationSequenceContextContract`.
2. Shared validation/runtime paths already understand `sequenceContext` and enforce its generic contract.
3. Mismatch: `packages/engine/src/cnl/compile-effects.ts` currently lowers `sequence`, `viabilityPolicy`, `completionPolicy`, `outcomePolicy`, and `postResolutionTurnFlow`, but does not lower `sequenceContext` at all. Correction: add first-class CNL lowering and diagnostics for `sequenceContext` so the CNL path matches the canonical grant contract.

## Architecture Check

1. The correct fix is to make CNL lowering faithfully project the existing generic grant contract, not to add downstream recovery or alias behavior.
2. This preserves the intended boundary: `GameSpecDoc` may declare game-specific sequencing data, while `GameDef`, compiler contracts, and simulator remain game-agnostic.
3. No backwards-compatibility shims should be introduced. Invalid or unsupported `sequenceContext` payloads should fail compilation explicitly rather than being dropped silently.

## What to Change

### 1. Add `sequenceContext` lowering to `grantFreeOperation`

Teach `lowerGrantFreeOperationEffect(...)` to read `source.sequenceContext`, validate its generic shape, and emit it into the lowered `EffectAST` payload when valid.

### 2. Reuse canonical generic validation

Do not invent a CNL-only `sequenceContext` contract. Reuse the shared sequence-context shape/contract so CNL, schema, validator, and runtime all accept and reject the same generic payloads.

### 3. Add regression coverage for silent-loss scenarios

Add tests proving that valid `sequenceContext` survives CNL lowering and invalid payloads fail with deterministic diagnostics instead of being ignored.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/free-operation-sequence-context-contract.ts` (modify only if a shared helper extraction is justified)
- `packages/engine/src/kernel/free-operation-sequence-context-schema.ts` (modify only if CNL can reuse it cleanly)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify only if end-to-end CNL coverage is needed)

## Out of Scope

- Event-card `freeOperationGrants` linkage semantics already covered by existing sequence-context tickets.
- FITL-specific card rewrites or data migrations.
- New sequence-context behavior beyond preserving and validating the already-declared generic contract.

## Acceptance Criteria

### Tests That Must Pass

1. CNL lowering preserves a valid `grantFreeOperation.sequenceContext` payload into the lowered `EffectAST`.
2. Invalid CNL `grantFreeOperation.sequenceContext` payloads fail with explicit diagnostics instead of being silently dropped.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. CNL lowering cannot silently erase generic free-operation grant fields that exist in the canonical AST/runtime contract.
2. `sequenceContext` remains a game-agnostic engine contract field; only its values come from game-specific `GameSpecDoc` data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — verify valid `sequenceContext` lowers through CNL and invalid payloads produce deterministic diagnostics.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — verify end-to-end compiled output retains `sequenceContext` when authored through the CNL pipeline, if unit coverage alone is insufficient.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
