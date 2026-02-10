# Spec 05: Kernel — Effect Interpreter

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 04
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming section 3.4, 2.1G

## Overview

Implement the state-transforming layer of the kernel: applying effects to produce new game states. Every effect returns a new state object (immutable update). Effects are the only mechanism for changing game state. This spec covers all 13 effect types including variable manipulation, token movement, zone operations, token lifecycle, control flow (if/forEach/let), and player choice expansion. The PRNG state is threaded through effects that use randomness (shuffle, random insertion positioning).

## Scope

### In Scope
- All 13 EffectAST variants
- Effect sequencing (`applyEffects` threading state + rng)
- `forEach` implementation with hard iteration limit
- Bindings scoping for `let`, `forEach`, `chooseOne`, `chooseN`
- Variable clamping to VariableDef bounds after `setVar`/`addVar`
- Token position handling (top/bottom/random) for `moveToken`
- Deterministic runtime error behavior for invalid effect execution inputs
- Global effect-operation budget guard to prevent nested-effect blowups

### Out of Scope
- `moveTokenAdjacent` — type-checked but throws `SpatialNotImplementedError` (implemented in Spec 07)
- Game loop integration (Spec 06 calls `applyEffects`)
- Trigger dispatch after effects (Spec 06)
- Zobrist hash updates after effects (Spec 06 orchestrates this)
- Legal move enumeration (Spec 06)

## Key Types & Interfaces

### Public API

```typescript
// Apply a single effect to state. Returns new state + updated rng.
function applyEffect(
  effect: EffectAST,
  ctx: EffectContext
): EffectResult;

// Apply a sequence of effects in order, threading state + rng.
function applyEffects(
  effects: readonly EffectAST[],
  ctx: EffectContext
): EffectResult;

interface EffectContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly rng: Rng;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly moveParams: Readonly<Record<string, unknown>>;
  // moveParams holds bound values from the Move's params (populated by game loop)
  // Optional override for nested-effect protection. Default if omitted: 10_000 effect ops.
  readonly maxEffectOps?: number;
}

interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
}
```

### Binding Model

Effect evaluation uses an effective binding environment:
- `effectiveBindings = { ...ctx.moveParams, ...ctx.bindings }`
- `ctx.bindings` shadows `moveParams` on key collision (for `let`/`forEach` scoping)
- `moveParams` are immutable for the duration of effect application

`chooseOne`/`chooseN` are **apply-time assertions**, not prompts. They validate values already selected during legal move enumeration (Spec 06) and stored in `moveParams`.

### Runtime Error Semantics

Effect execution is fail-fast and deterministic. Invalid runtime inputs throw descriptive kernel errors with effect context (`effect type`, `bind name/selector`, and action/trigger origin if available in caller context):

- Missing binding (`token`, `player.chosen`, `binding` refs)
- Selector resolution cardinality mismatch for scalar operations (e.g., `setVar` targeting a single `pvar` but resolving 0 or >1 players when scalar semantics are required)
- Variable/type mismatch (undefined variable, non-numeric input for int var operations)
- Token location mismatch (`moveToken` token not found in resolved `from` zone; token appears in multiple zones)
- Invalid numeric parameters (`draw.count < 0` or non-integer; `forEach.limit <= 0` or non-integer; `chooseN.n < 0` or non-integer)
- Invalid choice payloads (`chooseOne` value not in options; `chooseN` contains value not in options, duplicates, or wrong cardinality)

No partial application inside a single effect: on error, throw before returning any updated state from that effect.

### Bounded Execution

`applyEffects` enforces a cumulative effect-operation budget across nested calls (`if`, `forEach`, `let` branches):
- Default budget: `10_000` effect applications per top-level `applyEffects` call
- Optional override via `ctx.maxEffectOps`
- Exceeding budget throws `EffectBudgetExceededError`

This guard complements Spec 04 query bounds and `forEach.limit`, preventing pathological nested expansions in Spec 05/06.

## Implementation Requirements

### Effect Type Implementations

#### 1. `setVar` — Set variable to value

```typescript
{ setVar: { scope, player?, var, value } }
```

- Evaluate `value` via `evalValue`
- If `scope === 'global'`: update `state.globalVars[var]`
- If `scope === 'pvar'`: resolve `player` via `resolvePlayerSel`, update `state.perPlayerVars[playerId][var]`
- Variable must exist and be `int`; otherwise throw descriptive error
- **Clamp** result to `[VariableDef.min, VariableDef.max]`
- Return new state with updated variable

