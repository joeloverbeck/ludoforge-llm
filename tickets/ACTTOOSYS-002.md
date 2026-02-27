# ACTTOOSYS-002: Static AST-to-DisplayNode Renderer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new pure-function module in `packages/engine/src/kernel/`
**Deps**: ACTTOOSYS-001

## Problem

The tooltip system needs to convert compiled `ActionDef` ASTs into human-readable display trees. This requires pure functions that map every AST variant (`ConditionAST`, `EffectAST`, `ValueExpr`, `OptionsQuery`) to `DisplayNode` trees. This is the largest ticket in the series — it handles ~10 ConditionAST variants, ~25+ EffectAST variants, ~12 ValueExpr variants, and ~15 OptionsQuery variants.

## Assumption Reassessment (2026-02-27)

1. `ConditionAST` variants (from `types-ast.ts:106-130`): `boolean`, `and`, `or`, `not`, 6 comparison ops, `in`, `adjacent`, `connected`, `zonePropIncludes`. Confirmed.
2. `EffectAST` variants (from `types-ast.ts:237-485`): `setVar`, `setActivePlayer`, `addVar`, `transferVar`, `moveToken`, `moveAll`, `moveTokenAdjacent`, `draw`, `reveal`, `conceal`, `shuffle`, `createToken`, `destroyToken`, `setTokenProp`, `if`, `forEach`, `reduce`, `removeByPriority`, `let`, `bindValue`, `evaluateSubset`, `chooseOne`, `chooseN`, `rollRandom`, `setMarker`, `shiftMarker`, `setGlobalMarker`, `flipGlobalMarker`, `shiftGlobalMarker`, `grantFreeOperation`, `gotoPhaseExact`, `advancePhase`, `pushInterruptPhase`, `popInterruptPhase`. Confirmed — ~34 variants.
3. `ValueExpr` variants (from `types-ast.ts:43-74`): literals (number/boolean/string), 12 Reference variants, binary ops, count aggregate, sum/min/max aggregate, concat, conditional if. Confirmed.
4. `OptionsQuery` variants (from `types-ast.ts:146-200`): `concat`, `tokensInZone`, `assetRows`, `tokensInMapSpaces`, `nextInOrderByCondition`, `intsInRange`, `intsInVarRange`, `enums`, `globalMarkers`, `players`, `zones`, `mapSpaces`, `adjacentZones`, `tokensInAdjacentZones`, `connectedZones`, `binding`. Confirmed — 16 variants.
5. `ActionDef` (from `types-core.ts:140-151`) has: `id`, `actor`, `executor`, `phase`, `capabilities`, `params`, `pre`, `cost`, `effects`, `limits`. Confirmed.

## Architecture Check

1. Pure functions with no GameState dependency — static conversion only. This keeps the renderer testable with just AST inputs, no need to construct game states.
2. Game-agnostic: the renderer translates generic AST structures. No game-specific keywords or identifiers.
3. Every AST variant must have an explicit case. Unrecognized variants should produce a fallback `keyword` node with the variant's discriminant key, ensuring forward compatibility if new AST variants are added.

## What to Change

### 1. Create `packages/engine/src/kernel/ast-to-display.ts`

Implement the following exported functions:

**Top-level entry point:**
- `actionDefToDisplayTree(action: ActionDef): readonly DisplayGroupNode[]`
  - Produces sections: Parameters, Preconditions, Costs, Effects, Limits
  - Omits sections with no content (null `pre`, empty `cost`, empty `effects`, empty `limits`, empty `params`)

