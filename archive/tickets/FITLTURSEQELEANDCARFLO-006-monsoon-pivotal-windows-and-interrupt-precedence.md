# FITLTURSEQELEANDCARFLO-006 - Monsoon/Pivotal Windows and Interrupt Precedence

**Status**: ✅ COMPLETED  
**Spec**: `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`  
**Depends on**: `FITLTURSEQELEANDCARFLO-005`

## Goal
Implement pre-action window gating for monsoon and pivotal events, including deterministic interrupt precedence and cancellation semantics defined in data.

## Reassessed assumptions (2026-02-11)
- `FITLTURSEQELEANDCARFLO-005` is already completed and archived as `archive/tickets/FITLTURSEQELEANDCARFLO-005-eligibility-adjustment-windows-and-event-overrides.md`.
- Current turn-flow runtime ownership for this work is `src/kernel/legal-moves.ts` with shared turn-flow helpers/types in `src/kernel/turn-flow-eligibility.ts`, `src/kernel/types.ts`, and `src/kernel/schemas.ts`.
- `src/kernel/eval-condition.ts`, `src/kernel/diagnostics.ts`, and `src/sim/simulator.ts` are not the primary integration points for monsoon/pivotal gating in the current architecture.
- Existing turn-flow tests already live in `test/unit/legal-moves.test.ts` and FITL integration tests under `test/integration/fitl-*.test.ts`; this ticket adds focused monsoon/pivotal coverage.
- Interrupt precedence/cancellation in this ticket is scoped to deterministic legal-move gating rules driven by `turnFlow` metadata and current eligibility window state, not a new generic simultaneous-interrupt execution engine.

## Scope
- Detect monsoon window when next card is coup.
- Enforce monsoon restrictions:
  - block configured action ids (for example Sweep/March),
  - enforce configured max numeric parameter constraints (for example Air Lift/Air Strike space caps),
  - block pivotal actions unless configured override metadata explicitly allows.
- Enforce pivotal playability preconditions:
  - before first eligible acts,
  - faction currently eligible,
  - precondition satisfied,
  - coup not next card.
- Apply data-defined deterministic interrupt precedence and cancellation resolution for pivotal-window legal move filtering.

## File list it expects to touch
- `src/kernel/legal-moves.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-monsoon-pivotal-windows.test.ts` (new)

## Out of scope
- Authoring detailed pivotal event payload behaviors.
- Generic event framework expansion beyond timing/lifecycle hooks (Spec 20).
- Coup-round internal sequence and victory evaluation.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`

## Invariants that must remain true
- Monsoon and pivotal gating decisions are deterministic for identical state.
- Interrupt precedence is explicit in data and never inferred by iteration accident.
- Restriction decisions are deterministic and observable via legal-move outcomes in tests.
- No FITL-only branches bypass generic window/interruption primitives.

## Outcome
- Completed: 2026-02-11
- Actually changed:
  - Added generic optional turn-flow window metadata in shared types/schemas:
    - `turnFlow.monsoon` with action restrictions and optional override tokens.
    - `turnFlow.pivotal` with pivotal action ids and interrupt precedence/cancellation metadata.
  - Enforced monsoon and pivotal legal-move gating in `src/kernel/legal-moves.ts`:
    - monsoon detected via lookahead coup card,
    - action blocking and max-parameter caps during monsoon,
    - pivotal pre-action-window checks,
    - deterministic interrupt precedence and cancellation filtering.
  - Added/expanded tests in:
    - `test/unit/legal-moves.test.ts`
    - `test/integration/fitl-monsoon-pivotal-windows.test.ts` (new)
  - Updated CNL/spec-contract surface to keep new metadata representable in `GameSpecDoc` (`src/cnl/game-spec-doc.ts`) and accepted by unknown-key validation (`src/cnl/validate-spec.ts`).
  - Synced JSON schema artifact: `schemas/GameDef.schema.json`.
- Deviations from original plan:
  - No changes were needed in `src/kernel/eval-condition.ts`, `src/kernel/diagnostics.ts`, or `src/sim/simulator.ts` after reassessment.
  - Ticket scope was narrowed to legal-move gating and deterministic filtering in existing turn-flow windows, without introducing a separate simultaneous-interrupt execution engine.
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/legal-moves.test.js`
  - `node --test dist/test/unit/apply-move.test.js`
  - `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
  - `npm test`
