# 74COMEFFSEQ-003: Effect Compiler Code Generation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — incremental effect-compiler module + shared runtime utility
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-002

## Problem

Each compilable pattern recognized by the pattern matchers (74COMEFFSEQ-002) needs a code generator that produces an optimized JavaScript function fragment. These generators take a `PatternDescriptor` and emit a function body that performs the equivalent state transformation without going through the AST dispatch chain.

## Assumption Reassessment (2026-03-21)

1. `GameState.globalVars` is `Readonly<Record<string, VariableValue>>`, where `VariableValue = number | boolean`.
2. Per-player state lives in `GameState.perPlayerVars`, keyed by numeric player index (`Readonly<Record<number, Readonly<Record<string, VariableValue>>>>`), not `playerVars`.
3. `effect-compiler-patterns.ts` already emits generic `SetVarPattern`, `AddVarPattern`, `IfPattern`, `ForEachPlayersPattern`, and `GotoPhaseExactPattern` descriptors. Code generation should target those existing descriptors rather than introduce a second, more granular pattern surface.
4. `CompiledEffectContext` already exists in `effect-compiler-types.ts`. If code generation needs additional execution-context surface for fidelity (for example `decisionScope` or `profiler`), extend that shared contract instead of creating parallel context types.
5. `setVar`/`addVar` already resolve dynamic variable names, merge `moveParams` into bindings for evaluation, emit `varChanged` events, preserve the unchanged-state fast path, and clamp only integer vars. Compiled code must preserve those semantics exactly.
6. `gotoPhaseExact` is not a simple `currentPhase` assignment. It validates phase legality, enforces the phase-transition budget, dispatches `phaseExit` / `phaseEnter` lifecycle effects, and rejects turn-boundary rewinds. Compiled code must reuse those shared semantics, not reimplement a weaker variant.

## Architecture Check

1. Code generators produce closures, not eval'd strings. They capture descriptor constants at compile time and execute directly at runtime.
2. Generator APIs should align to the existing descriptor model from `effect-compiler-patterns.ts`, with value/condition helper compilers handling the internal branching. Do not split the public API into literal-vs-ref variants when the matcher layer already normalized that distinction.
3. Each generator returns a composable fragment that a later orchestration step can assemble into a full compiled sequence.
4. Game-agnostic: generators operate on descriptor structure and shared runtime helpers, never on game-specific identifiers (Foundation 1).
5. Deterministic: compiled functions must produce interpreter-identical `EffectResult` semantics, including state, rng, emitted events, bindings, and decision scope when applicable (Foundation 5).
6. Immutable: compiled functions return new state objects and must preserve the interpreter's unchanged-state fast paths (Foundation 7).
7. Clean architecture over duplicated semantics: prefer shared runtime helpers or direct delegation for tricky behaviors such as `gotoPhaseExact`, rather than copying interpreter logic into a second implementation surface.

## What to Change

### 1. Create `effect-compiler-codegen.ts`

**Descriptor-aligned generators:**

- `compileSetVar(desc: SetVarPattern): CompiledEffectFragment`
  - Closure that resolves the descriptor's target/value shapes and performs the same runtime validation, clamping, event emission, and immutable write behavior as `applySetVar`.

- `compileAddVar(desc: AddVarPattern): CompiledEffectFragment`
  - Closure that resolves the target/delta shapes and performs the same runtime validation, arithmetic, clamping, event emission, and immutable write behavior as `applyAddVar`.

- `compileIf(desc: IfPattern, compileBody: BodyCompiler): CompiledEffectFragment`
  - Closure that compiles the supported condition tree and delegates branch bodies through `compileBody`, preserving short-circuit behavior and `EffectResult` threading.

- `compileForEachPlayers(desc: ForEachPlayersPattern, compileBody: BodyCompiler): CompiledEffectFragment`
  - Closure with a counted loop over `state.playerCount`, preserving `bind`, optional `limit`, optional `countBind` + `inEffects`, and decision-scope/binding threading required by the current control-flow runtime.

- `compileGotoPhaseExact(desc: GotoPhaseExactPattern): CompiledEffectFragment`
  - Closure that reuses the shared `gotoPhaseExact` runtime semantics rather than open-coding a phase field update.

- `compileValueAccessor(pattern: SimpleValuePattern | SimpleNumericValuePattern): CompiledValueAccessor`
  - Returns a function that resolves a literal / `gvar` / `pvar` / binding value using the same binding precedence as the interpreter.

- `compileConditionEvaluator(pattern: CompilableConditionPattern): CompiledConditionEvaluator`
  - Returns a function that evaluates direct comparisons and logical `and` / `or` trees with interpreter-equivalent short-circuit behavior.

- `compilePatternDescriptor(desc: PatternDescriptor, compileBody: BodyCompiler): CompiledEffectFragment | null`
  - Dispatcher that routes each recognized descriptor to the correct generator.

