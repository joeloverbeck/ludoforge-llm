# 81WHOSEQEFFCOM-005: Compile token effects (moveToken, moveAll, moveTokenAdjacent, createToken, destroyToken, setTokenProp, draw, shuffle)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `effect-compiler-patterns.ts`, `effect-compiler-codegen.ts`, token-effect compiler tests
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Eight token effects (tags 4-11) still fall back to the interpreter, which keeps token-heavy lifecycle sequences below full compilation coverage. This matters because token movement and token creation/destruction dominate real workloads in FITL and also cover core card movement flows in Texas Hold'em.

The original ticket version assumed these effects should be reimplemented directly inside codegen. After reassessment against the current compiler/runtime architecture, that is not the preferred design.

## Assumption Reassessment (2026-03-25)

1. Token effect semantics live in `packages/engine/src/kernel/effects-token.ts`, which is the authoritative runtime implementation for these eight tags.
2. The current compiled path already has a shared delegate mechanism in `effect-compiler-codegen.ts` via `executeCompiledDelegate(...)`. Marker, transfer, and turn-flow compiled fragments already use this pattern successfully.
3. Token effects are not simple leaf mutations. They encapsulate token-state-index handling, DraftTracker-aware zone mutation, zone-entry resets, stacking checks, trace emission, adjacency checks, optional filter evaluation, deck reshuffle behavior, and RNG consumption.
4. `invalidateTokenStateIndex(state)` is required after mutable draft-path zone mutations because the `WeakMap<GameState, ...>` cache is keyed by state object identity. Immutable-path token effects do not need explicit invalidation because they return a fresh `GameState`.
5. `writeZoneMutations(...)` in `effects-token.ts` already centralizes the mutable-path `ensureZoneCloned(...)` and index invalidation behavior for several token effects. `createToken` and `draw` also contain additional specialized mutable-path logic.
6. `moveTokenAdjacent` is implemented as a runtime composition over `applyMoveToken(...)`, with adjacency validation performed before delegating to a synthetic `moveToken` effect.
7. For this ticket, the cleanest architecture is to compile these token effects as payload-carrying pattern descriptors whose codegen fragments delegate to the existing runtime handlers through the compiled fragment contract. Duplicating token semantics in codegen would create a second source of truth for one of the most stateful parts of the engine.

## Architecture Check

1. Compiling token effects is still beneficial. Even with delegate-based closures, lifecycle sequences stop going through `createFallbackFragment(...)` and the interpreter batch re-entry path for tags 4-11.
2. Delegate-based compiled token fragments are more beneficial than today’s architecture because they increase coverage without forking token semantics across two implementations.
3. Fully inlining token semantics into `effect-compiler-codegen.ts` is not more beneficial than the current architecture. It would duplicate mature runtime logic, increase divergence risk, and make future token-rule changes harder to maintain.
4. The ideal long-term architecture, if token performance still becomes a bottleneck after full lifecycle coverage is achieved, is a shared token-runtime helper layer used by both interpreted handlers and compiled closures. That refactor is explicitly out of scope for this ticket unless the delegate path exposes a concrete structural blocker.

## What to Change

### 1. Add token pattern descriptors for tags 4-11

In `packages/engine/src/kernel/effect-compiler-patterns.ts`:
- add payload-carrying descriptor types for:
  - `moveToken`
  - `moveAll`
  - `moveTokenAdjacent`
  - `draw`
  - `shuffle`
  - `createToken`
  - `destroyToken`
  - `setTokenProp`
- add `match*` functions for each token effect that preserve the existing payload without prematurely narrowing semantics
- wire these matchers into `classifyEffect(...)` for `EFFECT_KIND_TAG` 4-11
- update coverage tests so token-only sequences count as compiled instead of fallback

### 2. Compile token descriptors via shared delegate wrappers

In `packages/engine/src/kernel/effect-compiler-codegen.ts`:
- add compiled fragment generators for the 8 token descriptors
- each generator should call the corresponding `apply*` runtime handler from `effects-token.ts` through the existing compiled delegate architecture
- reuse the existing shared delegate helper pattern instead of introducing eight bespoke env/cursor adapter implementations
- wire the new token descriptor kinds into `compilePatternDescriptor(...)`

### 3. Prove the real invariants with tests

Update/add tests to prove:
- token tags 4-11 are now classified as compilable
- `compilePatternDescriptor(...)` returns fragments for all token descriptor kinds
- compiled token fragments match interpreted behavior for state, RNG, emitted events, bindings, decision scope, and state hash
- mutable draft/tracker execution stays parity-correct for representative token mutations
- token-only sequences now compile without fallback and report full coverage

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts`
- `packages/engine/src/kernel/effect-compiler-codegen.ts`
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts`
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts`
- `packages/engine/test/unit/kernel/effect-compiler.test.ts`

## Out of Scope

- Rewriting token semantics out of `effects-token.ts`
- Refactoring `effects-token.ts` into a new shared helper layer unless a blocker is found
- Variable effects (ticket 002)
- Marker effects (ticket 003)
- Turn flow effects (ticket 004)
- `forEach` / `reduce` / `removeByPriority` (ticket 006)
- Information effects (ticket 007)
- Complex control flow or lifecycle choice effects (tickets 008-009)
- Deleting `createFallbackFragment` (ticket 010)
- Action-context effects

## Acceptance Criteria

### Tests That Must Pass

1. `classifyEffect(...)` returns non-null descriptors for all 8 token tags
2. `compilePatternDescriptor(...)` returns fragments for all 8 token descriptors
3. Per-effect parity tests confirm compiled vs interpreted equivalence for all 8 token effects
4. Draft-path parity tests confirm representative token mutations still behave identically with `ctx.tracker`
5. A token-only compiled sequence reports `coverageRatio === 1` and matches interpreter behavior
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Existing suite: `pnpm turbo typecheck`
8. Existing suite: `pnpm turbo lint`

### Invariants

1. Token runtime semantics remain single-sourced in `effects-token.ts`
2. Mutable-path token mutations still invalidate the token-state index exactly where the runtime handlers already require it
3. Immutable-path token mutations continue to rely on fresh-state identity instead of manual invalidation
4. DraftTracker-aware zone mutation behavior remains unchanged
5. RNG-consuming token effects (`moveToken` with random position, `draw` random draws/reshuffle, `shuffle`) remain parity-correct
6. Coverage ratio increases for token-only lifecycle sequences without introducing alias paths or compatibility shims

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — classify token tags 4-11 as compiled descriptors
2. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — compiled/interpreted parity for each token effect, plus representative draft-path parity
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — token-only sequence coverage/parity without fallback

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - added token-effect pattern descriptors and `classifyEffect(...)` coverage for tags 4-11
  - compiled token effects through shared delegate fragments that call the existing `effects-token.ts` handlers
  - extended compiler matcher/codegen/orchestrator tests to cover token classification, parity, draft-path parity, and token-only sequence coverage
- Deviations from original plan:
  - did not inline token semantics into `effect-compiler-codegen.ts`
  - kept token runtime behavior single-sourced in `effects-token.ts`, using the existing compiled delegate architecture instead
  - corrected the stale assumption that immutable-path token mutations require explicit `invalidateTokenStateIndex(...)`
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