#### 2. `addVar` — Add delta to variable

```typescript
{ addVar: { scope, player?, var, delta } }
```

- Evaluate `delta` via `evalValue`
- Add to current value: `currentValue + delta`
- Variable must exist and be `int`; otherwise throw descriptive error
- **Clamp** to `[VariableDef.min, VariableDef.max]`
- Return new state

#### 3. `moveToken` — Move single token between zones

```typescript
{ moveToken: { token, from, to, position? } }
```

- Resolve `token` from bindings (must be a bound Token reference)
- Resolve `from` and `to` zone selectors
- Validate token exists in exactly one zone and specifically in resolved `from` zone
- Remove token from source zone
- Add token to destination zone at specified position:
  - `'top'` (default): prepend to zone array (index 0)
  - `'bottom'`: append to zone array
  - `'random'`: insert at random index using PRNG (advances rng)
- Return new state + (potentially updated) rng

#### 4. `moveAll` — Bulk token movement with optional filter

```typescript
{ moveAll: { from, to, filter? } }
```

- Resolve `from` and `to` zone selectors
- If `filter` present: for each token in source zone, evaluate `filter` condition with token bound in context. Move only tokens where filter is true.
- If no filter: move all tokens
- Tokens are moved in their current order (deterministic)
- If `from` resolves to same concrete zone as `to`, effect is a no-op
- Return new state

#### 5. `moveTokenAdjacent` — Spatial token movement (STUB)

```typescript
{ moveTokenAdjacent: { token, from, direction? } }
```

- **STUB**: Throw `SpatialNotImplementedError` with descriptive message
- Implemented in Spec 07

#### 6. `draw` — Draw N tokens from top of zone

```typescript
{ draw: { from, to, count } }
```

- Resolve `from` and `to` zone selectors
- `count` must be a non-negative integer; otherwise throw descriptive error
- Move up to `count` tokens from the front (top) of source zone to destination
- If source has fewer than `count` tokens, move all available (not an error)
- If source is empty, this is a no-op
- Return new state

#### 7. `shuffle` — Randomize zone ordering

```typescript
{ shuffle: { zone } }
```

- Resolve zone selector
- Fisher-Yates shuffle using PRNG (not Math.random)
- Advances rng state only when the algorithm draws random numbers (zone size >= 2)
- Return new state + updated rng

#### 8. `createToken` — Create new token in zone

```typescript
{ createToken: { type, zone, props? } }
```

- Generate a unique `TokenId` using a deterministic monotonic state counter (recommended: `state.nextTokenOrdinal`)
- Create token with specified type and props
- If `props` provided, evaluate each value via `evalValue`
- Add token to resolved zone
- Return new state

#### 9. `destroyToken` — Remove token from game

```typescript
{ destroyToken: { token } }
```

- Resolve `token` from bindings
- Find and remove token from whichever zone it's in
- Throw if token is not found or appears in multiple zones
- Return new state

#### 10. `if` — Conditional branching

```typescript
{ if: { when, then, else? } }
```

- Evaluate `when` condition via `evalCondition`
- If true: `applyEffects(then, ctx)`
- If false and `else` present: `applyEffects(else, ctx)`
- If false and no `else`: no-op (return state unchanged)
- Return result from the executed branch

#### 11. `forEach` — Bounded iteration

```typescript
{ forEach: { bind, over, effects, limit? } }
```

- Evaluate `over` query via `evalQuery` to get collection
- Set iteration limit: `limit ?? 100` (must be positive integer)
- If collection size exceeds limit: truncate deterministically to first `limit` elements in query order
- For each element in collection (up to limit):
  - Create new bindings scope: `{ ...ctx.bindings, [bind]: element }`
  - `applyEffects(effects, ctxWithNewBindings)`
  - Thread state + rng from one iteration to the next
- Return final state + rng after all iterations

#### 12. `let` — Named intermediate binding

```typescript
{ let: { bind, value, in } }
```

- Evaluate `value` via `evalValue`
- Create new bindings scope: `{ ...ctx.bindings, [bind]: evaluatedValue }`
- `applyEffects(in, ctxWithNewBindings)`
- Binding is NOT visible outside the `in` block
- Return result from `in` effects

