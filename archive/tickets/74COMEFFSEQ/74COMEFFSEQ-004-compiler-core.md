# 74COMEFFSEQ-004: Effect Compiler Core Orchestrator

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel orchestration module plus shared compiled-runtime helper
**Deps**: archive/tickets/74COMEFFSEQ/74COMEFFSEQ-001-types-and-interfaces.md, archive/tickets/74COMEFFSEQ/74COMEFFSEQ-002-pattern-matchers.md, archive/tickets/74COMEFFSEQ/74COMEFFSEQ-003-code-generation.md, specs/74-compiled-effect-sequences.md

## Problem

The codebase already has the core building blocks for compiled lifecycle effects:

- `effect-compiler-types.ts` defines the compiled contracts and lifecycle cache keys.
- `effect-compiler-patterns.ts` classifies the supported Phase 1 AST families and computes coverage.
- `effect-compiler-codegen.ts` lowers supported descriptors into closure-based compiled fragments that preserve current engine semantics.
- `GameDefRuntime` already carries a `compiledLifecycleEffects` map, but nothing populates it yet.

What is still missing is the orchestrator that composes these fragments into a full compiled sequence, falls back to the interpreter for unsupported nodes, and bulk-compiles lifecycle effects across phases. Without that orchestrator, the existing compiler pieces remain disconnected and untestable as a coherent execution path.

## Assumption Reassessment (2026-03-22)

1. Lifecycle effects live on `GameDef.turnStructure.phases`, not on a top-level `GameDef.phases`. Each `PhaseDef` has `id`, optional `onEnter`, and optional `onExit` in `packages/engine/src/kernel/types-core.ts`.
2. `GameDefRuntime.compiledLifecycleEffects` already exists in `packages/engine/src/kernel/gamedef-runtime.ts`. This ticket must not reintroduce or rename that field.
3. The current engine import surface uses `applyEffects` from `packages/engine/src/kernel/effects.ts`, which re-exports `effect-dispatch.ts`. Ticket text that points directly at `effect-dispatch.ts` as the public dependency is too specific for the current architecture.
4. `effect-compiler-types.ts`, `effect-compiler-patterns.ts`, and `effect-compiler-codegen.ts` already exist and are covered by unit tests. This ticket should build on them, not recreate them.
5. The current codegen path is closure-based TypeScript, not dynamic JavaScript source-string generation. Given the project’s maintainability goals, the orchestrator should preserve that architecture instead of introducing ad hoc string codegen.
6. Budget enforcement parity is not fully modeled in `CompiledEffectContext` today. This ticket can safely preserve interpreter fallback semantics and sequencing semantics, but full effect-operation budget parity remains a separate integration concern to address where compiled execution is actually wired into the runtime hot path.

## Architecture Check

1. The beneficial change here is not “compiled effects” in the abstract, because that direction has already been chosen. The real architectural choice is whether the missing orchestration should preserve the existing closure-based compiler stack or replace it with a second execution model. Preserving the current closure-based stack is cleaner, easier to verify, and more extensible than introducing string generation or duplicate runtime pipelines.
2. The orchestrator should stay pure over effect AST plus lifecycle metadata. It should not require a concrete `GameDefRuntime` instance to compile, because the fragments already defer runtime-dependent work to execution time through `CompiledEffectContext`.
3. Fallback is still the right robustness boundary for this ticket. Unsupported nodes must execute through the existing interpreter so the compiler remains an optimization layer rather than a second semantic source of truth.
4. Compiled-to-interpreted adaptation should be centralized in one shared helper. Duplicating partial `EffectContext` construction across codegen fragments and fallback paths would create a fragile parallel runtime model.
5. No backwards-compatibility aliasing belongs here. The ticket should target the current contracts and file structure directly, and any caller breakage should be fixed in the same change.

## What to Change

### 1. Create `effect-compiler-runtime.ts`

Add a small shared helper module that converts a `CompiledEffectContext` plus `(state, rng, bindings)` into a standard execution `EffectContext`.

Requirements:

- Export a helper used by both the orchestrator fallback path and any compiled fragment/runtime integration that needs interpreter-compatible context.
- Preserve existing `moveParams`, `traceContext`, `effectPath`, `decisionScope`, and `phaseTransitionBudget` propagation.
- Keep the helper narrow. It exists to avoid duplicated context assembly, not to invent a second runtime abstraction.

