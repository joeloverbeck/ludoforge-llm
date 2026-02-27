# GAMEDEFGEN-030: Choice Decision-Owner Overrides for Event/Effect Choices

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel choice request/runtime, CNL lowering, legality/decision APIs
**Deps**: specs/50-event-interactive-choice-protocol.md

## Problem

Some event effects require a faction other than the acting seat to decide choice bindings (for example FITL card text/playbook constraints). Current choice effects (`chooseOne`/`chooseN`) do not encode decision ownership, forcing fragile workarounds and reducing rules fidelity.

## Assumption Reassessment (2026-02-27)

1. Current choice pending requests do not include chooser/owner metadata; ownership is implicitly tied to the active move pipeline.
2. Existing CNL and AST for choice effects do not accept a chooser selector field.
3. Mismatch: game rules can require cross-faction decision authority; corrected scope is to add an explicit, game-agnostic choice-owner contract rather than card-specific hacks.

## Architecture Check

1. A first-class chooser contract on choice effects is cleaner than mutating `activePlayer` as a side effect in game data.
2. This preserves boundaries: GameSpecDoc declares which seat chooses; GameDef/runtime enforce it generically without FITL-specific branching.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Extend choice AST/contracts

Add optional chooser selector on `chooseOne` and `chooseN` (for example `chooser: PlayerSel`), and thread it through validation/schema/typing.

### 2. Enforce chooser ownership at decision surfaces

Include chooser seat metadata in pending choice requests and enforce move-param resolution semantics against chooser ownership in legality/decision APIs.

### 3. Add integration coverage

Add tests proving cross-seat decision ownership for event effects without changing action actor/executor semantics.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/` (modify/add targeted integration tests)

## Out of Scope

- UI presentation changes in runner.
- Any game-specific behavior branches in kernel/runtime.

## Acceptance Criteria

### Tests That Must Pass

1. Choice effect may declare a chooser different from actor/active and compile successfully.
2. Pending choice requests expose chooser seat and legality honors chooser ownership.
3. Existing suite: `npm run test`

### Invariants

1. GameDef/runtime remain game-agnostic; no FITL-only conditions added.
2. Choice ownership semantics are deterministic and explicit in AST/runtime contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — chooser field lowering/validation.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — chooser ownership semantics.
3. `packages/engine/test/integration/fitl-events-*.test.ts` — card-level cross-seat chooser fidelity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/unit/**/*.test.js"`
2. `npm run test`