#### 13. `chooseOne` / `chooseN` — Player choice expansion

```typescript
{ chooseOne: { bind, options } }
{ chooseN: { bind, options, n } }
```

During effect application, these read from already-bound params in `moveParams`:
- `chooseOne`: Look up `bind` name in `ctx.moveParams`. The value was selected during legal move enumeration and bound in the Move.
- `chooseN`: Same — the N chosen items are already bound in `ctx.moveParams`.

These do NOT prompt the agent during effect application. The agent's choice was already made during move selection (Spec 06).

Apply-time behavior:
- `chooseOne`: assert a value exists for `bind` in `ctx.moveParams`, and that it belongs to evaluated `options`
- `chooseN`: assert an array exists for `bind`, cardinality is exactly `n`, all values are unique, and all belong to evaluated `options`
- State and rng are unchanged by successful `chooseOne`/`chooseN` evaluation

### Effect Sequencing

`applyEffects(effects[], ctx)`:
1. Start with initial state and rng from ctx
2. For each effect in order:
   - Call `applyEffect(effect, currentCtx)`
   - Update `currentCtx.state` and `currentCtx.rng` from result
   - Decrement cumulative effect-operation budget (including nested effects)
3. Return final `{ state, rng }`

Order matters: effects see the state produced by preceding effects in the sequence.

### Variable Clamping

After any `setVar` or `addVar`:
- Look up the `VariableDef` for the target variable
- Clamp result: `Math.max(def.min, Math.min(def.max, newValue))`
- This prevents variables from exceeding their declared bounds

### Token ID Generation

New tokens created by `createToken` need unique IDs. Strategy:
- Maintain a counter in GameState (recommended: `nextTokenOrdinal`, initialized in Spec 06 `initialState`)
- Increment exactly once per successful `createToken`
- IDs must be deterministic: same prior state + same effect sequence = same ID
- Format: `"tok_<type>_<counter>"` or similar branded string

## Invariants

1. Effects NEVER mutate input state — always return a new state object
2. `forEach` terminates within its limit (default 100 iterations)
3. `moveToken` removes token from source zone and adds to destination zone (no duplication, no loss)
4. `moveAll` moves only tokens matching the filter condition (when filter present)
5. `draw` from empty zone is a no-op (not an error)
6. `shuffle` uses the PRNG (not Math.random) and advances RNG state iff at least one random draw is required
7. `createToken` adds to exactly one zone
8. `destroyToken` removes from exactly one zone (error if token not found)
9. `setVar`/`addVar` only modify the targeted variable (no side effects on other state)
10. `let` bindings are scoped — not visible outside the `in` block
11. `forEach` bindings are scoped — not visible outside the `effects` block
12. Effects applied in sequence — order matters (state threading)
13. RNG state is threaded through all and only effects that use randomness (shuffle, `moveToken` with random position)
14. Variable values are always clamped to their declared `[min, max]` bounds after modification
15. `chooseOne`/`chooseN` never prompt at apply-time; they only validate pre-bound move params
16. `applyEffects` terminates via combined `forEach` limits and cumulative effect-operation budget guard

## Required Tests

### Unit Tests

**Variable effects**:
- `setVar` global: set threat from 0 to 5 → `state.globalVars.threat === 5`
- `setVar` per-player: set player 0's money to 10 → correct perPlayerVars
- `setVar` with clamping: set var with max=10 to value 15 → clamped to 10
- `addVar` global: add 3 to threat=2 → threat=5
- `addVar` per-player: add -2 to money=5 → money=3
- `addVar` with clamping: add 10 to var at 8 with max=10 → clamped to 10
- `addVar` with negative clamping: add -10 to var at 3 with min=0 → clamped to 0

**Token movement**:
- `moveToken` to top: token moves to index 0 of destination
- `moveToken` to bottom: token moves to last index of destination
- `moveToken` to random: token at PRNG-determined index (verify with known seed)
- `moveToken` removes from source (source count decreases by 1)
- `moveToken` adds to destination (destination count increases by 1)
- `moveAll` without filter: all tokens move
- `moveAll` with filter: only matching tokens move, others remain
- `moveAll` from empty zone: no-op

**Draw**:
- `draw` count=3 from zone with 5 tokens → 3 moved, 2 remain in source
- `draw` count=3 from zone with 1 token → 1 moved, 0 remain
- `draw` count=3 from empty zone → no-op, no error

