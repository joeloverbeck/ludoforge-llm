# 81WHOSEQEFFCOM-004: Compile turn flow effects (setActivePlayer, advancePhase, popInterruptPhase)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Three turn flow effects (tags 2, 24, 26) fall back to the interpreter. `setActivePlayer` is simple but frequent. `advancePhase` and `popInterruptPhase` are medium complexity — they manipulate phase state and may trigger lifecycle dispatch. These are used in every game's turn structure.

## Assumption Reassessment (2026-03-25)

1. `setActivePlayer` (tag 2): Updates `state.activePlayer`. Requires Zobrist hash update. Implemented in `effects-turn-flow.ts`.
2. `advancePhase` (tag 24): Wrapper around phase advancement logic — involves updating `state.currentPhase`, potentially cycling through phase order. Implemented in `effects-turn-flow.ts`.
3. `popInterruptPhase` (tag 26): Pops from `state.interruptPhaseStack`, triggers lifecycle dispatch for the resumed phase, resets usage counters. Implemented in `effects-turn-flow.ts`.
4. `gotoPhaseExact` (tag 23) is already compiled — serves as the pattern template for phase transition effects.
5. `pushInterruptPhase` (tag 25) is deferred to ticket 008 (Phase 5) due to its interaction with interrupt stack state manipulation.

## Architecture Check

1. `setActivePlayer` is a pure leaf effect — update one field + Zobrist hash. Mirrors `setVar` pattern closely.
2. `advancePhase` wraps existing `applyAdvancePhase` logic. The compiled closure may delegate to the existing runtime helper if the logic is complex, or inline it if simple enough. The key is eliminating the interpreter dispatch overhead.
3. `popInterruptPhase` has moderate complexity (stack manipulation, lifecycle dispatch, usage reset). The compiled closure should delegate to the existing `applyPopInterruptPhase` helper to avoid duplicating complex logic, wrapping it in the compiled fragment contract.
4. For `advancePhase` and `popInterruptPhase`, if the interpreter helper already returns an `EffectResult`-compatible shape, the compiled closure can wrap it directly. If not, adapter logic is needed.
5. If this ticket adds a second or third delegate-style compiled leaf wrapper after marker effects, extract a shared helper in `effect-compiler-codegen.ts` for "compiled leaf effect delegates to existing handler while preserving bindings / tracker / decision scope". Do not keep copy-pasting that adapter shape across tickets.

## What to Change

### 1. Add pattern descriptors for all 3 turn flow effects

In `effect-compiler-patterns.ts`:
- `SetActivePlayerPattern`: player selector expression
- `AdvancePhasePattern`: phase advancement parameters
- `PopInterruptPhasePattern`: (minimal parameters — pops from stack)
- Add `matchSetActivePlayer`, `matchAdvancePhase`, `matchPopInterruptPhase`
- Wire into `classifyEffect` switch cases for tags 2, 24, 26

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileSetActivePlayer(desc)` — resolve player, update `state.activePlayer`, Zobrist hash update
- `compileAdvancePhase(desc)` — delegate to existing `applyAdvancePhase` logic wrapped in compiled fragment contract
- `compilePopInterruptPhase(desc)` — delegate to existing `applyPopInterruptPhase` logic wrapped in compiled fragment contract
- If delegate-style wrappers now repeat the marker-effect bridge structure, extract the common adapter helper as part of this ticket rather than adding another bespoke wrapper pattern
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- `pushInterruptPhase` (tag 25) — deferred to ticket 008
- `gotoPhaseExact` — already compiled
- Token effects (ticket 005)
- Marker effects (ticket 003)
- Variable/binding effects (ticket 002)
- Deleting `createFallbackFragment` (ticket 010)
- Refactoring existing `applyAdvancePhase` or `applyPopInterruptPhase` internals

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileSetActivePlayer` updates active player and Zobrist hash correctly
2. Per-effect-type unit test: `compileAdvancePhase` produces correct next-phase state matching interpreted output
3. Per-effect-type unit test: `compilePopInterruptPhase` correctly pops stack and resets usage
4. Parity test: each turn flow effect compiled output matches interpreted output (all 7 verification dimensions)
5. Zobrist hash parity: `setActivePlayer` compiled mutation produces identical Zobrist hash to interpreted path
6. Edge case test: `popInterruptPhase` on empty stack behaves identically to interpreter
7. Existing suite: `pnpm turbo test`
8. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `setActivePlayer` Zobrist hash updates match interpreted path exactly
2. `advancePhase` lifecycle dispatch behavior is identical to interpreted path
3. `popInterruptPhase` stack manipulation and usage reset match interpreted path
4. Coverage ratio increases for sequences containing turn flow effects
5. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for all 3 compiled turn flow effect generators
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for all 3 turn flow match functions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
