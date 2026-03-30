# 96GLOSTAAGG-002: Implement token filter, zone filter, and zone scope matching helpers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (evaluation helpers)
**Deps**: 96GLOSTAAGG-001, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/kernel/types-core.ts`

## Problem

The three new aggregation expression kinds all need shared matching logic: filtering tokens by type/props, filtering zones by category/attribute/variable, and scoping zones to board/aux/all. These helpers must be implemented and thoroughly tested before any expression evaluation can be built.

## Assumption Reassessment (2026-03-30)

1. Spec 96 contract work is already landed: `policy-contract.ts`, `types-core.ts`, and `schemas-core.ts` already define `AgentPolicyTokenFilter`, `AgentPolicyZoneFilter`, `AgentPolicyZoneScope`, and the `globalTokenAgg` / `globalZoneAgg` / `adjacentTokenAgg` expression kinds. This ticket must not repeat or reintroduce those contracts.
2. `policy-expr.ts` still does not analyze the three new expression kinds, and `policy-evaluation-core.ts` still throws for them. Those implementation slices remain deferred to 003/004/005. This ticket should provide the shared runtime helper layer they will consume.
3. Zone definitions use `zoneKind`, not `kind`. Scope matching must therefore read `zoneDef.zoneKind ?? 'board'` to preserve Spec 96's board-by-default semantics for zones that omit the field.
4. Zone variables live in `state.zoneVars[zoneId]` as `Record<string, number>`. Missing `zoneVars` entries are valid and must fail closed for variable comparisons.
5. Token shape is `type: string` plus scalar `props: Record<string, number | string | boolean>`. The token filter helpers should stay constrained to this scalar runtime contract.
6. `'self'` / `'active'` token-filter resolution is still needed, but it should be implemented as a generic reusable resolver for token-filter `props.*.eq` values rather than by coupling new helpers to the legacy `zoneTokenAgg.owner` concept.

## Architecture Check

1. The beneficial architectural move is still to extract standalone pure helpers, but the helpers should model the canonical Spec 96 runtime semantics directly, not just mimic the existing `zoneTokenAgg` evaluator shape. In particular, zone-scope logic must be centralized once so 003/004/005 cannot drift.
2. The helper boundary should stay small and composable: resolve token-filter literals, compare scalar values, match tokens, match zone scope, match zone filters. That is enough reuse to keep later evaluators clean without introducing speculative abstraction.
3. All helpers remain pure functions of existing compiled contracts and runtime state. No side effects, no mutation, no game-specific branching. Foundations #1, #5, and #7 preserved.
4. No backwards-compatibility shims or alias paths. The existing `zoneTokenAgg` evaluator may continue using its current owner-based contract in this ticket; later tickets can decide whether migrating it onto the new helpers is worth the churn.

## What to Change

### 1. Add `resolveTokenFilter` helper

Resolves `'self'`/`'active'` strings in token filter prop values to concrete `PlayerId` strings. Returns a resolved copy of the filter.

```typescript
export function resolveTokenFilter(
  filter: AgentPolicyTokenFilter | undefined,
  playerId: PlayerId,
  state: GameState,
): ResolvedTokenFilter | undefined
```

### 2. Add `matchesTokenFilter` helper

Tests whether a single token matches a resolved token filter.

```typescript
export function matchesTokenFilter(
  token: Token,
  filter: ResolvedTokenFilter | undefined,
): boolean
```

Logic:
- If filter is undefined, return true (all tokens match).
- If `filter.type` is set, token.type must equal it.
- If `filter.props` is set, every key/value pair must match: `token.props[key] === filter.props[key].eq`.

### 3. Add `matchesZoneScope` helper

Tests whether a zone definition matches the requested zone scope.

```typescript
export function matchesZoneScope(
  zoneDef: ZoneDef,
  scope: AgentPolicyZoneScope,
): boolean
```

Logic:
- treat `zoneDef.zoneKind ?? 'board'` as the effective scope kind
- `'board'` → effective kind is `'board'`
- `'aux'` → effective kind is `'aux'`
- `'all'` → `true`

### 4. Add `matchesZoneFilter` helper

Tests whether a zone matches a zone filter, given the current game state (for variable lookups).

```typescript
export function matchesZoneFilter(
  zoneDef: ZoneDef,
  filter: AgentPolicyZoneFilter | undefined,
  state: GameState,
): boolean
```

Logic:
- If filter is undefined, return true.
- If `filter.category` is set, `zoneDef.category` must equal it.
- If `filter.attribute` is set, evaluate `zoneDef.attributes[prop] <op> value`.
- If `filter.variable` is set, evaluate `state.zoneVars[zoneId][prop] <op> value`.
- All conditions are AND-combined (compound filter).

### 5. Add `applyComparisonOp` internal helper

Shared numeric/string/boolean comparison for filter ops (`eq`, `gt`, `gte`, `lt`, `lte`).

Constraints:
- `eq` supports scalar equality for `string | number | boolean`
- ordered comparisons (`gt`, `gte`, `lt`, `lte`) only succeed when both operands have the same primitive type and that type is `number` or `string`
- mismatched types, missing values, arrays, and unsupported comparisons fail closed (`false`)

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add exported helper functions
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — add unit tests for all helpers

## Out of Scope

- Implementing analyzer support in `packages/engine/src/agents/policy-expr.ts` for `globalTokenAgg`, `globalZoneAgg`, or `adjacentTokenAgg` (tickets 003/004/005).
- Expression evaluation methods (`evaluateGlobalTokenAggregate`, etc.) — tickets 003/004/005.
- Modifying the existing `zoneTokenAgg` evaluator to use the new helpers (optional future refactor).
- Changes to `types-core.ts`, `policy-contract.ts`, or `schemas-core.ts` (done in 001).
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. `matchesTokenFilter` correctly matches/rejects tokens by type, by props, by type+props combined, and with undefined filter (match-all).
2. `resolveTokenFilter` correctly resolves `'self'` and `'active'` in prop values to concrete player ID strings.
3. `matchesZoneScope` correctly filters by `'board'`, `'aux'`, and `'all'`.
4. `matchesZoneFilter` correctly filters by category, attribute condition (all 5 ops), variable condition (all 5 ops), and compound (category + attribute).
5. Edge cases: empty token props, missing zone attributes, missing zone variables, zero-value comparisons, and omitted `zoneKind` defaulting to board semantics.
6. Existing suite: `pnpm turbo test`

### Invariants

1. All helpers are pure functions — no state mutation (Foundation #7).
2. No game-specific logic in any helper — filters are generic (Foundation #1).
3. Existing `zoneTokenAgg` and `zoneProp` evaluation is untouched — no regressions.
4. `matchesZoneFilter` with undefined filter returns true (no filter = match all).
5. `matchesZoneScope` is the single source of truth for Spec 96 board/aux/all matching semantics used by later runtime tickets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — add a `describe('filter and scope matching helpers')` block with:
   - `matchesTokenFilter`: type-only, props-only, type+props, undefined filter, non-matching type, non-matching prop value
   - `resolveTokenFilter`: self resolution, active resolution, literal values pass through, undefined filter
   - `matchesZoneScope`: board-only, aux-only, all, omitted `zoneKind` treated as board
   - `matchesZoneFilter`: category, attribute eq/gt/gte/lt/lte, variable eq/gt/gte/lt/lte, compound, undefined filter
   - Edge cases: empty props, missing attributes, missing zoneVars entry, mismatched comparison types fail closed

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "filter and scope matching helpers"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-03-30

What actually changed:
- Added exported shared runtime helpers in `packages/engine/src/agents/policy-evaluation-core.ts` for `resolveTokenFilter`, `matchesTokenFilter`, `matchesZoneScope`, and `matchesZoneFilter`.
- Added a shared internal scalar comparison helper so zone attribute and zone variable filter semantics are centralized instead of being reimplemented in later evaluator tickets.
- Implemented Spec 96 board-by-default scope semantics through `zoneDef.zoneKind ?? 'board'`, correcting the original ticket's stale `kind` assumption.
- Kept the implementation scoped to shared helper infrastructure only; analyzer and evaluator support for `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` remain deferred to tickets 003/004/005 as intended by the corrected scope.
- Added direct helper coverage in `packages/engine/test/unit/agents/policy-eval.test.ts` covering token filters, `'self'` / `'active'` resolution, zone scope matching, compound zone filters, and fail-closed edge cases.

Deviations from original plan:
- The original ticket assumed the new contracts still needed to be introduced and referred to `ZoneDef.kind`. In reality, 001 already landed the contracts, and the runtime shape uses `zoneKind`. The ticket was corrected before implementation.
- No evaluator wiring was added. That remained the cleaner architecture boundary for this slice because the compiler and runtime expression support are still intentionally split into later tickets.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine typecheck`
- `node --test dist/test/unit/agents/policy-eval.test.js --test-name-pattern "filter and scope matching helpers"`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
