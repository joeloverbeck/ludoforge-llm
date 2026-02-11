# FITLOPEANDSPEACT-004 - Deterministic Target Processing, Removal Policies, and RNG Trace

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`

## Goal
Add reusable deterministic processing policies needed by operations: ordered multi-space iteration, bases-last and tunneled-base handling as data-driven removal policies, and seeded RNG gates with trace-visible outcomes.

## Scope
- Add generic ordered-iteration helpers for operation target spaces.
- Implement reusable removal policy primitives (for example piece priority ladders and gated removals) without FITL-specific hardcoding.
- Add deterministic die-roll gate primitive consuming seeded RNG and recording outcomes in trace.
- Ensure tie-break behavior is explicit whenever user choice is not present.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/determinism.ts`
- `src/kernel/prng.ts`
- `src/kernel/effects.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/serde.ts`
- `test/unit/prng-core.test.ts`
- `test/unit/determinism-rng-helpers.test.ts`
- `test/unit/effects-runtime.test.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/determinism-full.test.ts`

## Out of scope
- Authoring FITL operation YAML entries.
- Card-flow option matrix behavior from Spec 17.
- Coup transitions and victory accounting.
- Event-card framework and event pack behavior.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/prng-core.test.js`
- `node --test dist/test/unit/determinism-rng-helpers.test.js`
- `node --test dist/test/unit/effects-runtime.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/integration/determinism-full.test.js`

## Invariants that must remain true
- All probabilistic branches use seeded RNG only.
- Same seed + same choices produces byte-equivalent trace deltas.
- Target processing order is deterministic at every non-choice iteration point.
- Policy primitives remain game-agnostic and reusable.
