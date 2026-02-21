# CONCPAR-005: Conceal state update type-safety hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime (effects-reveal)
**Deps**: CONCPAR-001

## Problem

`applyConceal` currently rebuilds state via `Object.fromEntries(...filter(...))` with broad type assertions (`as Record<...>`, `as GameState`). This works, but weakens static guarantees in a core runtime path and makes future refactors easier to break silently.

## Assumption Reassessment (2026-02-21)

1. `applyConceal` removes zone grants correctly, but uses cast-heavy object reconstruction for both `reveals` and full `GameState` objects.
2. No functional bug was observed in tests, but this pattern is less robust than typed object operations for critical immutable updates.
3. This concern is not covered by CONCPAR-002 (compiler), CONCPAR-003 (selective runtime behavior), or CONCPAR-004 (trace emission).

## Architecture Check

1. Runtime state transitions should be strongly typed with minimal assertions, especially in kernel effect execution code.
2. This is purely engine-internal and game-agnostic; no game-specific behavior is introduced.
3. No backwards-compatibility shims are needed; behavior stays identical while implementation is hardened.

## What to Change

### 1. Replace cast-heavy object rebuilding in `applyConceal`

Use typed immutable update helpers or typed clone+delete flow so:
- removing `zoneId` from `reveals` does not require `as Record<string, readonly RevealGrant[]>`
- dropping `state.reveals` does not require `as GameState`

### 2. Add a tiny helper if needed

If duplication appears, introduce a small local helper in `effects-reveal.ts` for typed key removal (single responsibility, no generic utility dump).

## Files to Touch

- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify only if behavior assertions need tightening)

## Out of Scope

- Selective conceal semantics (`from`/`filter`) — CONCPAR-003
- Reveal/conceal trace emission — CONCPAR-004
- Compiler lowering changes — CONCPAR-002

## Acceptance Criteria

### Tests That Must Pass

1. Existing conceal behavior tests remain green (blanket removal, no-op, idempotence, unknown zone runtime failure).
2. No new lint/type errors from unsafe casts in this path.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `applyConceal` remains purely immutable and behavior-identical to current runtime semantics.
2. Core state update path avoids broad type assertions for `GameState` reconstruction.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — keep/adjust conceal behavior assertions only if needed to lock no-regression behavior during refactor.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects conceal"`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
