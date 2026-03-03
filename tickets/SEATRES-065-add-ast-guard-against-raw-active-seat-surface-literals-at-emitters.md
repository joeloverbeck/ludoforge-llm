# SEATRES-065: Add AST guard against raw active-seat surface literals at emitters

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — source guard coverage for invariant emitter call contracts
**Deps**: archive/tickets/SEATRES/SEATRES-051-replace-function-name-surface-literals-with-stable-semantic-ids.md, tickets/SEATRES-063-replace-function-derived-active-seat-surface-ids-with-domain-semantics.md

## Problem

Even with typed unions and a centralized registry, call sites can still inline raw valid string literals for active-seat surfaces and compile successfully. This weakens contract discipline and increases drift risk.

## Assumption Reassessment (2026-03-03)

1. Current emitter call sites use `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*`, but there is no structural test that requires this pattern.
2. Existing source guards prevent some literal invariant/message drift but do not enforce constant-based surface argument usage for active-seat emitters.
3. Adding a structural AST guard fits existing test-infra style (AST/source guard tests already used for kernel contracts).

## Architecture Check

1. Enforcing constant-based call sites is cleaner and more robust than relying on convention or manual code review.
2. This is pure engine contract hardening and does not add game-specific behavior to agnostic runtime/kernel layers.
3. No compatibility aliasing/shims: guard enforces canonical usage directly.

## What to Change

### 1. Add guard coverage for active-seat emitters

1. Add AST guard assertions that each `requireCardDrivenActiveSeat(...)` call site in targeted modules passes a `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` property access (not string literal).
2. Add a guard for `makeActiveSeatUnresolvableInvariantContext(...)` call site(s) in effect runtime to enforce constant-based surface IDs.

### 2. Keep guard scope explicit and maintainable

1. Target the known emitter modules (`turn-flow-eligibility.ts`, `legal-moves-turn-order.ts`, `phase-advance.ts`, `effects-turn-flow.ts`, and any other direct emitter file discovered during reassessment).
2. Use structural checks (AST node shape) rather than brittle text matching where possible.

## Files to Touch

- `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify only if existing AST guard placement is preferred there)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify only if helper-level guard extension is needed)

## Out of Scope

- Renaming surface IDs
- Runtime contract payload format changes
- Any game-specific GameSpecDoc/visual-config modifications

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat emitter call sites fail guard tests if raw surface string literals are introduced.
2. Guard tests pass when call sites use `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat surface IDs are consumed through canonical constants at emitters.
2. Guard policy remains engine-level and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` — add AST assertions for constant-based `surface` arguments at emitter call sites.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — extend existing AST guard section if that file remains the canonical location for call-site shape assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
