# GAMEDEFGEN-001: Generic Interrupt Phase Stack and Transition Semantics

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Complexity**: XL  
**Depends on**: Current kernel turn/phase engine

## 0) Reassessed current-state assumptions

- Current engine has `advanceToPhase` only; there is no interrupt phase stack runtime state.
- `advanceToPhase` currently advances via repeated `advancePhase` and can wrap across turn boundaries.
- Existing tests explicitly assert this wrap behavior (`test/unit/effects-runtime.test.ts`).
- Existing FITL data/test fixtures currently encode commitment flow with `advanceToPhase`.
- Current action/phase contracts still require action phases to exist in `turnStructure.phases`.

Scope correction:
- This ticket introduces generic interrupt-frame transition primitives and removes boundary-wrapping transitions.
- Full removal of interrupt-specific phases from global `turnStructure` is out of scope for this ticket and belongs to follow-on FITL remodeling work.

## 1) What needs to change / be implemented

Implement a game-agnostic interrupt/scene phase model so game specs can enter temporary phase flows with deterministic resume semantics.

- Add runtime interrupt stack state (LIFO) to `GameState` (generic kernel state, not FITL-specific turn-order internals).
- Replace `advanceToPhase` with explicit transition effects (no aliases):
  - `gotoPhase` (same-frame transition only; no turn-boundary traversal)
  - `pushInterruptPhase` (enter interrupt frame with explicit resume target)
  - `popInterruptPhase` (exit interrupt frame and resume deterministically)
- Enforce deterministic lifecycle semantics for phase enter/exit and trigger dispatch around push/pop/goto.
- Disallow implicit turn/card boundary traversal from effect-level phase transitions.
- Remove `advanceToPhase` from compiler/runtime/schema/validation pathways (breaking change by design).
- Keep implementation game-agnostic and data-driven (no game-specific branches).

## 2) Invariants that should pass

- Engine remains game-agnostic: no FITL-specific branching in kernel.
- Interrupt transitions are deterministic and side-effect order is stable.
- Interrupt flow cannot accidentally advance turn/card lifecycle unless explicitly requested by turn advancement.
- Resume state after interrupt is exact and reproducible.
- Invalid interrupt operations fail with explicit kernel/runtime diagnostics.
- Same-frame `gotoPhase` must reject transitions that would wrap turn boundaries.

## 3) Tests that should pass

### New tests
- `test/unit/interrupt-phase-stack.test.ts`
  - push/pop behavior, nested interrupts, invalid pop, resume correctness, and no turn-boundary side effects.
- `test/unit/effects-runtime.test.ts` (new cases)
  - `gotoPhase` same-frame success and boundary-rejection behavior.

### Modified tests
- `test/unit/compile-effects.test.ts`
  - lowering coverage for `gotoPhase`, `pushInterruptPhase`, and `popInterruptPhase`.
- `test/unit/schemas-ast.test.ts`
  - schema acceptance for new transition effect shapes.
- `test/unit/types-exhaustive.test.ts`
  - effect union exhaustiveness updated for removed/added transition effects.
- FITL integration tests currently asserting `advanceToPhase` payloads:
  - `test/integration/fitl-commitment-phase.test.ts`
  - `test/integration/fitl-events-1965-arvn.test.ts`
  - `test/integration/fitl-events-text-only-behavior-backfill.test.ts`

### Existing checks
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added generic interrupt stack runtime state on `GameState` (`interruptPhaseStack`).
  - Replaced `advanceToPhase` with `gotoPhase`, `pushInterruptPhase`, and `popInterruptPhase` across compiler/runtime/schemas/validation.
  - Enforced no implicit turn-boundary traversal for effect-level phase transitions (`gotoPhase` rejects wrap).
  - Updated FITL data/test fixtures to the new transition primitives.
  - Added interrupt stack unit coverage (`test/unit/interrupt-phase-stack.test.ts`) and updated transition-related tests.
  - Included interrupt frame state in Zobrist full-hash computation.
- Deviations from original draft:
  - Did not remove interrupt-specific phase declarations from global `turnStructure` in this ticket; that remains follow-on remodeling scope.
- Verification:
  - `npm run build` passed
  - `npm run lint` passed
  - `npm test` passed
