# FITLEVEFRAANDINICARPAC-005 - Lasting Effects and Free-Operation Interactions

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-003`, `FITLEVEFRAANDINICARPAC-004`

## Goal
Add generic event-driven lasting-effect hooks (`capability`, `momentum`) and free-operation semantics that interact correctly with eligibility and cost rules.

## Scope
- Add generic event directives to register/remove lasting effects with declared duration windows.
- Wire duration behavior:
  - capability persists for campaign duration,
  - momentum expires at next Coup Reset window.
- Implement free-operation semantics:
  - zero operation cost,
  - no eligibility mutation unless explicitly directed by event text.
- Add trace deltas for lasting-effect state and eligibility/resource outcomes.

## Implementation tasks
1. Extend turn-flow lifecycle state model for active lasting effects and expiration checkpoints.
2. Add runtime helpers for creating/expiring capability/momentum effects.
3. Integrate free-op cost/eligibility behavior with existing option-matrix and action usage logic.
4. Add targeted tests proving duration and free-op interaction invariants.

## File list it expects to touch
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `test/unit/turn-flow-lifecycle.test.ts` (new)
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts`

## Out of scope
- Card-specific payload details for Card 82 and Card 27.
- New operation profile definitions for base operations/special activities.
- Non-event Coup/victory scoring rule changes.
- Any FITL-specific runtime branches for particular card ids.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/turn-flow-lifecycle.test.js`
- `node --test dist/test/integration/fitl-eligibility-window.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`

### Invariants that must remain true
- Free operations remain zero-cost and do not alter eligibility unless explicitly encoded.
- Capability and momentum effects are data-driven and expire according to declared generic windows.
- Lasting-effect creation/expiration is trace-visible and deterministic.
- No FITL-specific branching is introduced in lifecycle or eligibility runtime logic.

