# 81WHOSEQEFFCOM-007: Compile information effects (reveal, conceal)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Two information effects (tags 12, 13) fall back to the interpreter. `reveal` and `conceal` manage the hidden information system — which players can see which tokens/zones. They are used in Texas Hold'em (hole card reveal at showdown) and could be used in any game with hidden information.

## Assumption Reassessment (2026-03-25)

1. `reveal` (tag 12) and `conceal` (tag 13) are implemented in `effects-reveal.ts` (~220 lines).
2. They modify `state.reveals` — a map tracking what information is revealed to which players.
3. Both effects emit trace entries for the reveal/conceal actions.
4. These are leaf effects — no nested bodies, no control flow.
5. No Zobrist hash updates needed (reveals are not part of the hash — they're metadata about visibility, not game state values).

## Architecture Check

1. Both effects follow a similar pattern: resolve target (tokens/zones), resolve observer (player), update `state.reveals` map.
2. `conceal` is the inverse of `reveal` — removes entries from the reveals map.
3. Since `effects-reveal.ts` is only ~220 lines, the compiled closures can replicate the logic directly without excessive duplication.
4. Trace emission must match the interpreter's trace entries exactly.

## What to Change

### 1. Add pattern descriptors for reveal and conceal

In `effect-compiler-patterns.ts`:
- `RevealPattern`: target selector (tokens/zones), observer player selector, optional filter
- `ConcealPattern`: target selector, observer player selector, optional filter
- Add `matchReveal`, `matchConceal`
- Wire into `classifyEffect` switch for tags 12, 13

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileReveal(desc)` — resolve targets and observers, update `state.reveals`, trace emission
- `compileConceal(desc)` — resolve targets and observers, remove from `state.reveals`, trace emission
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- Token effects (ticket 005)
- Marker effects (ticket 003)
- Variable/binding effects (ticket 002)
- Turn flow effects (ticket 004)
- Iteration effects (ticket 006)
- Deleting `createFallbackFragment` (ticket 010)
- Modifying `effects-reveal.ts` internals
- Action-context effects

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileReveal` correctly updates `state.reveals` for specified targets and observers
2. Per-effect-type unit test: `compileConceal` correctly removes entries from `state.reveals`
3. Parity test: reveal compiled output matches interpreted output (all 7 verification dimensions)
4. Parity test: conceal compiled output matches interpreted output
5. Trace parity test: compiled reveal/conceal emit identical trace entries to interpreted path
6. Edge case tests: reveal to all players, conceal non-existent reveal, reveal already-revealed tokens
7. Existing suite: `pnpm turbo test`
8. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `state.reveals` mutations in compiled path are identical to interpreted path
2. No Zobrist hash updates needed for reveal/conceal (visibility metadata, not game state values)
3. Coverage ratio increases for sequences containing information effects
4. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for `compileReveal`, `compileConceal`
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for `matchReveal`, `matchConceal`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
