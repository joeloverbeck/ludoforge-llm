# Spec 04: Kernel — Condition, Value & Query Evaluation

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 02, Spec 03
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming sections 3.1-3.3, 3.5, 2.1F

## Overview

Implement the pure evaluation layer of the kernel: resolving references against game state, evaluating value expressions (arithmetic, aggregates), evaluating conditions (boolean logic, comparisons), and enumerating option queries. This is the read-only foundation that Spec 05 (effects) and Spec 06 (game loop) build upon. All functions are pure — no side effects, no state mutation.

## Scope

### In Scope
- Reference resolution: `gvar`, `pvar`, `zoneCount`, `tokenProp`, `binding`
- Value expression evaluation: literals, references, arithmetic, aggregates
- Condition evaluation: boolean operators, comparisons, set membership
- OptionsQuery evaluation: 5 base query types (spatial queries stubbed)
- Bindings context: immutable map for let/forEach-bound values
- Player selector resolution: resolve PlayerSel to concrete player IDs
- Zone selector parsing: resolve "zoneId:playerSel" to concrete zone IDs

### Out of Scope
- Spatial queries (`adjacentZones`, `tokensInAdjacentZones`, `connectedZones`) — stubbed with descriptive error, implemented in Spec 07
- Spatial conditions (`adjacent`, `connected`) — stubbed, implemented in Spec 07
- Effect application (Spec 05)
- Game loop integration (Spec 06)
- State mutation of any kind

## Key Types & Interfaces

### Evaluation Context

```typescript
interface EvalContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  // bindings holds values from let, forEach, chooseOne/chooseN
}
```

### Public API

```typescript
// Resolve a reference to its value
function resolveRef(ref: Reference, ctx: EvalContext): number | boolean | string;

// Evaluate a value expression
function evalValue(expr: ValueExpr, ctx: EvalContext): number | boolean | string;

// Evaluate a condition
function evalCondition(cond: ConditionAST, ctx: EvalContext): boolean;

// Enumerate options from a query
function evalQuery(
  query: OptionsQuery,
  ctx: EvalContext
): readonly (Token | number | string | PlayerId | ZoneId)[];

// Resolve a PlayerSel to concrete player IDs
function resolvePlayerSel(sel: PlayerSel, ctx: EvalContext): readonly PlayerId[];

// Resolve a ZoneSel string to concrete zone ID(s)
function resolveZoneSel(sel: ZoneSel, ctx: EvalContext): readonly ZoneId[];
```

## Implementation Requirements

### Reference Resolution (Section 3.1)

| Reference | Resolution |
|-----------|------------|
| `{ ref: 'gvar', var }` | `state.globalVars[var]` — error if var undefined |
| `{ ref: 'pvar', player, var }` | Resolve `player` via `resolvePlayerSel`, then `state.perPlayerVars[playerId][var]` — error if var undefined |
| `{ ref: 'zoneCount', zone }` | Resolve `zone` via `resolveZoneSel`, return `state.zones[zoneId].length` |
| `{ ref: 'tokenProp', token, prop }` | Look up `token` in bindings (must be a bound Token), return `token.props[prop]` — error if token unbound or prop missing |
| `{ ref: 'binding', name }` | Look up `name` in `ctx.bindings` — error if undefined |

**Error handling**: All reference resolution errors produce descriptive messages including the reference path, what was expected, and what bindings/vars are available.

### Value Expression Evaluation (Section 3.3)

- **Literals**: number, boolean, string — return as-is
- **References**: delegate to `resolveRef`
- **Arithmetic**: `+`, `-`, `*` — both operands must evaluate to numbers. Division is NOT in the AST (intentionally excluded). All results are integers (use `Math.trunc` if intermediate multiplication could theoretically overflow, though in practice values are bounded by VariableDef min/max).
- **Aggregates**: `sum`, `count`, `min`, `max` over an OptionsQuery
  - `count`: return `evalQuery(query).length`
  - `sum`: for each item in `evalQuery(query)`, extract `prop` (or use item itself if numeric), sum all values
  - `min`: minimum of extracted values; return 0 if collection is empty
  - `max`: maximum of extracted values; return 0 if collection is empty

### Condition Evaluation (Section 3.2)

