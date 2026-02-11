# FITLOPEANDSPEACT-004 - Deterministic Target Processing, Removal Policies, and RNG Trace

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`

## Goal
Add reusable deterministic processing policies needed by operations: ordered multi-space iteration, bases-last and tunneled-base handling as data-driven removal policies, and seeded RNG gates with trace-visible outcomes.

## Assumption reassessment (2026-02-11)
- `FITLOPEANDSPEACT-002` and `FITLOPEANDSPEACT-003` are already completed and archived under `archive/tickets/`; dependency wording remains valid conceptually but they are no longer active tickets.
- Deterministic non-choice iteration order is already implemented in generic query/spatial paths (`evalQuery` sorted `zones`, normalized lexicographic adjacency traversal) and operation stage ordering is already enforced in move execution.
- Seeded RNG determinism and serialization round-trip behavior are already implemented and covered by existing deterministic/PRNG tests.
- This ticket's original assumptions about introducing dedicated removal-policy primitives and a dedicated die-roll trace primitive are ahead of the current operation targeting contract: `operationProfiles.targeting`/`resolution` payloads are still generic records without a concrete, validated runtime removal-policy schema.

## Scope
- Confirm and lock deterministic behavior already present for operation execution foundations (ordered stage execution + seeded RNG stability).
- Strengthen runtime test coverage for an uncovered invariant: when `partialExecution.mode = allow` and cost validation fails, cost spend effects are skipped, including RNG-consuming effects.
- Defer dedicated removal-policy and explicit die-roll trace event primitives to follow-up tickets once operation-targeting/removal schema contracts are introduced.

## File list it expects to touch
- `test/unit/apply-move.test.ts`
- `archive/tickets/FITLOPEANDSPEACT-004-deterministic-target-processing-removal-policies-and-rng-trace.md`

## Out of scope
- Introducing new operation-profile targeting/removal payload contracts.
- Implementing bases-last/tunneled-base removal runtime semantics before those contracts exist.
- Adding a new dedicated RNG trace entry channel/API.
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

## Outcome
- Completion date: 2026-02-11
- What actually changed:
  - Reassessed and corrected ticket assumptions/scope against current implementation status.
  - Added a focused regression test proving RNG-consuming cost spend is skipped in `partialExecution.mode = "allow"` when profile cost validation fails.
- Deviation from original plan:
  - No new kernel runtime primitives were added for removal policies or die-roll trace entries because the operation targeting/removal payload contract is not yet concretely modeled in runtime/compiler schemas.
  - Deterministic ordering and seeded RNG foundations were already present; this ticket closed by tightening guarantees with targeted coverage instead of broad kernel refactoring.
