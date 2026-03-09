# ENG-219: Reject Nested Sequence-Context Grants in evaluateSubset.compute

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator path classification, sequence-context diagnostics
**Deps**: archive/tickets/ENG/ENG-217-complete-sequence-context-control-flow-path-traversal.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts

## Problem

`grantFreeOperation.sequenceContext` is now rejected when placed directly in `evaluateSubset.compute`, but nested grants inside `if`/`forEach`/`let`/other child effects within that same compute scope still pass validation. Runtime semantics do not preserve compute-issued grants, so any nested sequence-context grant there is equally invalid.

## Assumption Reassessment (2026-03-09)

1. Current validator correctly rejects top-level `evaluateSubset.compute[n].grantFreeOperation.sequenceContext`.
2. Current runtime still treats all `evaluateSubset.compute` effects as non-persistent regardless of nesting depth.
3. Mismatch: the current path predicate is too shallow and misses nested descendants under `evaluateSubset.compute`. Correction: reject sequence-context grants for the full compute subtree, not only direct children.

## Architecture Check

1. Scope-based validation is cleaner than matching only one concrete path shape; the invariant is about execution persistence, not AST depth.
2. This remains fully game-agnostic: `GameSpecDoc` can declare effects freely, while the validator enforces generic runtime persistence rules in `GameDef`.
3. No compatibility shims or alias behavior are needed; invalid compute-subtree placements should fail outright.

## What to Change

### 1. Broaden compute-scope detection

Replace the direct-child path check with a subtree-aware predicate so any `grantFreeOperation.sequenceContext` under `evaluateSubset.compute` is rejected.

### 2. Add regression coverage for nested compute descendants

Add tests for at least one nested shape such as `evaluateSubset.compute -> if.then -> grantFreeOperation` to pin the invariant.

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
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

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

