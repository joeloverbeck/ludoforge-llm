# FITLCOUROUANDVIC-002 - Deterministic Score-Track Recompute Kernel

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`

## Goal
Implement generic runtime recomputation of derived score/victory tracks from canonical board/track state at explicit checkpoints, eliminating incremental-drift scoreboard behavior.

## Implementation Tasks
1. Add pure recompute primitives for support/opposition, control, bases, available-force aggregates, and bounded tracks.
2. Wire recompute checkpoints into a reusable runtime hook callable from phase steps.
3. Emit trace-visible checkpoint entries so recompute timing is deterministic and auditable.
4. Add guardrails for coupled bound interactions (resources/aid/patronage/econ/trail/casualties).

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/effects.ts`
- `src/kernel/eval-value.ts`
- `src/kernel/eval-query.ts`
- `src/kernel/schemas.ts`
- `src/kernel/turn-flow-lifecycle.ts`
- `test/unit/eval-value.test.ts`
- `test/unit/eval-query.test.ts`
- `test/unit/effects-var.test.ts`
- `test/unit/game-loop.golden.test.ts`

## Out Of Scope
- Coup phase ordering and branching policy.
- Resources/support/redeploy/commitment/reset phase-specific behavior.
- Final victory threshold and ranking resolution.
- FITL-specific formulas hardcoded in runtime conditionals.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/eval-value.test.js`
- `node --test dist/test/unit/eval-query.test.js`
- `node --test dist/test/unit/effects-var.test.js`
- `node --test dist/test/unit/game-loop.golden.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Recompute functions are pure and deterministic for equal inputs.
- Track bounds remain enforced (`0..75` where applicable, trail `0..4`).
- No mutable shadow scoreboard is introduced.