**Shuffle**:
- `shuffle` changes ordering (with known seed, verify deterministic result)
- `shuffle` advances RNG state
- `shuffle` on zone with 0 or 1 tokens → no-op and RNG unchanged

**Token lifecycle**:
- `createToken` adds token to specified zone with correct type and props
- `createToken` with evaluated prop values (ValueExpr → concrete)
- `createToken` generates unique TokenId
- `destroyToken` removes token from zone, other tokens unaffected

**Control flow**:
- `if` true branch executes, false branch does not
- `if` false branch with else: else branch executes
- `if` false branch without else: no-op
- `forEach` iterates correct number of times, binds correctly
- `forEach` with 0 elements: no iterations, state unchanged
- `forEach` hits limit (limit=3, collection has 5): only 3 iterations
- `let` binding available inside scope
- `let` binding NOT available outside scope (verify by nested structure)
- `applyEffects` throws `EffectBudgetExceededError` when cumulative nested effect ops exceed budget

**Choice assertions**:
- `chooseOne` succeeds when move param exists and is in options domain
- `chooseOne` throws if move param missing or outside options domain
- `chooseN` succeeds when array cardinality is exactly `n` and all values are unique/in-domain
- `chooseN` throws on duplicates, wrong cardinality, or out-of-domain values

**Error paths**:
- `moveToken` throws if token is not in `from` zone
- `destroyToken` throws if token is missing
- `setVar`/`addVar` throw for unknown variable names
- `draw` throws for negative or non-integer count

**Nested effects**:
- `forEach` containing `if` containing `setVar`: correct state after
- `let` binding used inside `forEach`: each iteration sees the let value
- `forEach` binding shadows outer binding: inner uses forEach value

**Sequencing**:
- Sequence of 3 effects: each sees result of previous (state threading verified)

### Integration Tests

- Sequence of 5 effects transforms state correctly (golden test with known initial state and expected final state)
- Complex effect chain: `let` → `forEach` over tokens → `if` condition → `addVar` → verify cumulative result

### Property Tests

- `moveToken` never duplicates tokens: count of all tokens across all zones is conserved after any `moveToken`
- `applyEffect` output state has all variables within their declared `[min, max]` bounds
- After `forEach` with N items, the effect was applied exactly min(N, limit) times
- `createToken` always increases total token count by exactly 1
- `destroyToken` always decreases total token count by exactly 1
- For any successful `chooseN`, bound selection has no duplicates and length exactly `n`

### Golden Tests

- Known initial state + known sequence of 5 effects → expected final state (full state comparison)

## Acceptance Criteria

- [ ] All 13 effect types implemented and tested
- [ ] No state mutation — every effect returns new state
- [ ] `forEach` respects iteration limits
- [ ] Variable clamping works correctly for both setVar and addVar
- [ ] Token movement conserves token count (no duplication, no loss)
- [ ] `draw` from empty zone is a no-op
- [ ] `shuffle` uses PRNG deterministically
- [ ] Bindings are properly scoped (let, forEach)
- [ ] Effect sequencing threads state and rng correctly
- [ ] `moveTokenAdjacent` throws SpatialNotImplementedError
- [ ] RNG state is advanced only by effects that use randomness
- [ ] All error messages are descriptive with context
- [ ] `chooseOne`/`chooseN` validate move-bound params against options deterministically
- [ ] Cumulative effect-operation budget guard prevents pathological nested-effect blowups

## Files to Create/Modify

```
src/kernel/effects.ts            # NEW — all 13 effect implementations
src/kernel/effect-context.ts     # NEW — EffectContext and EffectResult types
src/kernel/index.ts              # MODIFY — re-export effect APIs
test/unit/effects-var.test.ts    # NEW — variable effect tests (setVar, addVar)
test/unit/effects-token.test.ts  # NEW — token movement tests (moveToken, moveAll, draw)
test/unit/effects-zone.test.ts   # NEW — zone operation tests (shuffle)
test/unit/effects-lifecycle.test.ts  # NEW — token lifecycle tests (create, destroy)
test/unit/effects-control.test.ts    # NEW — control flow tests (if, forEach, let)
test/unit/effects-sequence.test.ts   # NEW — effect sequencing tests
test/integration/effects-complex.test.ts  # NEW — complex effect chain tests
```
