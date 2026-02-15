# GAMEDEFGEN-002: Explicit Action Executor Semantics (Decouple Actor From Active Player)

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Complexity**: L  
**Depends on**: GAMEDEFGEN-001

## 0) Reassessed current-state assumptions

- Actions currently expose `actor` only; there is no action-level `executor` contract in `GameDef`/CNL.
- `legalMoves` gates decision authority via `action.actor` against `state.activePlayer`.
- `legalChoices` and `applyMove` execute with an implicit execution player:
  - default: `state.activePlayer`
  - free-operation override: `executeAsFaction` from pending turn-flow grants.
- This means cross-faction execution exists only for turn-flow free operations; regular actions cannot declare their own executor semantics.
- Existing tests cover actor gating and free-operation `executeAsFaction`, but there is no dedicated action-level executor test surface.

Scope correction:
- Introduce a required action-level `executor` selector in shared schema/compiler/runtime.
- Keep `actor` as decision authority (who can initiate the move) and use `executor` as execution authority (who is bound to `actor`/`active` selectors inside effects/queries/conditions).
- Ensure legality/evaluation/execution paths consistently resolve executor from action definition (with free-operation grant overrides remaining higher-priority where explicitly configured).
- Defer richer executor sources (`eventOwner`, late decision-derived binding executors) to a follow-up ticket; this ticket ships deterministic core semantics first.

## 1) What needs to change / be implemented

Define explicit executor/decision authority for actions so specs can model effects that are executed by a faction other than the currently active faction.

- Extend action model with explicit required `executor` strategy (initial scope: selectors that resolve to exactly one faction/player deterministically).
- Ensure legal move generation and apply path use executor consistently for:
  - condition evaluation
  - query filtering
  - move decision resolution context
  - trigger context.
- Keep semantics generic in shared schema/kernel, not per game.
- Remove ambiguous dependence on current active player for action execution when action defines executor.

## 2) Invariants that should pass

- Executor identity is deterministic and explicit for every action resolution.
- Action legality and effect evaluation are consistent between `legalMoves`, `legalChoices`, and `applyMove`.
- No game-specific executor special-casing in kernel.
- Invalid executor configurations surface compile/validation diagnostics.

## 3) Tests that should pass

### New tests
- `test/unit/action-executor-semantics.test.ts`
  - non-active executor legality and execution behavior.
- `test/unit/kernel/legal-choices-executor.test.ts`
  - decision requests reflect executor context.
- `test/integration/executor-cross-faction-action.test.ts`
  - action executed by non-active faction modifies only expected faction state.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added required action-level `executor` contract across CNL doc types, validation keys, compiler lowering, kernel core types, and runtime schemas.
  - Added compile-time executor normalization with deterministic single-player constraints (rejects `all`, `allOther`, and binding-derived executor selectors in this phase).
  - Added shared runtime executor resolution and applied it consistently in `legalMoves`, `legalChoices`, and `applyMove` (with free-operation execution overrides retained as explicit higher-priority behavior).
  - Added executor semantics coverage:
    - `test/unit/action-executor-semantics.test.ts`
    - `test/unit/kernel/legal-choices-executor.test.ts`
    - `test/integration/executor-cross-faction-action.test.ts`
  - Migrated existing action fixtures/tests/schemas/golden artifacts to the new required `executor` field.
- Deviations from original draft:
  - Deferred `eventOwner` and late decision-binding executor sources to follow-up work; this ticket implements deterministic core executor selectors first.
- Verification:
  - `npm run build` passed
  - `npm run lint` passed
  - `npm test` passed
