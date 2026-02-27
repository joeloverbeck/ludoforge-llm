# GAMEDEFGEN-030: Choice Decision-Owner Overrides for Event/Effect Choices

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel choice request/runtime, CNL lowering, effect context, legality/decision APIs
**Deps**: archive/specs/50-event-interactive-choice-protocol.md

## Problem

Some event effects require a faction other than the acting seat to decide choice bindings (for example FITL card text/playbook constraints). Current choice effects (`chooseOne`/`chooseN`) do not encode decision ownership, forcing fragile workarounds and reducing rules fidelity.

## Assumption Reassessment (2026-02-27)

1. Current choice pending requests do not include chooser/owner metadata.
2. Existing CNL and AST for choice effects do not accept a chooser selector field.
3. Current ownership is effectively implied by effect execution context (`activePlayer`/executor), not by explicit choice contract.
4. Enforcement gap: legality/apply decision surfaces currently have no explicit decision-seat input for in-progress choice ownership checks. Corrected scope must add a decision-seat input to decision surfaces instead of only adding passive metadata.
5. Mismatch: game rules can require cross-faction decision authority; corrected scope is to add an explicit, game-agnostic choice-owner contract rather than card-specific hacks.

## Architecture Check

1. A first-class chooser contract on choice effects is cleaner than mutating action/execution player context as a side effect in game data.
2. This preserves boundaries: GameSpecDoc declares which seat chooses; GameDef/runtime enforce it generically without FITL-specific branching.
3. Decision ownership enforcement should be explicit at legality/apply call sites via a decision-seat input, not inferred from unrelated actor/executor contracts.
4. No per-game branches, aliases, or compatibility shims.

## What to Change

### 1. Extend choice AST/contracts

Add optional chooser selector on `chooseOne` and `chooseN` (for example `chooser: PlayerSel`), and thread it through validation/schema/typing.

### 2. Enforce chooser ownership at decision surfaces

Include chooser seat metadata in pending choice requests and enforce move-param resolution semantics against chooser ownership in legality/decision APIs.
Decision APIs must accept explicit decision-seat input so enforcement is real (not metadata-only).

### 3. Add integration coverage

Add tests proving cross-seat decision ownership for event effects without changing action actor/executor semantics.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)
- `packages/engine/test/integration/` (modify/add targeted integration tests if required by semantics)

## Out of Scope

- UI presentation changes in runner.
- Any game-specific behavior branches in kernel/runtime.

## Acceptance Criteria

### Tests That Must Pass

1. Choice effect may declare a chooser different from actor/active and compile successfully.
2. Pending choice requests expose chooser seat and legality/apply surfaces honor chooser ownership when provided decision-seat context does not match.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. GameDef/runtime remain game-agnostic; no FITL-only conditions added.
2. Choice ownership semantics are deterministic and explicit in AST/runtime contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — chooser field lowering/validation.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — chooser ownership semantics.
3. `packages/engine/test/unit/apply-move.test.ts` — chooser ownership enforcement during move validation/execution.
4. `packages/engine/test/integration/fitl-events-*.test.ts` — card-level cross-seat chooser fidelity (if impacted by this change).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Actually Changed**:
  - Added optional `chooser: PlayerSel` to `chooseOne`/`chooseN` AST + schemas + CNL lowering.
  - Added optional decision-seat context (`decisionPlayer`) to effect runtime and decision surfaces.
  - Added chooser ownership metadata on pending choice requests when chooser is explicitly declared.
  - Enforced chooser ownership in choice runtime validation for provided move params.
  - Threaded explicit decision-seat input through `legalChoices`, `move-decision-sequence`, and `applyMove` execution options.
  - Added unit tests for compile lowering, legal choices ownership behavior, and applyMove ownership enforcement.
- **Deviations From Original Plan**:
  - Enforcement required explicit decision-seat API threading; metadata-only scope was insufficient for robust ownership guarantees.
  - Full engine test run required regenerating schema artifacts (`GameDef`, `Trace`, `EvalReport`) before tests could execute.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `node --test packages/engine/dist/test/unit/apply-move.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`306/306`).
  - `pnpm -F @ludoforge/engine lint` passed.
