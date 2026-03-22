# Spec 79 — Compiled Effect Path Redesign

**Status**: PROPOSED
**Dependencies**: Spec 77 (EffectContext Split) — the compiled path must use
the same context structure as the interpreter for parity verification.
Spec 76 (Type Tags) — if implemented, compiled code can use tag-based
dispatch for fallback values.
**Blocked by**: Spec 77 (should be implemented first so the compiled path
builds on the final context structure)
**Enables**: Compilation of action effects (not just lifecycle), which is
critical for FITL performance

## Problem

The compiled lifecycle effect system (Spec 74, completed) was designed before
the interpreter was optimized. After the `texas-perf-optimization` campaign
(exp-008 through exp-013), the interpreter became **12-16% FASTER** than the
compiled path for Texas Hold'em:

```
Compiled lifecycle:  231ms/game
Interpreter only:    199ms/game
Compiled overhead:   +16.2%
```

### Root causes

1. **Per-fragment overhead in `composeFragments`**: Each fragment call does
   `{ ...compiledCtx, decisionScope }` (spread ~15 fields) plus
   `normalizeFragmentResult` (creates another object). The interpreter's
   mutable `workCtx` (exp-008) avoids both.

2. **Fallback fragment wrapper cost**: `createFallbackFragment` wraps the
   interpreter in an extra function call + `createCompiledExecutionContext`
   (another object creation) + `normalizeFragmentResult`. For 26-42% of
   effects that fall through to the interpreter, this ADDS overhead compared
   to running the interpreter directly.

3. **Two dispatch systems**: The compiled path iterates FRAGMENTS (compiled +
   fallback), while the interpreter iterates EFFECTS. The fragment abstraction
   adds a layer of indirection that the interpreter doesn't have.

4. **Coverage ceiling**: The pattern-based compiler only recognizes ~6 effect
   patterns (setVar, addVar, if, forEach-players, gotoPhaseExact). Complex
   effects (evaluateSubset, reduce, let with nested scopes) always fall
   through. This limits the compilation benefit.

### Impact on FITL

FITL has MORE lifecycle effects per phase (up to 50+ in coup/support
resolution phases) and more complex patterns (forEach over zones,
multi-level if-else trees, trigger effects). The compiled path is even MORE
likely to be slower for FITL due to higher fallback rates.

## Objective

Redesign the compiled effect execution path to be **at least as fast as** the
interpreter for all games, and **significantly faster** for games with
compilable effect patterns.

Two options are presented. The spec recommends Option B.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: Compilation is based on AST node
  types, not game-specific knowledge. Any game benefits.
- **Foundation 5 (Determinism)**: Compiled functions produce bit-identical
  results. The existing verification mode (run both paths, compare results)
  is preserved and enhanced.
- **Foundation 6 (Bounded Computation)**: Compiled loops preserve iteration
  bounds. forEach compiles to counted loops bounded by query result length.
- **Foundation 7 (Immutability)**: Compiled functions return new state objects
  (or mutate drafts if Spec 78 is implemented). External contract preserved.
- **Foundation 11 (Testing)**: Parity between compiled and interpreted paths
  is proven by automated verification tests.

## Option A: Fix Compiled Path Overhead (LOW EFFORT)

Apply the same optimizations from the interpreter to the compiled path:

1. **Mutable working context in `composeFragments`**: Replace per-fragment
   `{ ...compiledCtx, decisionScope }` with a mutable working context
   (same pattern as `applyEffectsWithBudgetState`).

2. **Eliminate `normalizeFragmentResult`**: Return handler results directly
   and normalize in the loop (same pattern as `applyEffectWithBudget`
   post exp-008).

3. **Eliminate `createCompiledExecutionContext` for fallback fragments**:
   Pass the compiled context directly to the interpreter instead of creating
   a separate execution context.

**Estimated impact**: Bring compiled path to parity with interpreter (0%
overhead instead of +16%). Does NOT make compilation faster than the
interpreter — it just removes the compilation tax.

**Effort**: 1-2 days. Changes to `effect-compiler.ts` only.

## Option B: Whole-Sequence Compilation (HIGH EFFORT, RECOMMENDED)

Instead of composing individual fragments, compile ENTIRE effect sequences
into single JavaScript functions.

### Current architecture (fragment-based)

```
Lifecycle onEnter effects: [setVar, setVar, if, forEach, setVar, let, gotoPhase]
                                    ↓ compile
Fragments: [compiled(setVar,setVar), fallback(if), compiled(forEach), fallback(setVar,let), compiled(gotoPhase)]
                                    ↓ compose
composeFragments loop: iterate fragments[], call each, normalize result, update state
```

### Proposed architecture (whole-sequence)

```
Lifecycle onEnter effects: [setVar, setVar, if, forEach, setVar, let, gotoPhase]
                                    ↓ compile
Single function: function onEnter_handSetup(state, rng, bindings, env) {
  // Inline compiled code for setVar, setVar
  state = { ...state, globalVars: { ...state.globalVars, x: 1, y: 2 } };
  // Inline interpreter call for 'if' (not compilable)
  const ifResult = applyIf(ifAst, env, { state, rng, bindings, decisionScope });
  state = ifResult.state; rng = ifResult.rng;
  // Inline compiled code for forEach
  for (const player of listPlayers(state)) { ... }
  // Inline interpreter call for 'let' (not compilable)
  const letResult = applyLet(letAst, env, { state, rng, bindings, decisionScope });
  state = letResult.state; rng = letResult.rng;
  // Inline compiled code for gotoPhaseExact
  state = dispatchLifecycleEvent(def, state, { type: 'phaseExit', ... }, ...);
  return { state, rng, emittedEvents, bindings, decisionScope };
}
```

