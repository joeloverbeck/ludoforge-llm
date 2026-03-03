# SEATRES-065: Add AST guard against raw active-seat surface literals at emitters

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — source guard coverage for invariant emitter call contracts
**Deps**: archive/tickets/SEATRES/SEATRES-051-replace-function-name-surface-literals-with-stable-semantic-ids.md, archive/tickets/SEATRES/SEATRES-063-replace-function-derived-active-seat-surface-ids-with-domain-semantics.md

## Problem

Even with typed unions and a centralized registry, call sites can still inline raw valid string literals for active-seat surfaces and compile successfully. This weakens contract discipline and increases drift risk.

## Assumption Reassessment (2026-03-03)

1. Current emitter call sites in `turn-flow-eligibility.ts`, `legal-moves-turn-order.ts`, `phase-advance.ts`, and `effects-turn-flow.ts` already pass `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*`.
2. Existing structural guards are partial: `legal-moves.test.ts` already asserts `requireCardDrivenActiveSeat(...)` call shape (argument count + explicit `seatResolution`) for `legal-moves-turn-order.ts`, but it does not enforce the third argument as canonical surface constant access.
3. Existing source guards in `turn-flow-invariant-contract-source-guard.test.ts` only prevent literal string/message drift via text matching; they do not enforce AST-level `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` usage at emitter call sites.
4. Adding AST guards aligns with existing test-infra style and keeps enforcement static, fast, and game-agnostic.

## Architecture Reassessment

1. The proposed guard is beneficial over the current baseline because it turns convention into an enforceable contract at compile-time test boundaries.
2. AST-level argument-shape checks are cleaner than string includes because they are resilient to formatting changes while still precise about call contracts.
3. Scope remains engine-generic and invariant-focused; no GameSpecDoc/game-data coupling is introduced.
4. No compatibility aliasing/shims: this hardens direct canonical usage only.

## What to Change

### 1. Add guard coverage for active-seat emitters

1. Add AST guard assertions that each `requireCardDrivenActiveSeat(...)` call site in targeted modules passes `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` as the third argument.
2. Add AST guard assertions that `makeActiveSeatUnresolvableInvariantContext(...)` emitter call site(s) in effect runtime passes `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` as the first argument.

### 2. Keep guard scope explicit and maintainable

1. Cover the known emitter modules discovered in reassessment:
   - `src/kernel/turn-flow-eligibility.ts`
   - `src/kernel/legal-moves-turn-order.ts`
   - `src/kernel/phase-advance.ts`
   - `src/kernel/effects-turn-flow.ts`
2. Use AST node-shape checks (identifier + property access) rather than brittle text matching.
3. Keep existing lifecycle/seat-resolution architecture guards intact; extend them rather than duplicating framework logic.

## Files to Touch

- `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify; extend existing AST architecture guard)

## Out of Scope

- Renaming surface IDs
- Runtime contract payload/message format changes
- Game-specific GameSpecDoc/visual-config modifications

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat emitter call sites fail guard tests if raw surface string literals are introduced.
2. Guard tests pass when call sites use `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` property access.
3. Existing suites remain green:
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo test`
   - `pnpm turbo typecheck`
   - `pnpm turbo lint`

### Invariants

1. Active-seat surface IDs are consumed through canonical constants at emitters.
2. Guard policy remains engine-level and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` — add AST assertions for canonical surface-constant argument shape in `effects-turn-flow.ts` emitter invariant-context calls.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — extend existing AST architecture guard to enforce canonical surface-constant third arguments for `requireCardDrivenActiveSeat(...)` call sites in `legal-moves-turn-order.ts`.
3. `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` — add AST guard coverage for `requireCardDrivenActiveSeat(...)` in `turn-flow-eligibility.ts` and `phase-advance.ts`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome (2026-03-03)

- Added AST guard coverage enforcing canonical `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.*` usage at emitter boundaries.
- Extended `legal-moves` source-architecture guard so `requireCardDrivenActiveSeat(...)` in `legal-moves-turn-order.ts` must pass both explicit `seatResolution` and canonical surface-constant third argument.
- Extended `turn-flow-invariant-contract-source-guard` to cover:
  - `requireCardDrivenActiveSeat(...)` calls in `turn-flow-eligibility.ts` and `phase-advance.ts`.
  - `makeActiveSeatUnresolvableInvariantContext(...)` calls in `effects-turn-flow.ts`.
- Scope refinement vs original plan: documented that `legal-moves.test.ts` already had partial structural guarding (seat-resolution threading), and this ticket completed the missing canonical surface-constant enforcement.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
