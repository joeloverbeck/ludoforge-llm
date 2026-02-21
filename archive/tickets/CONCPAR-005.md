# CONCPAR-005: Conceal state update type-safety hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime (effects-reveal)
**Deps**: Archived predecessors complete (`archive/tickets/CONCPAR-001.md` .. `archive/tickets/CONCPAR-004.md`)

## Problem

`applyConceal` currently rebuilds state via `Object.fromEntries(...filter(...))` with broad type assertions (`as Record<...>`, `as GameState`). This works, but weakens static guarantees in a core runtime path and makes future refactors easier to break silently.

## Assumption Reassessment (2026-02-21)

1. `applyConceal` removes grants correctly but still contains cast-heavy reconstruction in one branch:
   - `const remainingReveals = { ...existingReveals } as Record<string, readonly RevealGrant[]>`
   - `Object.fromEntries(...filter(...)) as GameState` when dropping `reveals`
2. Runtime behavior is already broadly covered by existing tests:
   - blanket conceal, no-op, idempotence, unknown-zone runtime failure
   - selective conceal (`from`, `filter`, and combined semantics)
   - conceal trace emission and no-op trace behavior
3. The remaining gap is architectural type-safety in a core immutable state transition path, not behavioral correctness.

## Architecture Check

1. Runtime state transitions should be strongly typed with minimal assertions, especially in kernel effect execution code.
2. This is purely engine-internal and game-agnostic; no game-specific behavior is introduced.
3. No backwards-compatibility shims are needed; behavior stays identical while implementation is hardened.

## What to Change

### 1. Replace cast-heavy object rebuilding in `applyConceal`

Use typed immutable update flow so:
- dropping `state.reveals` does not require `Object.fromEntries(... ) as GameState`
- broad `as GameState` reconstruction casts are removed from this path

### 2. Helper policy

Do not add new generic helpers unless duplication appears. Prefer local destructuring/key-omission flow first.

## Files to Touch

- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify to strengthen invariants if needed)

## Out of Scope

- Selective conceal semantics (`from`/`filter`) — already implemented in `archive/tickets/CONCPAR-003.md`
- Reveal/conceal trace emission — already implemented in `archive/tickets/CONCPAR-004.md`
- Compiler lowering changes — already implemented in `archive/tickets/CONCPAR-002.md`

## Acceptance Criteria

### Tests That Must Pass

1. Existing conceal behavior remains green (blanket removal, no-op, selective matching, idempotence, unknown-zone runtime failure, trace behavior).
2. `applyConceal` no longer uses broad `Object.fromEntries(... ) as GameState` reconstruction.
3. No new lint/type errors in kernel runtime paths.
4. Required suites pass: `pnpm -F @ludoforge/engine test`, `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test`.

### Invariants

1. `applyConceal` remains purely immutable and behavior-identical to current runtime semantics.
2. Core state update path avoids broad type assertions for full `GameState` reconstruction.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — add/adjust conceal assertions only to lock immutability and no-regression behavior during refactor.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects conceal"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-21
- **What changed**:
  - Refactored `applyConceal` state update flow in `packages/engine/src/kernel/effects-reveal.ts` to remove broad full-state reconstruction casts.
  - Kept conceal behavior unchanged while preserving immutable updates.
  - Added an immutability regression test in `packages/engine/test/unit/effects-reveal.test.ts` for the branch that removes the final reveal grant and drops the `reveals` key.
- **Deviation from original plan**:
  - Removed the `Object.fromEntries(... ) as GameState` reconstruction path directly without introducing a new helper; this stayed within the ticket helper policy and kept the change smaller.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects conceal"` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.
