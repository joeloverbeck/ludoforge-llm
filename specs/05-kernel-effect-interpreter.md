# Spec 05: Kernel — Effect Interpreter

**Status**: Draft
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 04
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming section 3.4, 2.1G

## Overview

Implement the state-transforming layer of the kernel: applying effects to produce new game states. Every effect returns a new state object (immutable update). Effects are the only mechanism for changing game state. This spec covers all 13 effect types including variable manipulation, token movement, zone operations, token lifecycle, control flow (if/forEach/let), and player choice expansion. The PRNG state is threaded through effects that use randomness (shuffle, random positioning, draw order).

## Scope

### In Scope
- All 13 EffectAST variants
- Effect sequencing (`applyEffects` threading state + rng)
- `forEach` implementation with hard iteration limit
- Bindings scoping for `let`, `forEach`, `chooseOne`, `chooseN`
- Variable clamping to VariableDef bounds after `setVar`/`addVar`
- Token position handling (top/bottom/random) for `moveToken`

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
}

interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
}
```

## Implementation Requirements

### Effect Type Implementations

#### 1. `setVar` — Set variable to value

```typescript
{ setVar: { scope, player?, var, value } }
```

- Evaluate `value` via `evalValue`
- If `scope === 'global'`: update `state.globalVars[var]`
- If `scope === 'pvar'`: resolve `player` via `resolvePlayerSel`, update `state.perPlayerVars[playerId][var]`
- **Clamp** result to `[VariableDef.min, VariableDef.max]`
- Return new state with updated variable

#### 2. `addVar` — Add delta to variable

```typescript
{ addVar: { scope, player?, var, delta } }
```

- Evaluate `delta` via `evalValue`
- Add to current value: `currentValue + delta`
- **Clamp** to `[VariableDef.min, VariableDef.max]`
- Return new state

#### 3. `moveToken` — Move single token between zones

```typescript
{ moveToken: { token, from, to, position? } }
```

- Resolve `token` from bindings (must be a bound Token reference)
- Resolve `from` and `to` zone selectors
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
- Advances rng state
- Return new state + updated rng

#### 8. `createToken` — Create new token in zone

```typescript
{ createToken: { type, zone, props? } }
```

- Generate a unique `TokenId` (deterministic: based on turn count + effect index, or sequential counter in state)
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
- Set iteration limit: `limit ?? 100`
- If collection size exceeds limit: truncate to limit, produce diagnostic warning
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

These do NOT prompt the agent during effect application. The agent's choice was already made during move selection (Spec 06). During effect application, the bound value is simply read.

### Effect Sequencing

`applyEffects(effects[], ctx)`:
1. Start with initial state and rng from ctx
2. For each effect in order:
   - Call `applyEffect(effect, currentCtx)`
   - Update `currentCtx.state` and `currentCtx.rng` from result
3. Return final `{ state, rng }`

Order matters: effects see the state produced by preceding effects in the sequence.

### Variable Clamping

After any `setVar` or `addVar`:
- Look up the `VariableDef` for the target variable
- Clamp result: `Math.max(def.min, Math.min(def.max, newValue))`
- This prevents variables from exceeding their declared bounds

### Token ID Generation

New tokens created by `createToken` need unique IDs. Strategy:
- Maintain a counter in GameState (or derive from turnCount + zone + effect position)
- IDs must be deterministic: same game state + same effect = same ID
- Format: `"tok_<type>_<counter>"` or similar branded string

## Invariants

1. Effects NEVER mutate input state — always return a new state object
2. `forEach` terminates within its limit (default 100 iterations)
3. `moveToken` removes token from source zone and adds to destination zone (no duplication, no loss)
4. `moveAll` moves only tokens matching the filter condition (when filter present)
5. `draw` from empty zone is a no-op (not an error)
6. `shuffle` uses the PRNG (not Math.random) and advances RNG state
7. `createToken` adds to exactly one zone
8. `destroyToken` removes from exactly one zone (error if token not found)
9. `setVar`/`addVar` only modify the targeted variable (no side effects on other state)
10. `let` bindings are scoped — not visible outside the `in` block
11. `forEach` bindings are scoped — not visible outside the `effects` block
12. Effects applied in sequence — order matters (state threading)
13. RNG state is threaded through all effects that use randomness (shuffle, moveToken with random position, createToken ID generation)
14. Variable values are always clamped to their declared `[min, max]` bounds after modification

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
- `shuffle` on zone with 0 or 1 tokens → no-op (but RNG may still advance)

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
