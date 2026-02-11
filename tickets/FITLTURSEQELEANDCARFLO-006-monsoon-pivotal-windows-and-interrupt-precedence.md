# FITLTURSEQELEANDCARFLO-006 - Monsoon/Pivotal Windows and Interrupt Precedence

**Status**: Proposed  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-005`

## Goal
Implement pre-action window gating for monsoon and pivotal events, including deterministic interrupt precedence and cancellation semantics defined in data.

## Scope
- Detect monsoon window when next card is coup.
- Enforce monsoon restrictions:
  - no Sweep/March,
  - US Air Lift/Air Strike max 2 spaces,
  - no pivotal events unless event text override metadata explicitly allows.
- Enforce pivotal playability preconditions:
  - before first eligible acts,
  - faction currently eligible,
  - precondition satisfied,
  - coup not next card.
- Apply data-defined deterministic interrupt precedence and cancellation resolution.

## File list it expects to touch
- `src/kernel/legal-moves.ts`
- `src/kernel/eval-condition.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/types.ts`
- `src/sim/simulator.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/eval-condition.test.ts`
- `test/integration/fitl-monsoon-pivotal-windows.test.ts` (new)

## Out of scope
- Authoring detailed pivotal event payload behaviors.
- Generic event framework expansion beyond timing/lifecycle hooks (Spec 20).
- Coup-round internal sequence and victory evaluation.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/eval-condition.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`

## Invariants that must remain true
- Monsoon and pivotal gating decisions are deterministic for identical state.
- Interrupt precedence is explicit in data and never inferred by iteration accident.
- Restriction diagnostics are trace-visible and stable.
- No FITL-only branches bypass generic window/interruption primitives.
