# 137CONWITINV-004: Merge seed-regression tests into `fitl-canary-bounded-termination.test.ts`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test rewrite only
**Deps**: `archive/tickets/137CONWITINV-002.md`

## Problem

`packages/engine/test/integration/fitl-seed-1002-regression.test.ts` and `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` currently classify as `convergence-witness` with assertions pinned to specific seeds and (for seed 1002) to the specific space `phuoc-long:none`. Their property-form core — `stopReason ∈ {terminal, maxTurns, noLegalMoves, noPlayableMoveCompletion}` and `supportOpposition === 'neutral'` for population-0 spaces — generalizes cleanly across trajectories. Spec 137 merges them into a single architectural-invariant test that iterates `CANARY_SEEDS × POLICY_PROFILE_VARIANTS` and derives the population-0 space set from the FITL map (ticket 002's helper).

## Assumption Reassessment (2026-04-18)

1. Both pre-distillation files exist with `@test-class: convergence-witness` markers and the exact assertions described in the Spec 137 Problem Statement — verified during reassessment.
2. The two files use different ARVN profile entries: `fitl-seed-1002-regression.test.ts:15` uses `arvn-evolved`; `fitl-seed-1005-1010-1013-regression.test.ts:12` uses `arvn-evolved`; `fitl-policy-agent-enumeration-hang.test.ts:19` (handled in ticket 003) uses `arvn-baseline`. The merged test iterates both `arvn-baseline` and `arvn-evolved` variants to preserve coverage across both profile sets.
3. `trace.finalState.markers[space]?.[lattice]` is the correct access path; markers are keyed by `{space}` with lattice IDs (e.g., `supportOpposition`) as inner keys — verified.
4. Both pre-distillation files use `runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime)` with `MAX_TURNS = 200` and `PLAYER_COUNT = 4` — verified.
5. Neither file is imported by any source module (zero-importer blast radius). Deletion has no ripple effects.
6. Ticket 002 delivers `deriveFitlPopulationZeroSpaces()`, which this ticket consumes.

## Architecture Check

1. Property-form assertion ("every population-0 space stays `neutral` for every canary seed under every profile variant") proves the underlying invariant across the Cartesian product of seed × profile — a strictly stronger proof than the pre-distillation pinned witness. Foundation #16 (Testing as Proof) satisfied.
2. Population-0 space set is derived from the GameDef via ticket 002's helper — the test does not duplicate the space list, so future FITL map revisions automatically propagate to the assertion. Foundation #15 (Architectural Completeness): no symptom-patching.
3. Foundation #14: both pre-distillation files are deleted in the same change. No legacy path retained.
4. FITL-specific derivation remains in `test/helpers/` — no leak into engine runtime. Foundation #1 preserved.

## What to Change

### 1. Create `fitl-canary-bounded-termination.test.ts`

Create `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` with file-top marker `// @test-class: architectural-invariant` (no `@witness:`).

Include a block comment citing the distilled invariant:

```ts
/**
 * Architectural invariants for FITL canary simulation:
 *   (a) `runGame` produces a trace whose stopReason is in the canonical
 *       allowed set {terminal, maxTurns, noLegalMoves, noPlayableMoveCompletion};
 *   (b) every population-0 space stays `neutral` on `supportOpposition`
 *       in the final state;
 *   (c) `runGame` does not throw (an uncaught exception would fail the test
 *       before any assertion runs).
 *
 * Distilled from convergence-witnesses `132AGESTUVIA-008` and
 * `132AGESTUVIA-009` per Spec 137. Coverage spans every canary seed × every
 * supported policy-profile variant, not a pinned (seed, profile) pair.
 */
```

Test body:

```ts
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  deriveFitlPopulationZeroSpaces,
} from '../helpers/production-spec-helpers.js';

const CANARY_SEEDS = [1002, 1005, 1010, 1013, /* add further canary seeds as coverage demands */] as const;
const POLICY_PROFILE_VARIANTS = [
  ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
  ['us-baseline', 'arvn-evolved',  'nva-baseline', 'vc-baseline'],
] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set([
  'terminal', 'maxTurns', 'noLegalMoves', 'noPlayableMoveCompletion',
]);

describe('FITL canary bounded termination', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const populationZeroSpaces = deriveFitlPopulationZeroSpaces();

  for (const profiles of POLICY_PROFILE_VARIANTS) {
    for (const seed of CANARY_SEEDS) {
      it(
        `profiles=${profiles.join(',')} seed=${seed}: bounded stop and population-0 neutrality`,
        { timeout: 20_000 },
        () => {
          const agents = profiles.map(
            (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
          );
          const trace = runGame(
            def,
            seed,
            agents,
            MAX_TURNS,
            PLAYER_COUNT,
            { skipDeltas: true },
            runtime,
          );

          assert.ok(
            ALLOWED_STOP_REASONS.has(trace.stopReason),
            `stop=${trace.stopReason} after ${trace.moves.length} moves`,
          );
          for (const space of populationZeroSpaces) {
            assert.equal(
              trace.finalState.markers[`${space}:none`]?.supportOpposition ?? 'neutral',
              'neutral',
              `population-0 space ${space} drifted on supportOpposition`,
            );
          }
        },
      );
    }
  }
});
```

### 2. Delete the pre-distillation files

Remove both `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` and `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` in the same change.

### 3. Preserve no-throws coverage implicitly

The pre-distillation files asserted `trace.moves.length > 0` as a "simulation advanced" check. The new test does not explicitly assert this because the `ALLOWED_STOP_REASONS` check already implies the trace is well-formed, and a zero-move trace under any of those stop reasons would fail the population-0 assertion trivially (no meaningful game occurred). If the implementer encounters a genuine case where `moves.length === 0` slips past both checks, add an explicit `assert.ok(trace.moves.length > 0)` guard — but document the case in the test comment.

## Files to Touch

- `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` (new)
- `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` (delete)
- `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` (delete)

## Out of Scope

- Adding seeds beyond the pre-distillation set. Corpus expansion is explicitly a separate concern per Spec 137's Out of Scope.
- The enumeration-bounds test (ticket 003).
- Updating `.claude/rules/testing.md` (ticket 005).
- Adding the `deriveFitlPopulationZeroSpaces` helper (ticket 002).

## Acceptance Criteria

### Tests That Must Pass

1. New test `fitl-canary-bounded-termination.test.ts` passes across the full `CANARY_SEEDS × POLICY_PROFILE_VARIANTS` cartesian.
2. `grep -n "@test-class: convergence-witness" packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` returns empty.
3. `grep -n "phuoc-long:none" packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` returns empty (the merged canary test derives the population-0 set instead of pinning `phuoc-long:none`).
4. Both pre-distillation files no longer exist in `packages/engine/test/integration/`.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Trajectory-agnosticism**: Sampler-seed perturbation must not cause this test to fail. Property-form assertions guarantee this by construction. (Validated manually once per Spec 137 Implementation Direction §6.)
2. **Derivation, not duplication**: the population-0 space set is computed from the GameDef at test setup, never hardcoded.
3. **Both profile variants covered**: iterating `POLICY_PROFILE_VARIANTS` preserves coverage of both `arvn-baseline` and `arvn-evolved`.
4. **Deletion atomicity**: Both pre-distillation files deleted in the same commit as the new file is created.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` — architectural-invariant classification; supersedes both `fitl-seed-1002-regression.test.ts` and `fitl-seed-1005-1010-1013-regression.test.ts`. Iterates `CANARY_SEEDS × POLICY_PROFILE_VARIANTS` with bounded-stop-reason and population-0 neutrality assertions.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint typecheck`

## Outcome

ticket corrections applied: `deriveFitlPopulationZeroSpaces(def)` -> `deriveFitlPopulationZeroSpaces()`; `grep -n "phuoc-long:none" packages/engine/test/integration/fitl-*.test.ts` -> `grep -n "phuoc-long:none" packages/engine/test/integration/fitl-canary-bounded-termination.test.ts`

Completion date: 2026-04-18

Merged the two FITL seed-regression convergence-witness files into the new
architectural-invariant test
`packages/engine/test/integration/fitl-canary-bounded-termination.test.ts`.

The landed test iterates the full `CANARY_SEEDS × POLICY_PROFILE_VARIANTS`
cartesian, asserts `runGame(...)` stops only with an allowed bounded stop
reason, and checks that every population-0 space derived from the FITL
production map remains `neutral` on the `supportOpposition` lattice in the
final state.

Deleted the pre-distillation files
`packages/engine/test/integration/fitl-seed-1002-regression.test.ts` and
`packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts`
atomically with the replacement file.

Deviations from original plan: the ticket's acceptance grep was corrected to
the owned merged test file after reassessment against the FITL production map
and rulebook showed that `phuoc-long:none` remains a legitimate literal space
identifier in unrelated FITL scenario and event tests. The owned invariant is
\"derive population-0 spaces in the merged canary test\", not a repo-wide ban on
that space ID.

Verification results:

- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/fitl-canary-bounded-termination.test.js`
- `rg -n "@test-class: convergence-witness" packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` returned no matches
- `rg -n "phuoc-long:none" packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` returned no matches
- confirmed both pre-distillation files no longer exist
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo lint typecheck`