- `{ op: 'and', args }`: short-circuit AND — all must be true
- `{ op: 'or', args }`: short-circuit OR — at least one must be true
- `{ op: 'not', arg }`: boolean negation
- Comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`): evaluate both sides via `evalValue`, compare. For `<`, `<=`, `>`, `>=`, both sides must be numeric. For `==` and `!=`, string/boolean comparison is also allowed.
- `{ op: 'in', item, set }`: evaluate `item`, evaluate `set` — `set` must be an array-like value (from query). Check membership.

### OptionsQuery Evaluation (Section 3.5)

| Query | Result |
|-------|--------|
| `tokensInZone(zone)` | All tokens in the resolved zone |
| `intsInRange(min, max)` | Array of integers `[min, min+1, ..., max]` |
| `enums(values)` | The string array as-is |
| `players` | All player IDs |
| `zones(filter?)` | All zone IDs, optionally filtered by owner |
| `adjacentZones(zone)` | **STUB** — throw `SpatialNotImplementedError` (Spec 07) |
| `tokensInAdjacentZones(zone)` | **STUB** — throw `SpatialNotImplementedError` (Spec 07) |
| `connectedZones(zone, via?)` | **STUB** — throw `SpatialNotImplementedError` (Spec 07) |

### Player Selector Resolution (Section 3.6)

| Selector | Resolution |
|----------|------------|
| `'actor'` | `ctx.actorPlayer` |
| `'active'` | `ctx.activePlayer` |
| `'all'` | All player IDs from `def.metadata.players` |
| `'allOther'` | All player IDs except `ctx.actorPlayer` |
| `{ id: n }` | Player ID `n` (validate exists) |
| `{ chosen: name }` | Look up in `ctx.bindings[name]` (must be a PlayerId) |
| `{ relative: 'left' }` | Player to the left of actor in turn order |
| `{ relative: 'right' }` | Player to the right of actor in turn order |

### Zone Selector Resolution

Zone selectors are strings in the format `"zoneId:ownerSpec"`:
- `"deck:none"` → zone ID `"deck"` (unowned)
- `"hand:actor"` → `"hand"` zone owned by the actor player (resolves to `"hand:0"` or similar concrete ID)
- `"hand:all"` → all hand zones (one per player) — returns multiple zone IDs

### Bindings Context

Bindings are an immutable map of `{name: value}`. They are created by:
- `let` effects (bind a computed value)
- `forEach` effects (bind each iteration element)
- `chooseOne`/`chooseN` effects (bind the chosen item)
- Action `params` (bind parameter values from the move)

Bindings are scoped: inner scopes shadow outer. The bindings map is threaded through evaluation — never mutated, always copied with additions.

## Invariants

1. Evaluation is PURE — no side effects, no state mutation, no PRNG consumption
2. All arithmetic is integer-only (no floating point, use `Math.trunc` for any division-like operation)
3. `evalCondition` always returns `boolean` (never throws on well-typed input from a valid GameDef)
4. `evalValue` never returns `NaN` or `Infinity`
5. Aggregate `count` over empty collection returns `0`
6. Aggregate `min`/`max` over empty collection returns `0`
7. `tokenProp` reference on unbound token throws descriptive error listing available bindings
8. `binding` reference on undefined binding throws descriptive error listing available bindings
9. `intsInRange(min, max)` returns exactly `max - min + 1` values (inclusive both ends)
10. Query evaluator handles all 5 base query types; 3 spatial queries throw `SpatialNotImplementedError`
11. `resolvePlayerSel` for `'all'` returns players in deterministic order (sorted by ID)
12. `resolveZoneSel` for owner-qualified zones returns zone IDs in deterministic (sorted) order

## Required Tests

### Unit Tests

**Comparisons**:
- `==` with equal integers → true
- `==` with unequal integers → false
- `!=` with unequal integers → true
- `<` with 3 < 5 → true, 5 < 3 → false, 3 < 3 → false
- `<=` with 3 <= 3 → true
- `>` with 5 > 3 → true
- `>=` with 3 >= 3 → true

**Boolean logic**:
- `and([true, true])` → true
- `and([true, false])` → false
- `and([])` → true (vacuous truth)
- `or([false, true])` → true
- `or([false, false])` → false
- `or([])` → false
- `not(true)` → false
- `not(false)` → true

**Nested conditions**:
- `and([or([A, B]), not(C)])` with various truth values

**Reference resolution**:
- `gvar("threat")` with state `{threat: 5}` → 5
- `gvar("missing")` → descriptive error
- `pvar(actor, "money")` with actor=0, state `{0: {money: 10}}` → 10
- `pvar(actor, "missing")` → descriptive error
- `zoneCount("deck:none")` with 5 tokens in deck → 5
- `tokenProp("$card", "cost")` with bound card token → correct prop value
- `tokenProp("$unbound", "cost")` → error listing available bindings
- `binding("$x")` with bindings `{$x: 42}` → 42
- `binding("$missing")` → error listing available bindings

**Arithmetic**:
- `3 + 4` → 7
- `10 - 3` → 7
- `5 * 2` → 10
- `ref(gvar, "a") + ref(gvar, "b")` with a=3, b=4 → 7

**Aggregates**:
- `count(tokensInZone("hand:0"))` with 3 tokens → 3
- `count(tokensInZone("hand:0"))` with 0 tokens → 0
- `sum(tokensInZone("tableau:0"), "vp")` with tokens having vp=[1,2,3] → 6
- `sum` over empty zone → 0
- `min(tokensInZone("hand:0"), "cost")` with costs [3,1,5] → 1
- `min` over empty zone → 0
- `max(tokensInZone("hand:0"), "cost")` with costs [3,1,5] → 5

**OptionsQuery**:
- `tokensInZone("deck:none")` → correct tokens from state
- `intsInRange(1, 5)` → [1, 2, 3, 4, 5]
- `intsInRange(3, 3)` → [3]
- `enums(["red", "blue", "green"])` → ["red", "blue", "green"]
- `players` with 3-player game → [0, 1, 2] as PlayerId[]
- `zones({owner: "actor"})` with actor=0 → zones owned by player 0
- `adjacentZones` → throws SpatialNotImplementedError

**PlayerSel resolution**:
- `'actor'` → actorPlayer
- `'all'` → all players sorted
- `'allOther'` → all except actor
- `{ id: 1 }` → player 1
- `{ relative: 'left' }` → correct player in turn order

### Integration Tests

- Evaluate a complex condition from a realistic game: `and([ge(pvar(actor, money), 3), lt(gvar(threat), 10), gt(count(tokensInZone(hand:actor)), 0)])` → expected boolean

### Property Tests

- `evalCondition` always returns boolean for any valid `ConditionAST` (generated from valid GameDef structure)
- `evalValue` never returns NaN for any valid `ValueExpr` with integer inputs
- `evalQuery` for `intsInRange(a, b)` where `a <= b` returns exactly `b - a + 1` elements
- `resolvePlayerSel('all')` always returns players in ascending ID order

### Golden Tests

- Known GameState + known complex condition → expected boolean result
- Known GameState + known aggregate expression → expected numeric result

## Acceptance Criteria

- [ ] All 5 reference types resolve correctly
- [ ] All arithmetic operators produce correct integer results
- [ ] All 4 aggregate operators work (sum, count, min, max)
- [ ] All 6 comparison operators work with integer operands
- [ ] Boolean operators (and, or, not) work with short-circuit evaluation
- [ ] All 5 base OptionsQuery types return correct results
- [ ] 3 spatial queries throw `SpatialNotImplementedError` with descriptive message
- [ ] All 7 PlayerSel variants resolve correctly
- [ ] Zone selector resolution works for owned and unowned zones
- [ ] Bindings context is immutable and properly scoped
- [ ] No floating-point arithmetic anywhere in evaluation code
- [ ] All error messages include context (available bindings, available vars, etc.)

## Files to Create/Modify

```
src/kernel/eval-condition.ts     # NEW — condition evaluation
src/kernel/eval-value.ts         # NEW — value expression evaluation
src/kernel/eval-query.ts         # NEW — OptionsQuery evaluation
src/kernel/resolve-ref.ts        # NEW — reference resolution
src/kernel/resolve-selectors.ts  # NEW — PlayerSel and ZoneSel resolution
src/kernel/eval-context.ts       # NEW — EvalContext type and helpers
src/kernel/index.ts              # MODIFY — re-export evaluation APIs
test/unit/eval-condition.test.ts # NEW — condition evaluation tests
test/unit/eval-value.test.ts     # NEW — value expression tests
test/unit/eval-query.test.ts     # NEW — query evaluation tests
test/unit/resolve-ref.test.ts    # NEW — reference resolution tests
test/unit/resolve-selectors.test.ts # NEW — selector resolution tests
test/integration/eval-complex.test.ts # NEW — complex evaluation scenarios
```
