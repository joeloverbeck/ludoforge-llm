# 110DYNZONINADJ-001: Allow expression-based anchorZone in adjacentTokenAgg

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — policy-expr.ts (compiler validation), types-core.ts (compiled expression type)
**Deps**: `specs/110-dynamic-zone-in-adjacent-token-agg.md`

## Problem

`adjacentTokenAgg.anchorZone` only accepts hardcoded zone ID strings. The sibling operators `zoneProp` and `zoneTokenAgg` already accept policy expressions (e.g., `{ ref: candidate.param.targetSpace }`). This prevents agents from dynamically evaluating "how many enemy tokens are adjacent to THIS target zone" per candidate, forcing incomplete hardcoded zone-specific features.

## Assumption Reassessment (2026-04-05)

1. `analyzeAdjacentTokenAggOperator` at `policy-expr.ts:1172-1255` — confirmed. Line 1194 rejects non-string `anchorZone`.
2. `analyzeZoneSource` at `policy-expr.ts:854-890` — confirmed. Handles both strings and expressions. `operatorName` union is `'zoneProp' | 'zoneTokenAgg'` at line 859.
3. `AgentPolicyZoneSource = string | AgentPolicyExpr` at `types-core.ts:417` — confirmed. Used by `zoneProp.zone` (line 491) and `zoneTokenAgg.zone` (line 461).
4. `adjacentTokenAgg` compiled type at `types-core.ts:484` — `anchorZone: string`. Needs to change to `AgentPolicyZoneSource`.
5. Runtime at `policy-evaluation-core.ts:637` — already calls `resolvePolicyZoneId(expr.anchorZone, 'none', candidate)` with candidate context. No runtime changes needed.

## Architecture Check

1. Uses the existing `analyzeZoneSource` pattern — no new abstractions, just extending an existing union. Foundation 15 (Architectural Completeness).
2. Generic DSL fix — applies to any game with spatial adjacency, not FITL-specific. Foundation 1 (Engine Agnosticism).
3. Additive change — existing string literals continue to work. Foundation 14 (No Backwards Compat — no shims needed, just wider acceptance).

## What to Change

### 1. Extend `analyzeZoneSource` operatorName union

At `policy-expr.ts:859`, change:
```typescript
operatorName: 'zoneProp' | 'zoneTokenAgg',
```
to:
```typescript
operatorName: 'zoneProp' | 'zoneTokenAgg' | 'adjacentTokenAgg',
```

### 2. Replace string-only validation in `analyzeAdjacentTokenAggOperator`

At `policy-expr.ts:1189-1203`, replace the string check:
```typescript
const anchorZone = obj['anchorZone'];
if (typeof anchorZone !== 'string' || anchorZone.length === 0) { ... }
```

with a call to `analyzeZoneSource`:
```typescript
const anchorZone = obj['anchorZone'];
const zoneSource = analyzeZoneSource(anchorZone, context, diagnostics, `${path}.adjacentTokenAgg.anchorZone`, 'adjacentTokenAgg');
if (zoneSource === null) { return null; }
```

Update the return value at lines 1242-1245 to use `zoneSource.zoneExpr` instead of the raw `anchorZone` string.

### 3. Update compiled expression type

At `types-core.ts:484`, change:
```typescript
readonly anchorZone: string;
```
to:
```typescript
readonly anchorZone: AgentPolicyZoneSource;
```

### 4. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts` if the type change affects JSON schema generation.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — `analyzeZoneSource` union, `analyzeAdjacentTokenAggOperator` validation
- `packages/engine/src/kernel/types-core.ts` (modify) — `anchorZone` type in compiled expression

## Out of Scope

- Runtime changes (already handles expressions)
- `zoneProp` or `zoneTokenAgg` changes (already support expressions)
- Cookbook update (ticket 002)
- New operators

## Acceptance Criteria

### Tests That Must Pass

1. `adjacentTokenAgg` with expression `anchorZone: { ref: candidate.param.targetSpace }` compiles without errors
2. `adjacentTokenAgg` with string `anchorZone: "saigon:none"` still compiles (regression)
3. Runtime evaluation with expression anchorZone produces correct adjacency counts per candidate
4. Existing suite: `pnpm turbo test`

### Invariants

1. String literal anchorZone continues to work identically
2. Expression-resolved anchorZone evaluates deterministically (Foundation 8)
3. No game-specific logic introduced (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/adjacent-token-agg-dynamic-zone.test.ts` (new) — compile and evaluate `adjacentTokenAgg` with expression-based anchorZone
2. `packages/engine/test/unit/agents/adjacent-token-agg-string-zone.test.ts` (new or extend existing) — regression for string-based anchorZone

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-04-05
- What changed:
  - widened `adjacentTokenAgg.anchorZone` in `policy-expr.ts` to use the shared dynamic zone-source analysis path
  - widened the compiled expression type in `types-core.ts` from `string` to `AgentPolicyZoneSource`
  - updated `schemas-core.ts` and regenerated `packages/engine/schemas/GameDef.schema.json` so compiled agent catalogs accept dynamic `anchorZone` expressions
  - extended the live owning test surfaces in `policy-expr.test.ts`, `policy-eval.test.ts`, and `schemas-top-level.test.ts`
- Deviations from original plan:
  - no runtime code change was needed, as expected
  - instead of creating new dedicated adjacent-token-agg test files, the implementation extended the existing owning test modules
  - the ticket underspecified one required schema ripple, so `schemas-core.ts` and the generated schema artifact were updated too
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
  - `pnpm -F @ludoforge/engine test` (`466/466` passing)
  - `pnpm turbo test`
