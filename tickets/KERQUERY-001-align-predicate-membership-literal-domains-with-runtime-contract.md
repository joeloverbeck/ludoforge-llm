# KERQUERY-001: Align Predicate Membership Literal Domains with Runtime Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL predicate lowering, predicate contract coverage, unit tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/compile-conditions.ts`, `packages/engine/src/kernel/query-predicate.ts`, `packages/engine/src/kernel/value-membership.ts`, `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/query-predicate.test.ts`

## Problem

The runtime predicate contract already supports scalar membership sets of `string | number | boolean`, but compiler lowering for authored `in` / `notIn` predicates still only accepts literal `string[]` values.

That mismatch leaves the canonical predicate surface only partially generic. Authored numeric/boolean membership predicates are blocked in `GameSpecDoc` even though the engine runtime can evaluate them safely and generically.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/query-predicate.ts` currently defines predicate set values generically as scalar arrays, not string-only arrays.
2. `packages/engine/src/kernel/value-membership.ts` already enforces fail-closed scalar membership semantics, including mixed-type rejection.
3. Mismatch: `packages/engine/src/cnl/compile-conditions.ts` still narrows literal membership operands to `string[]` for both token filters and `assetRows` predicates. The corrected scope is to bring compiler lowering into parity with the existing runtime contract rather than adding new runtime behavior.

## Architecture Check

1. Matching compiler lowering to the existing runtime predicate contract is cleaner than preserving a narrower authoring surface with hidden runtime-only capability.
2. This keeps game-specific choices in `GameSpecDoc` while leaving `GameDef`, compiler internals, and runtime predicate evaluation fully game-agnostic.
3. No backwards-compatibility aliasing or alternate predicate shapes are needed. The canonical `in` / `notIn` surface remains unchanged; only the accepted literal scalar domain is corrected.

## What to Change

### 1. Broaden canonical literal membership lowering to the full scalar domain

Update predicate lowering so authored literal membership sets for token filters and `assetRows` accept canonical arrays of strings, numbers, or booleans, consistent with the runtime predicate contract.

### 2. Preserve fail-closed validation for invalid literal sets

Keep rejecting nested arrays, objects, and mixed scalar-type sets during lowering so invalid authored membership values fail before runtime.

### 3. Add parity-focused coverage

Add tests that prove compiler lowering now accepts numeric/boolean literal sets and still rejects mixed-type or non-scalar arrays.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/query-predicate.test.ts` (modify if parity coverage belongs there)

## Out of Scope

- FITL macro/data rewrites already covered by `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md`
- New predicate operators or alias shapes
- Visual presentation changes in any `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Authored token-filter membership predicates accept numeric/boolean literal sets when the predicate field domain is scalar-compatible.
2. Authored `assetRows` membership predicates accept numeric/boolean literal sets and still fail closed for mixed/non-scalar arrays.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical predicate authoring and runtime contracts stay aligned across compiler and kernel layers.
2. `GameDef` and runtime remain game-agnostic; no game-specific predicate branching is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — verify lowering accepts numeric/boolean literal membership arrays and rejects invalid mixed/non-scalar arrays.
2. `packages/engine/test/unit/eval-query.test.ts` — verify end-to-end query evaluation remains correct for numeric/boolean membership sets.
3. `packages/engine/test/unit/query-predicate.test.ts` — verify shared predicate contract expectations remain explicit at the contract boundary if additional parity coverage is useful there.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/eval-query.test.js`
4. `node --test packages/engine/dist/test/unit/query-predicate.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
