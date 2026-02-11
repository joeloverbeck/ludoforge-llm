# FITLEVEFRAANDINICARPAC-003 - Dual-Use Selection and Branch Execution

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-002`

## Goal
Implement generic runtime semantics for dual-use event cards so either side can be selected regardless of acting faction, and branch A-or-B choices resolve deterministically with trace visibility.

## Scope
- Add runtime support for selecting unshaded vs shaded event sides through move params.
- Add runtime support for selecting one declared branch when event text is A-or-B.
- Enforce deterministic branch selection ordering when multiple legal branches are available.
- Emit trace fields for selected side, selected branch, and target ordering.

## Implementation tasks
1. Extend action parameter contracts for event-side and branch selection.
2. Apply selected side/branch to the event execution path in `apply-move`.
3. Add trace payload extensions in schemas/types for side/branch metadata.
4. Add unit tests proving side-choice legality and deterministic branch behavior.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/legal-moves.ts`
- `schemas/Trace.schema.json`
- `test/unit/apply-move.test.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out of scope
- Partial execution/skipped-step semantics for impossible sub-effects.
- Hard-invariant enforcement details (stacking, clamping, tunneled-base removal guard).
- Lasting-effect duration hooks (capability/momentum).
- FITL-specific card payload authoring.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/validate-gamedef.test.js`

### Invariants that must remain true
- Either event side remains selectable independent of acting faction identity.
- Branch and target execution order remains deterministic for identical state/input.
- Event execution trace always records selected side and branch when applicable.
- Runtime logic remains generic and does not inspect FITL card ids.

