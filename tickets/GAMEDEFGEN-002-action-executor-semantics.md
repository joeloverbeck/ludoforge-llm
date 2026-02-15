# GAMEDEFGEN-002: Explicit Action Executor Semantics (Decouple Actor From Active Player)

**Status**: Draft  
**Priority**: P0  
**Complexity**: L  
**Depends on**: GAMEDEFGEN-001

## 1) What needs to change / be implemented

Define explicit executor/decision authority for actions so specs can model effects that are executed by a faction other than the currently active faction.

- Extend action model with explicit executor strategy (for example: `active`, `faction:<id>`, `eventOwner`, `resolvedBinding`).
- Ensure legal move generation and apply path use executor consistently for:
  - condition evaluation
  - query filtering
  - move decision ownership
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

