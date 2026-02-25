# FITLGOLT4-005: Validate Deferred Event Effect Actor Identity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — apply-move deferred execution runtime validation
**Deps**: archive/tickets/FITLGOLT4-002.md

## Problem

Deferred event effects currently store `actorPlayer` as a raw number and later cast it to a player id during execution. There is no explicit runtime validation that this actor id is within `[0, playerCount)`. This weakens runtime contract safety for replay/imported state and can cause deferred effects to execute with an invalid actor context.

## Assumption Reassessment (2026-02-25)

1. Deferred payload shape stores `actorPlayer: number` in runtime state (`types-turn-flow.ts`) and schema (`schemas-extensions.ts`) with only `min(0)` bounds.
2. Deferred execution in `apply-move.ts` currently uses `asPlayerId(deferredEventEffect.actorPlayer)` directly without range validation against `state.playerCount`.
3. Existing FITLGOLT4 tickets do not cover this validation hardening.  
   - FITLGOLT4-003 is data encoding only.  
   - FITLGOLT4-004 is golden E2E turn extension only.

## Architecture Check

1. Explicit runtime validation is cleaner than trusting raw persisted state and prevents invalid actor execution paths.
2. This remains engine-agnostic contract enforcement and introduces no game-specific logic.
3. No backwards-compatibility alias/shim is introduced; invalid states should fail fast.

## What to Change

### 1. Add deferred actor range validation before execution

In deferred execution path (`applyReleasedDeferredEventEffects`), validate `actorPlayer` is a safe integer and `0 <= actorPlayer < state.playerCount`. Throw a kernel runtime error when invalid.

### 2. Keep deferred payload contract explicit

Keep payload as numeric actor id but enforce strict validation at use site (and optionally centralize in a helper used by any future deferred execution path).

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)

## Out of Scope

- Changing `effectTiming` semantics
- Event data encoding changes (FITLGOLT4-003)
- Turn-4 golden scenario expansion (FITLGOLT4-004)

## Acceptance Criteria

### Tests That Must Pass

1. New test: deferred effect execution throws deterministic runtime error when `actorPlayer` is out of range.
2. Existing deferred timing behavior tests still pass.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Deferred effects never execute under invalid actor identity.
2. Validation remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — add malformed-state test for deferred actor id bounds.
2. `packages/engine/test/integration/event-effect-timing.test.ts` — keep regression coverage for valid deferred execution paths.

### Commands

1. `pnpm turbo build --filter @ludoforge/engine`
2. `node --test "packages/engine/dist/test/unit/apply-move.test.js" "packages/engine/dist/test/integration/event-effect-timing.test.js"`
3. `pnpm -F @ludoforge/engine test`
