# ENG-219: Reject Nested Sequence-Context Grants in evaluateSubset.compute

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator path classification, sequence-context diagnostics
**Deps**: archive/tickets/ENG/ENG-217-complete-sequence-context-control-flow-path-traversal.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts

## Problem

`grantFreeOperation.sequenceContext` is now rejected when placed directly in `evaluateSubset.compute`, but nested grants inside `if`/`forEach`/`let`/other child effects within that same compute scope still pass validation. Runtime semantics do not preserve compute-issued grants, so any nested sequence-context grant there is equally invalid.

## Assumption Reassessment (2026-03-09)

1. Current validator correctly rejects top-level `evaluateSubset.compute[n].grantFreeOperation.sequenceContext`.
2. Current runtime still treats all `evaluateSubset.compute` effects as non-persistent regardless of nesting depth.
3. Current linkage traversal in `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` already encodes the intended persistence boundary by traversing `evaluateSubset.in` and intentionally skipping `evaluateSubset.compute`.
4. Mismatch: `validate-gamedef-behavior.ts` enforces the same invariant via a shallow path regex instead of the same scope semantics, so nested descendants under `evaluateSubset.compute` currently slip through. Correction: reject sequence-context grants for the full compute subtree by propagating explicit non-persistent validation scope, not by adding more path-shape special cases.

## Architecture Check

1. Scope-based validation is cleaner than matching only one concrete path shape; the invariant is about execution persistence, not AST depth.
2. This remains fully game-agnostic: `GameSpecDoc` can declare effects freely, while the validator enforces generic runtime persistence rules in `GameDef`.
3. The cleanest implementation is to align `validateEffectAst` recursion with the same persistence model already used by sequence-context linkage traversal, so future non-persistent scopes can reuse the same idea without more regex growth.
4. No compatibility shims or alias behavior are needed; invalid compute-subtree placements should fail outright.

## What to Change

### 1. Broaden compute-scope detection

Replace the direct-child path check with explicit validation-scope propagation so any `grantFreeOperation.sequenceContext` under `evaluateSubset.compute` is rejected, including nested `if`/`forEach`/`let`/`reduce` descendants.

### 2. Add regression coverage for nested compute descendants

Add tests for nested compute descendants and for the persistent sibling scope to pin the persistence boundary, for example:

- `evaluateSubset.compute -> if.then -> grantFreeOperation` rejects
- `evaluateSubset.in -> if.then -> grantFreeOperation` remains valid

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing `evaluateSubset` runtime semantics
- Broader sequence-context contract refactors already covered by other tickets
- Any game data or visual configuration changes

## Acceptance Criteria

### Tests That Must Pass

1. Any sequence-context grant nested anywhere under `evaluateSubset.compute` yields `EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_SCOPE_UNSUPPORTED`.
2. Equivalent grants under `evaluateSubset.in` or other persistent scopes remain valid.
3. The validator implementation no longer depends on matching only one concrete `evaluateSubset.compute[n]` path shape to enforce this invariant.
4. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. Non-persistent compute scopes can never contribute sequence-context grants, regardless of nesting shape.
2. Validation remains generic and does not encode card-specific or game-specific logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — nested `evaluateSubset.compute` descendant grant rejection.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — persistence parity check for `evaluateSubset.in`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed: `validateEffectAst` now propagates explicit persistence scope through nested effect recursion, so `grantFreeOperation.sequenceContext` is rejected anywhere under `evaluateSubset.compute` instead of only at direct child paths. The follow-up architectural cleanup extracted nested effect-scope transitions into `packages/engine/src/kernel/effect-sequence-context-scope.ts`, and both validator recursion and sequence-context linkage traversal now share that single source of truth.
- Deviations from original plan: instead of broadening the existing path regex, the implementation aligned validator behavior with the persistence model already encoded in `effect-grant-sequence-context-paths.ts`, then completed the next clean step by centralizing the persistence-scope policy in a shared helper. This keeps future non-persistent effect scopes extensible without duplicating path semantics across modules.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
