# TURNFLOWDEFER-001: Generic Deferred Event Effect + Free-Grant Lifecycle Hardening

**Status**: NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — turn-flow and event scheduling contracts
**Deps**: `specs/29-fitl-event-card-encoding.md`, `specs/30-fitl-non-player-ai.md`

## Problem

Current `effectTiming: afterGrants` behavior depends on free-operation grant consumption details. This creates fragile coupling and encourages event-specific workaround flags to guarantee intended timing. We need a generic lifecycle model that is deterministic, testable, and reusable across games.

## Assumption Reassessment (2026-02-27)

1. Assumption checked: deferred event effects + grant batches form a robust generic abstraction for all event cards.
2. Current code check: deferred release keys off batch consumption state; event intent can be undermined by seat ordering and grant lifecycle edge cases.
3. Mismatch: abstraction exists but lifecycle semantics are under-specified. Scope correction: formalize expiry/release semantics and encode them directly in generic turn-flow contracts.

## Architecture Check

1. Cleaner than proliferating game-specific flags (`fitl_*Window`) because timing intent should be first-class in generic event/turn-flow schema.
2. Preserves boundary: timing and lifecycle are engine concerns; per-card content remains in GameSpecDoc with declarative options only.
3. No backwards-compatibility path: migrate to a stricter single model rather than carrying legacy behavior modes.

## What to Change

### 1. Extend event/free-grant schema with lifecycle controls

Introduce explicit lifecycle semantics for grants/deferred effects (for example: expiry boundary and release policy) in generic schema/types.

### 2. Update turn-flow release logic

Refactor deferred release and grant consumption to enforce new semantics deterministically at card boundaries.

### 3. Migrate existing FITL usages

Update event data that depends on implicit current behavior to explicit lifecycle fields and remove ad hoc guard behavior where possible.

### 4. Strengthen cross-game regression tests

Add generic integration tests covering:
- grants fully consumed,
- grants partially consumed then boundary reached,
- no-grant afterGrants immediate release behavior.

## Files to Touch

- `packages/engine/src/kernel/types-*.ts` (modify)
- `packages/engine/src/kernel/schemas-*.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-*.test.ts` (modify as needed)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify as needed)

## Out of Scope

- Non-turn-flow runner UX features.
- Reworking unrelated operation pipelines.

## Acceptance Criteria

### Tests That Must Pass

1. New generic lifecycle tests cover all deferred/grant boundary scenarios and pass.
2. FITL event suites pass without relying on hidden turn-order state mutation in tests.
3. Existing suite: `pnpm turbo test`

### Invariants

1. GameDef/runtime remains game-agnostic; no card-id conditionals in kernel.
2. Event timing semantics are explicit and deterministic across supported games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — expanded lifecycle matrix.
2. `packages/engine/test/integration/fitl-events-aces.test.ts` — aligned with explicit lifecycle semantics.
3. Additional generic turn-flow tests under `packages/engine/test/unit/` for lifecycle boundary logic.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/event-effect-timing.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

**Not implemented**: 2026-02-27

**Reason**: Code review found the existing lifecycle semantics are already well-defined and comprehensively tested (YAGNI). The current `splitReadyDeferredEventEffects` mechanism has clear release semantics:
- Queued when `effectTiming: 'afterGrants'` and grants exist
- Released when all `requiredGrantBatchIds` are consumed
- Immediate release when no grants are present

The `event-effect-timing.test.ts` suite covers: afterGrants with grant, beforeGrants, afterGrants with no grant, batch grants (multiple required), branch overrides, multi-deferred ordering, and same-seat grants. Adding expiry boundaries and release policies would be premature abstraction with no demonstrated need.
