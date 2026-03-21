# 74COMEFFSEQ-003: Effect Compiler Code Generation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new kernel module
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-002

## Problem

Each compilable pattern recognized by the pattern matchers (74COMEFFSEQ-002) needs a code generator that produces an optimized JavaScript function fragment. These generators take a `PatternDescriptor` and emit a function body that performs the equivalent state transformation without going through the AST dispatch chain.

## Assumption Reassessment (2026-03-21)

1. `GameState.globalVars` is a `Record<string, number | boolean>` (or similar). Must verify exact type in types-core.ts.
2. `GameState.playerVars` is indexed by PlayerId then variable name. Must verify exact structure.
3. `setVar` effect handler does clamped writes respecting `min`/`max` from VarDef. The compiled version must replicate this.
4. `gotoPhaseExact` handler updates `state.currentPhase` and may trigger lifecycle dispatch. The compiled version needs the same semantic.
5. `addVar` applies arithmetic then clamps. Must replicate exactly.

## Architecture Check

1. Code generators produce closures (not eval'd strings) — they capture pattern-specific constants at compile time and execute with minimal overhead at runtime.
2. Each generator returns a `CompiledEffectFn` or a composable fragment that the compiler (74COMEFFSEQ-004) assembles into a full sequence.
3. Game-agnostic: generators operate on AST structure, not game identifiers (Foundation 1).
4. Deterministic: compiled functions must produce bit-identical results to the interpreter (Foundation 5). No floating-point, integer arithmetic with `Math.trunc` where needed.
5. Immutable: compiled functions return new state objects. Internal transient mutation with a final freeze is acceptable per FOUNDATIONS.md addendum.

## What to Change

### 1. Create `effect-compiler-codegen.ts`

**Per-pattern generators:**

- `compileSetVarGlobalLiteral(desc: SetVarGlobalLiteralPattern): CompiledEffectFragment`
  - Closure that spreads globalVars with the literal value, applying min/max clamping from VarDef.

- `compileSetVarGlobalRef(desc: SetVarGlobalRefPattern): CompiledEffectFragment`
  - Closure that looks up the ref value and spreads it into globalVars.

- `compileSetVarPvar(desc: SetVarPvarPattern): CompiledEffectFragment`
  - Closure that updates the chosen player's variable map.

- `compileAddVar(desc: AddVarPattern): CompiledEffectFragment`
  - Closure that reads current value, adds operand, clamps, writes back.

- `compileIfSimple(desc: IfSimplePattern, compileBody: BodyCompiler): CompiledEffectFragment`
  - Closure that evaluates a direct comparison, then runs compiled then-branch (and optional else-branch).

- `compileIfLogical(desc: IfLogicalPattern, compileBody: BodyCompiler): CompiledEffectFragment`
  - Closure with short-circuit `&&`/`||` chain.

- `compileForEachPlayers(desc: ForEachPlayersPattern, compileBody: BodyCompiler): CompiledEffectFragment`
  - Closure with counted `for` loop over `state.players` (or equivalent).

- `compileGotoPhaseExact(desc: GotoPhaseExactPattern): CompiledEffectFragment`
  - Closure that updates `state.currentPhase` to the target phase.

- `compileRefValue(desc: RefValuePattern): CompiledValueAccessor`
  - Returns a function that resolves a gvar/pvar/binding reference to its current value.

**Fragment types:**
```typescript
export interface CompiledEffectFragment {
  readonly execute: (state: GameState, rng: Rng, bindings: Record<string, unknown>, ctx: CompiledEffectContext) => EffectResult;
  readonly nodeCount: number; // number of AST nodes this fragment replaces
}

export type CompiledValueAccessor = (state: GameState, bindings: Record<string, unknown>, activePlayer: PlayerId) => unknown;

export type BodyCompiler = (effects: readonly EffectAST[]) => CompiledEffectFragment | null;
```

### 2. VarDef clamping utility

Extract or reuse the clamping logic from the existing `setVar`/`addVar` handlers into a shared `clampVarValue(value: number, varDef: VarDef): number` utility. The compiled generators must use the exact same clamping logic as the interpreter.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-codegen.ts` (new)
- `packages/engine/src/kernel/effects-var.ts` (modify — extract shared clamping utility if not already extracted)

## Out of Scope

- Compiler orchestration / sequencing (74COMEFFSEQ-004)
- Cache management (74COMEFFSEQ-005)
- Integration with `dispatchLifecycleEvent` (74COMEFFSEQ-005)
- Phase 2 patterns (aggregate, moveAll, let, nextInOrderByCondition)
- Debug verification mode (74COMEFFSEQ-006)
- Modifying any existing effect handler behavior
- Changes to the effect registry

## Acceptance Criteria

### Tests That Must Pass

1. `compileSetVarGlobalLiteral` — produces a fragment that sets a global var to a literal value; result matches `applySetVar` for the same input state.
2. `compileSetVarGlobalRef` — produces a fragment that sets a global var to another var's value; result matches interpreter.
3. `compileAddVar` — produces a fragment that adds to a var and clamps correctly; result matches interpreter for boundary cases (min/max).
4. `compileIfSimple` — evaluates condition and runs correct branch; both branches produce interpreter-identical results.
5. `compileForEachPlayers` — iterates all players and applies body to each; result matches interpreter.
6. `compileGotoPhaseExact` — updates currentPhase correctly; result matches interpreter.
7. Each generator handles edge cases: zero players, undefined var (should match interpreter error behavior), boolean vars.
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. **Bit-identical results**: For every compilable pattern, `compiledFragment.execute(state, rng, bindings, ctx)` must produce an `EffectResult` where `computeFullHash(result.state) === computeFullHash(interpretedResult.state)` (Foundation 5).
2. **Immutability**: Compiled fragments return new state objects, never mutate inputs (Foundation 7).
3. **Bounded computation**: Compiled `forEach` loops are bounded by the finite player list length (Foundation 6).
4. **Clamping fidelity**: Compiled var writes use the exact same min/max clamping as the interpreter.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — unit tests for each generator with known input states, comparing compiled output to interpreter output via hash comparison.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