### 2. Create `effect-compiler.ts`

Add the missing orchestrator module with these responsibilities:

- `compileEffectSequence(phaseId, lifecycle, effects): CompiledEffectSequence`
- `composeFragments(fragments): CompiledEffectFn`
- `createFallbackFragment(effects): CompiledEffectFragment`
- `compileAllLifecycleEffects(def): ReadonlyMap<CompiledLifecycleEffectKey, CompiledEffectSequence>`

Detailed behavior:

- For each top-level effect, call `classifyEffect`.
- When classification succeeds, call `compilePatternDescriptor`.
- When classification fails, compile a fallback fragment that delegates that exact subtree to `applyEffects`.
- Compose fragments sequentially, threading `state`, `rng`, `bindings`, `decisionScope`, and accumulated `emittedEvents`.
- Short-circuit on `pendingChoice`, mirroring interpreter sequencing behavior.
- Compute `coverageRatio` from `computeCoverageRatio(effects)`.
- Bulk compilation must iterate `def.turnStructure.phases` and key entries with `makeCompiledLifecycleEffectKey(phase.id, lifecycle)`.
- Skip empty lifecycle arrays rather than storing inert entries.

### 3. Export the new compiler surface

Update the kernel barrel exports so the orchestrator and shared runtime helper are available to the next integration ticket and to focused unit tests.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-runtime.ts` (new)
- `packages/engine/src/kernel/effect-compiler.ts` (new)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify — consume shared runtime helper instead of private duplicated context assembly where appropriate)
- `packages/engine/src/kernel/index.ts` (modify — export new compiler surface)

## Out of Scope

- Populating `GameDefRuntime.compiledLifecycleEffects` in `createGameDefRuntime`
- Switching `dispatchLifecycleEvent` to the compiled path
- Debug dual-path verification mode
- Benchmarking or profiler integration
- Phase 2 effect-family support
- Retrofitting full effect-operation budget accounting into compiled execution before runtime integration exists

## Acceptance Criteria

### Tests That Must Pass

1. `compileEffectSequence` returns coverage `1` for a fully compilable sequence and produces the same `EffectResult` shape as `applyEffects` for that sequence.
2. `compileEffectSequence` returns fractional coverage for mixed sequences and executes unsupported top-level nodes via fallback without changing behavior.
3. `compileEffectSequence` returns coverage `0` for a fully unsupported sequence and still executes correctly through fallback.
4. `composeFragments` threads `state`, `rng`, `bindings`, `decisionScope`, and accumulated `emittedEvents` in interpreter order.
5. `composeFragments` short-circuits on `pendingChoice` and does not execute later fragments.
6. `compileAllLifecycleEffects` compiles every non-empty `onEnter` and `onExit` lifecycle on `turnStructure.phases` and skips empty lifecycles.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. **Single semantic source of truth**: Unsupported nodes still execute through the existing interpreter; compiled orchestration does not invent alternate semantics.
2. **Pure compilation boundary**: Building compiled sequences does not require mutating runtime state or precomputing game-specific execution data beyond lifecycle metadata.
3. **Sequencing parity**: Compiled sequence orchestration preserves interpreter ordering, pending-choice short-circuiting, and emitted-event accumulation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — verifies full-sequence orchestration, fallback behavior, lifecycle bulk compilation, and sequencing invariants that existing pattern/codegen unit tests do not cover.
2. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — update only if needed to consume the extracted shared runtime helper without regressing existing fragment semantics.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

Actual implementation matched the reassessed architecture rather than the original ticket wording:

- Added a pure closure-based orchestrator in `effect-compiler.ts` that composes the existing matcher/codegen primitives into full lifecycle sequences.
- Added `effect-compiler-runtime.ts` so compiled code and interpreter fallback share one execution-context adapter instead of duplicating context assembly.
- Batched consecutive unsupported top-level effects into shared interpreter fallback fragments rather than bouncing through fallback one node at a time.
- Added focused orchestrator tests covering full compilation, mixed fallback execution, full fallback execution, sequence composition, pending-choice short-circuiting, and lifecycle bulk compilation.

Deliberately not done in this ticket:

- Runtime population of `GameDefRuntime.compiledLifecycleEffects`
- `dispatchLifecycleEvent` integration
- Debug verification mode
- Full effect-operation budget parity for compiled execution