**Condition rendering:**
- `conditionToDisplayNodes(cond: ConditionAST, indent: number): DisplayNode[]`
  - `boolean` → single line with value node `"true"` or `"false"`
  - `and`/`or` → keyword line + indented children (recursive)
  - `not` → keyword + child (recursive)
  - Comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`) → single line: `left op right`
  - `in` → single line: `item in set`
  - `adjacent` → single line: `left adjacent to right`
  - `connected` → single line: `from connected to to` (+ optional via/maxDepth)
  - `zonePropIncludes` → single line: `zone.prop includes value`

**Effect rendering:**
- `effectToDisplayNodes(effect: EffectAST, indent: number): DisplayNode[]`
  - Simple effects (setVar, addVar, moveToken, etc.) → single descriptive line
  - Compound effects (if, forEach, reduce, let, rollRandom, evaluateSubset, removeByPriority) → keyword line + indented body (recursive)
  - Choice effects (chooseOne, chooseN) → single descriptive line
  - Phase effects (gotoPhaseExact, advancePhase, pushInterruptPhase, popInterruptPhase) → single line
  - Marker effects (setMarker, shiftMarker, setGlobalMarker, flipGlobalMarker, shiftGlobalMarker) → single line
  - Other effects (draw, reveal, conceal, shuffle, createToken, destroyToken, setTokenProp, grantFreeOperation) → single line

**Value expression rendering:**
- `valueExprToInlineNodes(expr: ValueExpr): DisplayInlineNode[]`
  - Number/boolean/string literals → `value` node
  - References → `reference` node with appropriate `refKind` (e.g., `'gvar'`, `'pvar'`, `'binding'`)
  - Binary ops → `left op right` with operator node
  - Aggregates → `count(query)` or `sum(bind in query, expr)`
  - Concat → `concat(...)` with punctuation separators
  - Conditional → `if(cond, then, else)`

**Options query rendering:**
- `optionsQueryToInlineNodes(query: OptionsQuery): DisplayInlineNode[]`
  - Short descriptive text for each query type (e.g., `"tokens in zone-name"`, `"ints 1..10"`, `"asset rows from table"`)

**Helper for PlayerSel / ZoneRef / TokenSel rendering:**
- `playerSelToInlineNodes(sel: PlayerSel): DisplayInlineNode[]`
- `zoneRefToInlineNodes(zone: ZoneRef): DisplayInlineNode[]`

### 2. Export from `packages/engine/src/kernel/runtime.ts`

Append one line:
```typescript
export * from './ast-to-display.js';
```

## Files to Touch

- `packages/engine/src/kernel/ast-to-display.ts` (new)
- `packages/engine/src/kernel/runtime.ts` (modify — add one export line)

## Out of Scope

- Live condition evaluation / annotation (ACTTOOSYS-003)
- Worker API, bridge, or any runner code
- CSS styling, React components, or UI concerns
- Rendering `DisplayAnnotationNode` content (that's added by the annotator)
- Handling `NumericValueExpr` differently from `ValueExpr` (treat as `ValueExpr` subset)
- Any game-specific display names or localization

## Acceptance Criteria

### Tests That Must Pass

1. **ConditionAST coverage**: Test rendering for each ConditionAST variant — `boolean`, `and`, `or`, `not`, all 6 comparison ops, `in`, `adjacent`, `connected`, `zonePropIncludes`. Verify correct node kinds and text content.
2. **EffectAST coverage**: Test rendering for representative effects — at minimum: `setVar`, `addVar`, `moveToken`, `forEach` (with nested effects), `if` (with then/else), `let`, `reduce`, `chooseOne`, `setMarker`, `gotoPhaseExact`. Verify groups and indentation.
3. **ValueExpr coverage**: Test rendering for literals, at least 3 reference variants (`gvar`, `binding`, `pvar`), binary ops, count aggregate, conditional.
4. **OptionsQuery coverage**: Test rendering for `tokensInZone`, `intsInRange`, `enums`, `players`.
5. **ActionDef full render**: Construct a minimal `ActionDef` with params, pre, cost, effects, and limits. Verify `actionDefToDisplayTree` produces the correct section groups with appropriate labels.
6. **Empty section omission**: An `ActionDef` with `pre: null`, empty `cost`, empty `params`, empty `limits` should produce only an Effects section.
7. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
8. Build: `pnpm -F @ludoforge/engine build` — no errors.

### Invariants

1. All output is plain objects (DisplayNode types from ACTTOOSYS-001) — no functions, classes, or non-serializable values.
2. Every AST variant has an explicit rendering path. Unknown variants produce a fallback node rather than throwing.
3. `indent` values are non-negative integers and increase by 1 for each nesting level.
4. No GameState or runtime dependency — these are pure functions of AST input only.
5. No game-specific identifiers in the renderer logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — comprehensive test file covering all the acceptance criteria above. Organized into `describe` blocks: Conditions, Effects, ValueExprs, OptionsQueries, ActionDef integration, edge cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
