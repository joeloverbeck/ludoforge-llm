# GAMEDEFGEN-001: Generic Interrupt Phase Stack and Transition Semantics

**Status**: Draft  
**Priority**: P0  
**Complexity**: XL  
**Depends on**: Current kernel turn/phase engine

## 1) What needs to change / be implemented

Implement a game-agnostic interrupt/scene phase model so game specs can enter temporary phase flows without mutating global phase structure assumptions.

- Add runtime interrupt stack state (LIFO) in `GameState` turn-flow runtime.
- Add generic effects for transition control (replace ad hoc use of raw phase stepping):
  - `pushInterruptPhase` (target phase + resume policy)
  - `popInterruptPhase`
  - optional `gotoPhase` constrained to current frame
- Enforce deterministic lifecycle semantics for interrupt enter/exit and trigger dispatch.
- Disallow implicit turn-boundary traversal from effect-level phase transitions.
- Remove reliance on static “extra phase in global turnStructure” for event-driven interrupts.
- No backward compatibility layer, no alias effect names.

## 2) Invariants that should pass

- Engine remains game-agnostic: no FITL-specific branching in kernel.
- Interrupt transitions are deterministic and side-effect order is stable.
- Interrupt flow cannot accidentally advance turn/card lifecycle unless explicitly requested by spec.
- Resume state after interrupt is exact and reproducible.
- Invalid interrupt operations fail with explicit kernel/runtime diagnostics.

## 3) Tests that should pass

### New tests
- `test/unit/interrupt-phase-stack.test.ts`
  - push/pop behavior, nested interrupts, invalid pop, resume correctness.
- `test/unit/effects-turn-flow-transitions.test.ts`
  - lifecycle ordering and boundary safety for transition effects.
- `test/integration/interrupt-flow-golden.test.ts`
  - deterministic trace for multi-interrupt scenario.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

