# 81WHOSEQEFFCOM-007: Compile information effects (reveal, conceal)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Two information effects (tags 12, 13) still fall back to the interpreter. `reveal` and `conceal` manage hidden-information grants at the zone level, with optional token filters controlling which tokens inside the zone become observable. They are used in Texas Hold'em (hole-card reveal at showdown) and are generic lifecycle effects that should participate in whole-sequence compilation.

## Assumption Reassessment (2026-03-25)

1. `reveal` (tag 12) and `conceal` (tag 13) are implemented in `packages/engine/src/kernel/effects-reveal.ts`.
2. They mutate `state.reveals`, keyed by zone id and storing `RevealGrant[]`.
3. They are leaf lifecycle effects with no nested bodies or control-flow semantics.
4. Trace entries are emitted only on real state changes. Duplicate `reveal` grants and zero-removal `conceal` operations are no-ops with no trace emission.
5. Reveal grants are part of hashed game state today. `computeFullHash`, incremental reveal-grant hashing, and `reconcileRunningHash` all account for `state.reveals`.

## Architecture Check

1. Both effects are zone-scoped, not token-targeted. Optional token filters narrow visibility within the selected zone.
2. `conceal` is the inverse of `reveal`: it removes matching grants from the zone's reveal list and may delete the zone entry entirely.
3. The clean architecture is to compile these effects through the existing shared delegate-wrapper pattern already used for other leaf handlers, not to duplicate `effects-reveal.ts` logic inside codegen. That preserves one source of truth for selector normalization, no-op semantics, trace emission, and hashed-state behavior.
4. Trace behavior, state shape, and hash-visible outcomes must remain bit-identical to the interpreted path.

## What to Change

### 1. Add pattern descriptors for reveal and conceal

In `effect-compiler-patterns.ts`:
- `RevealPattern`: zone selector, observer selector / `all`, optional filter
- `ConcealPattern`: zone selector, optional observer selector / `all`, optional filter
- Add `matchReveal`, `matchConceal`
- Wire into `classifyEffect` switch for tags 12, 13

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileReveal(desc)` — delegate through the shared compiled-delegate helper to `applyReveal`
- `compileConceal(desc)` — delegate through the shared compiled-delegate helper to `applyConceal`
- Do not reimplement reveal/conceal internals in codegen unless delegation proves impossible
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify if needed for coverage-ratio assertions)

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

1. Pattern test: `classifyEffect` returns `reveal` / `conceal` descriptors instead of `null`.
2. Per-effect parity test: compiled `reveal` matches interpreted `reveal`, including state, bindings, decision scope, emitted events, and hash-equivalent state.
3. Per-effect parity test: compiled `conceal` matches interpreted `conceal`.
4. Trace parity test: compiled `reveal` / `conceal` emit identical traces to the interpreted path, including no-op cases.
5. Coverage test: sequences containing `reveal` / `conceal` gain compiled coverage instead of falling back.
6. Edge-case tests: `reveal` to `all`, duplicate reveal no-op, `conceal` with reordered filter predicates, and `conceal` when nothing matches.
7. Existing suite: `pnpm turbo test`
8. Existing suite: `pnpm turbo typecheck`
9. Existing suite: `pnpm turbo lint`

### Invariants

1. `state.reveals` mutations in the compiled path are identical to the interpreted path.
2. Hash-visible state is preserved: compiled execution must yield the same recomputed hash as interpreted execution because reveal grants are part of the hashed state model.
3. Coverage ratio increases for sequences containing information effects.
4. Verification mode continues to pass for lifecycle sequences using `reveal` / `conceal`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add parity tests for compiled `reveal` / `conceal`, including trace and no-op behavior.
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add matcher/classifier tests for `matchReveal`, `matchConceal`.
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Update coverage assertions so `reveal` / `conceal` count as compiled lifecycle effects when present.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-25
- What actually changed:
  - Reassessed the ticket assumptions before implementation and corrected the scope to reflect current engine reality: `reveal` / `conceal` are zone-scoped leaf effects, trace only on real state changes, and reveal grants are part of hashed state.
  - Added `RevealPattern` / `ConcealPattern`, wired both tags into `classifyEffect`, and routed compiled execution through the shared delegate-wrapper architecture to `applyReveal` / `applyConceal`.
  - Added parity and coverage tests proving compiled behavior matches the interpreter, including no-op and canonicalized-filter cases.
- Deviations from original plan:
  - Did not duplicate `effects-reveal.ts` logic inside codegen. The implementation uses the existing delegate-wrapper path because it is the cleaner, more robust, and more extensible architecture for leaf handlers whose semantics already live in kernel effect modules.
  - Expanded the ticket corrections to explicitly account for hashed reveal grants and sequence coverage behavior.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
