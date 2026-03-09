# ENG-228: Lower Free-Operation Sequence Context in CNL Effects

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL effect lowering plus targeted compiler/pipeline regression coverage
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/types-ast.ts

## Problem

`grantFreeOperation.sequenceContext` is part of the generic effect AST/runtime contract, but the CNL effect-lowering path still does not read or emit it. That means CNL-authored `GameSpecDoc` effects can silently lose a game-agnostic free-operation capability even though validator/runtime/event paths support it. Silent lowering loss is not acceptable for an engine that aims to compile arbitrary board/card game behavior from declarative specs into an agnostic `GameDef`.

## Assumption Reassessment (2026-03-09)

1. `EffectAST` already includes `grantFreeOperation.sequenceContext` via `FreeOperationSequenceContextContract`, and the AST/event schemas already accept and reject the canonical shape.
2. Shared validation/runtime paths already understand `sequenceContext` and enforce its generic contract, including `sequenceContext requires sequence` and linkage validation across grant chains.
3. Existing tests already cover the canonical contract outside CNL:
   - `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts`
   - `packages/engine/test/unit/schemas-ast.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
   - `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts`
4. Actual mismatch: `packages/engine/src/cnl/compile-effects.ts` currently lowers `sequence`, `viabilityPolicy`, `completionPolicy`, `outcomePolicy`, and `postResolutionTurnFlow`, but does not lower `sequenceContext` at all. Correction: add first-class CNL lowering and diagnostics for `sequenceContext` so the CNL path matches the already-canonical grant contract.

## Architecture Check

1. The correct fix is to make CNL lowering faithfully project the existing generic grant contract, not to add downstream recovery or alias behavior.
2. This preserves the intended boundary: `GameSpecDoc` may declare game-specific sequencing data, while `GameDef`, compiler contracts, and simulator remain game-agnostic.
3. The implementation should reuse existing canonical validation surfaces instead of introducing a CNL-only schema or duplicate structural checker.
4. No backwards-compatibility shims should be introduced. Invalid or unsupported `sequenceContext` payloads should fail compilation explicitly rather than being dropped silently.

## What to Change

### 1. Add `sequenceContext` lowering to `grantFreeOperation`

Teach `lowerGrantFreeOperationEffect(...)` to read `source.sequenceContext`, validate its canonical generic shape, and emit it into the lowered `EffectAST` payload when valid.

### 2. Reuse canonical generic validation

Do not invent a CNL-only `sequenceContext` contract. Reuse the shared canonical sequence-context schema/contract so CNL, schema, validator, and runtime all accept and reject the same generic payloads.

### 3. Add regression coverage for silent-loss scenarios

Add tests proving that valid `sequenceContext` survives CNL lowering and invalid payloads fail with deterministic diagnostics instead of being ignored. Cover both malformed payload structure and the contract rule that `sequenceContext` requires `sequence`.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify if end-to-end CNL regression coverage adds signal beyond unit lowering coverage)

Shared contract/schema files should remain unchanged unless implementation proves a real gap in the canonical reusable helpers.

## Out of Scope

- Event-card `freeOperationGrants` linkage semantics already covered by existing sequence-context tickets.
- FITL-specific card rewrites or data migrations.
- New sequence-context behavior beyond preserving and validating the already-declared generic contract.

## Acceptance Criteria

### Tests That Must Pass

1. CNL lowering preserves a valid `grantFreeOperation.sequenceContext` payload into the lowered `EffectAST`.
2. Invalid CNL `grantFreeOperation.sequenceContext` payloads fail with explicit diagnostics instead of being silently dropped.
3. CNL lowering rejects `sequenceContext` when `sequence` is absent, matching the canonical grant contract.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. CNL lowering cannot silently erase generic free-operation grant fields that exist in the canonical AST/runtime contract.
2. `sequenceContext` remains a game-agnostic engine contract field; only its values come from game-specific `GameSpecDoc` data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — verify valid `sequenceContext` lowers through CNL, malformed payloads fail deterministically, and `sequenceContext` without `sequence` is rejected.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — verify end-to-end compiled output retains `sequenceContext` when authored through the CNL pipeline, if unit coverage alone is insufficient.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - `packages/engine/src/cnl/compile-effects.ts` now lowers `grantFreeOperation.sequenceContext`, validates it against the canonical sequence-context schema, and emits an explicit compiler diagnostic when `sequenceContext` is malformed or declared without `sequence`.
  - `packages/engine/test/unit/compile-effects.test.ts` now covers successful lowering, malformed `sequenceContext`, and the `sequenceContext requires sequence` contract rule.
  - `packages/engine/test/integration/compile-pipeline.test.ts` now proves the compile pipeline preserves `sequenceContext` end to end.
- Deviations from original plan:
  - No shared contract/schema files required modification; the cleaner fix was to reuse the existing canonical schema at the CNL lowering boundary rather than broadening the contract surface again.
  - Integration coverage was added because unit-only coverage would not prove that compiled `GameDef` output stopped dropping the field.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js`
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