The key difference: **no fragment array, no composition loop, no per-fragment
context creation**. Compiled effects are inlined directly. Non-compilable
effects call the interpreter handler directly with the current state.

### Code generation

The compiler generates a JavaScript function body as a string and uses
`new Function(...)` to create the compiled function:

```typescript
function compileEffectSequence(effects: EffectAST[], env: CompilationEnv): CompiledEffectFn {
  const lines: string[] = [];
  lines.push('let currentState = state;');
  lines.push('let currentRng = rng;');
  lines.push('let currentBindings = bindings;');
  lines.push('const emittedEvents = [];');

  for (let i = 0; i < effects.length; i++) {
    const pattern = classifyEffect(effects[i]);
    if (pattern !== null) {
      // Emit inline compiled code
      lines.push(emitCompiledEffect(pattern, i));
    } else {
      // Emit interpreter call for this specific effect
      lines.push(`const r${i} = handlers[${i}](effects[${i}], env, { state: currentState, rng: currentRng, bindings: currentBindings, decisionScope: currentScope });`);
      lines.push(`currentState = r${i}.state; currentRng = r${i}.rng;`);
      lines.push(`if (r${i}.bindings) currentBindings = r${i}.bindings;`);
    }
  }

  lines.push('return { state: currentState, rng: currentRng, emittedEvents, bindings: currentBindings, decisionScope: currentScope };');

  // Create function with closed-over handler references
  return new Function('state', 'rng', 'bindings', 'env', 'effects', 'handlers',
    lines.join('\n')
  ).bind(null) as CompiledEffectFn;
}
```

### Extending to action effects

The whole-sequence compilation approach naturally extends to action effects:

```typescript
function createGameDefRuntime(def: GameDef): GameDefRuntime {
  return {
    // ... existing fields
    compiledLifecycleEffects: compileAllLifecycleEffects(def),
    compiledActionEffects: compileAllActionEffects(def),  // NEW
  };
}
```

Action effects are compiled per-action (fold, check, call, raise, allIn for
Texas Hold'em). Each action's effect tree becomes a single compiled function.

**Impact for FITL**: FITL has 20+ actions with complex effect trees (some
with 50+ effect nodes, nested forEach over zones, evaluateSubset for hand
evaluation). Compiling these would eliminate the interpreter dispatch
overhead for the most frequently executed action effects.

### Determinism verification

The existing verification system (run both compiled and interpreted, compare
results) is preserved. The `verifyCompiledEffects` flag triggers dual
execution and comparison.

**Estimated impact**: 10-25% total improvement for games with complex effect
trees (eliminates interpreter dispatch for compiled portions). For Texas
Hold'em: ~10%. For FITL: potentially 15-25% (more effects per move).

**Effort**: 5-7 days. New code generation system, integration with
`dispatchLifecycleEvent` and `executeMoveAction`, comprehensive parity
testing.

## Recommended Approach

**Option B** is recommended because:
1. Option A only achieves parity — it doesn't make compilation worthwhile
2. Option B enables action effect compilation — the key unlock for FITL
3. Option B's code generation is simpler than fragment composition (no
   `composeFragments`, no `normalizeFragmentResult`, no fragment array)
4. The `new Function` approach is a standard JavaScript optimization
   technique used by template engines, ORMs, and serializers

## Scope

### Files affected

- `packages/engine/src/kernel/effect-compiler.ts` — rewrite compilation pipeline
- `packages/engine/src/kernel/effect-compiler-codegen.ts` — rewrite code generation
- `packages/engine/src/kernel/effect-compiler-types.ts` — simplify types
- `packages/engine/src/kernel/effect-compiler-patterns.ts` — extend pattern matching
- `packages/engine/src/kernel/gamedef-runtime.ts` — add compiledActionEffects
- `packages/engine/src/kernel/phase-lifecycle.ts` — use new compiled functions
- `packages/engine/src/kernel/apply-move.ts` — use compiled action effects
- `packages/engine/test/unit/kernel/effect-compiler*.ts` — comprehensive tests
- `packages/engine/test/integration/compiled-effects*.ts` — parity tests

### Files NOT affected

- GameDef schema (compilation is a runtime optimization, not a data change)
- GameSpecDoc YAML
- Effect handler implementations (they're called from compiled code)
- Simulator, runner, agents

## Testing

- **Parity verification**: Run 100 games per game spec (Texas Hold'em, FITL)
  with both compiled and interpreted paths, compare all state hashes
- **Coverage measurement**: Log which effects are compiled vs. fallback for
  each game, target >80% coverage
- **Performance regression test**: Compiled path must be >= interpreter speed
  (never slower)
- **Determinism**: Same seed + same actions = identical final state hash across
  compiled and interpreted modes

## Risks

- **`new Function` security**: `new Function` is similar to `eval` and may be
  blocked in certain environments (CSP headers, sandboxed contexts). This
  only affects the runner (browser) — the engine runs in Node.js where
  `new Function` is unrestricted. For the runner, the compiled functions
  are generated at game-load time from trusted GameDef data, not from user
  input.
- **Debugging compiled code**: Generated functions are harder to debug than
  handwritten code. Mitigated by the verification mode that runs both paths
  and reports mismatches.
- **Pattern coverage**: If pattern matching is incomplete, fallback-heavy
  sequences may not see improvement. The whole-sequence approach ensures
  that even mixed sequences (compiled + fallback) have less overhead than
  the current fragment composition.
