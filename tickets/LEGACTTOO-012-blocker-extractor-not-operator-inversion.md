# LEGACTTOO-012: Blocker Extractor — Complete `not` Operator Inversion

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-blocker-extractor.ts`
**Deps**: archive/tickets/LEGACTTOO-007-template-realizer-blocker-extractor-golden-tests.md

## Problem

`describeNotBlocker` in the blocker extractor only handles `not(==)` and `not(in)` with meaningful descriptions. All other negated conditions (`not(>=)`, `not(<)`, `not(adjacent)`, etc.) fall through to the generic `"Violated negation condition"` string. For example, `not(aid >= 3)` should produce `"Need Aid < 3"` but currently produces `"Violated negation condition"`.

## Assumption Reassessment (2026-03-07)

1. `describeNotBlocker` at `tooltip-blocker-extractor.ts:214-233` has a switch on `inner.op` with cases for `==` and `in` only; `default` returns a generic string.
2. `ConditionAST` comparison operators are `==`, `!=`, `<`, `<=`, `>`, `>=` — all six have well-defined logical inversions.
3. Spatial operators `adjacent`, `connected`, `zonePropIncludes` can be described as "not adjacent", "not connected", "not including" respectively.

## Architecture Check

1. Pure extension of an existing function — no new module or type needed.
2. No game-specific logic; operator inversion is generic math/logic.
3. No backwards compatibility concern — the generic fallback is strictly worse.

## What to Change

### 1. Complete the `describeNotBlocker` switch in `tooltip-blocker-extractor.ts`

Add inversion cases for all comparison operators:

| `inner.op` | Negated description |
|---|---|
| `==` | `Need {left} ≠ {right}` (already exists) |
| `!=` | `Need {left} = {right}` |
| `<` | `Need {left} ≥ {right}` |
| `<=` | `Need {left} > {right}` |
| `>` | `Need {left} ≤ {right}` |
| `>=` | `Need {left} < {right}` |
| `in` | `Need {item} not in set` (already exists) |
| `adjacent` | `Need {left} not adjacent to {right}` |
| `connected` | `Need {from} not connected to {to}` |
| `zonePropIncludes` | `Need {zone}.{prop} to not include {value}` |

Remove the generic `"Violated negation condition"` default — make the switch exhaustive.

## Files to Touch

- `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (modify)
- `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` (modify)

## Out of Scope

- Nested `not(and(...))` or `not(or(...))` decomposition (rare in practice)
- Blocker extractor architectural changes

## Acceptance Criteria

### Tests That Must Pass

1. `not(>= 3)` produces `"Need Aid < 3"`.
2. `not(< 5)` produces `"Need Aid ≥ 5"`.
3. `not(adjacent)` produces `"Need Saigon not adjacent to Hue"`.
4. `not(connected)` produces `"Need Saigon not connected to Hue"`.
5. `not(zonePropIncludes)` produces `"Need Saigon.terrain to not include City"`.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No `ConditionAST` leaf operator falls through to a generic description.
2. Blocker extractor remains pure and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` — add test cases for each newly-inverted operator under the `not walk rule` describe block.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