**Fragment types:**
```typescript
export interface CompiledEffectFragment {
  readonly execute: (state: GameState, rng: Rng, bindings: Record<string, unknown>, ctx: CompiledEffectContext) => EffectResult;
  readonly nodeCount: number; // number of AST nodes this fragment replaces
}

export type CompiledValueAccessor = (
  state: GameState,
  bindings: Record<string, unknown>,
  ctx: CompiledEffectContext,
) => unknown;
export type CompiledConditionEvaluator = (
  state: GameState,
  bindings: Record<string, unknown>,
  ctx: CompiledEffectContext,
) => boolean;

export type BodyCompiler = (effects: readonly EffectAST[]) => CompiledEffectFragment | null;
```

### 2. VarDef clamping utility

Extract the integer-variable clamping logic from the existing var handlers into a shared utility (for example `clampIntVarValue(value: number, varDef: IntVariableDef): number`). The compiled generators must use the exact same helper as the interpreter.

### 3. Extend shared compiler contracts only if fidelity requires it

If the current `CompiledEffectContext` contract is insufficient to preserve execution semantics for compiled `if` / `forEach` / `gotoPhaseExact`, extend `effect-compiler-types.ts` directly. Do not introduce parallel ad hoc context types inside the codegen module.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-codegen.ts` (new)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify only if shared compiled-context fidelity requires it)
- `packages/engine/src/kernel/effects-var.ts` (modify — reuse extracted shared clamping helper)
- `packages/engine/src/kernel/index.ts` (export codegen surface if tests or downstream compiler steps need the public contract)

## Out of Scope

- Compiler orchestration / sequencing (74COMEFFSEQ-004)
- Cache management (74COMEFFSEQ-005)
- Integration with `dispatchLifecycleEvent` / runtime cache lookup (74COMEFFSEQ-004 / 74COMEFFSEQ-005 orchestration work)
- Phase 2 patterns (aggregate, moveAll, let, nextInOrderByCondition)
- Debug verification mode (74COMEFFSEQ-006)
- Changing the semantic behavior of existing effect handlers
- Changes to the effect registry

## Acceptance Criteria

### Tests That Must Pass

1. `compileSetVar` handles global and pvar targets, literal/ref/binding values, integer clamping, boolean validation, unchanged-state fast path, and emitted `varChanged` parity with `applySetVar`.
2. `compileAddVar` handles global and pvar targets, ref/binding deltas, integer clamping, unchanged-state fast path, and emitted `varChanged` parity with `applyAddVar`.
3. `compileIf` evaluates compiled comparison/logical conditions with interpreter-equivalent branch selection and `EffectResult` threading.
4. `compileForEachPlayers` matches interpreter results for all-player iteration, zero-player behavior, `limit`, and `countBind` + `inEffects`.
5. `compileGotoPhaseExact` matches `applyGotoPhaseExact`, including lifecycle dispatch and phase-transition validation.
6. `compilePatternDescriptor` returns `null` only for unsupported descriptors and dispatches every currently recognized Phase 1 descriptor family.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. **Interpreter-identical `EffectResult`**: For every compilable pattern, compiled execution matches the interpreter for state, rng, emitted events, bindings, and decision scope when those fields are relevant.
2. **Bit-identical state hashes**: `computeFullHash(compiledResult.state) === computeFullHash(interpretedResult.state)` for all covered patterns (Foundation 5).
3. **Immutability**: Compiled fragments return new state objects when a change occurs and preserve object identity for unchanged-state fast paths (Foundation 7).
4. **Bounded computation**: Compiled `forEach` loops are bounded by `state.playerCount` and any explicit `limit` (Foundation 6).
5. **Clamping fidelity**: Compiled integer var writes use the exact same clamp helper as the interpreter.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — unit tests for the codegen surface, comparing compiled fragments against interpreter execution for state hash, emitted events, bindings, and key edge cases.
2. `packages/engine/test/unit/effects-var.test.ts` — strengthen only if the shared clamp/helper extraction needs direct regression coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added `packages/engine/src/kernel/effect-compiler-codegen.ts` with descriptor-aligned generators for `setVar`, `addVar`, `if`, `forEach(players)`, `gotoPhaseExact`, plus shared value/condition compiler helpers and a descriptor dispatcher.
  - Added `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` to compare compiled fragments against interpreter execution across state, emitted events, and hash parity for the covered Phase 1 patterns.
  - Extracted shared integer clamping into `packages/engine/src/kernel/var-runtime-utils.ts` and reused it from `effects-var.ts`.
  - Extended `CompiledEffectContext` with `decisionScope` / `effectPath` support needed by compiled control-flow execution.
- Deviations from original plan:
  - The shipped API follows the existing generic descriptor model from `effect-compiler-patterns.ts` instead of introducing separate literal-vs-ref generator families.
  - `gotoPhaseExact` compilation reuses shared turn-flow runtime semantics rather than duplicating lifecycle logic inside the compiler.
  - The clamp extraction landed as a dedicated shared utility module rather than an inline export from `effects-var.ts`.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine test`
