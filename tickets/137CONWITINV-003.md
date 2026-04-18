# 137CONWITINV-003: Rewrite enumeration-hang test as `fitl-enumeration-bounds.test.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test rewrite only
**Deps**: `archive/tickets/137CONWITINV-001.md`

## Problem

`packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` currently classifies as `convergence-witness` and asserts `legal.moves.length === 18` at seed 1040, ply 20 (line 47) — a trajectory-pinned observation that had to be re-blessed after Spec 135's sampler-bias relocation (the prior trajectory count was 19). The underlying invariant — that `enumerateLegalMoves` terminates with a bounded move set for every reachable in-flight FITL state — is a property, not a trajectory. Spec 137 replaces the witness with a property-form architectural-invariant test that exercises a state corpus and asserts only the invariant.

## Assumption Reassessment (2026-04-18)

1. `fitl-policy-agent-enumeration-hang.test.ts` exists at the stated path with `@test-class: convergence-witness` and `@witness: 132AGESTUVIA-001` at file top; the trajectory-pinned assertion is at line 47 — verified during Spec 137 reassessment.
2. The file contains a second `it` block for seed 1012 (former ply-59 hotspot) that already uses property-form `legal.moves.length > 0` — verified. This branch's coverage is subsumed by the new corpus-based assertion.
3. No source file imports this test file (verified zero-importer blast radius during reassessment); deletion has no ripple effects.
4. Ticket 001 delivers the parameterized corpus helper this ticket consumes.

## Architecture Check

1. Property-form assertion (`legal.moves.length <= MAX_REASONABLE_MOVE_COUNT`) is orthogonal to RNG trajectory. Foundation #15 (Architectural Completeness): the new test proves the underlying invariant directly; it won't re-bless on every sampler tweak.
2. Hang detection via the node test runner's per-test `timeout` option is portable and deterministic — unlike wall-clock `performance.now()` assertions, which depend on ambient process state and would violate Foundation #8 at the test-suite level.
3. Foundation #14: pre-distillation file is deleted, not left as a legacy path.
4. Foundation #10 (Bounded Computation): the move-count bound is the direct property Foundation #10 requires of legal-move enumeration.

## What to Change

### 1. Create `fitl-enumeration-bounds.test.ts`

Create `packages/engine/test/integration/fitl-enumeration-bounds.test.ts` with file-top marker `// @test-class: architectural-invariant` (no `@witness:` — architectural invariants do not carry witness back-references per `.claude/rules/testing.md`).

Include a block comment citing the distilled invariant and the defect class it guards:

```ts
/**
 * Architectural invariant: `enumerateLegalMoves` returns a bounded move set
 * in finite time for every reachable in-flight state of the FITL production
 * spec. Guards against enumeration-stall regressions (former ply-20 / ply-59
 * hotspots on seeds 1040 and 1012). Property form distilled from
 * convergence-witness `132AGESTUVIA-001` per Spec 137.
 */
```

Test body:

```ts
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
} from '../../src/kernel/index.js';
import { buildDeterministicFitlStateCorpus } from '../helpers/compiled-condition-production-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CANARY_SEEDS = [1040, 1012, /* add further canary seeds as coverage demands */] as const;
const MAX_REASONABLE_MOVE_COUNT = 500; // Upper bound; tune to observed ceiling + generous headroom.
const MAX_PLY = 60;

describe('FITL enumerateLegalMoves bounds', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it(
    'enumerates bounded legal-move sets across a sampled FITL state corpus',
    { timeout: 20_000 },
    () => {
      const corpus = buildDeterministicFitlStateCorpus(def, {
        seeds: [...CANARY_SEEDS],
        maxPly: MAX_PLY,
      });
      for (const state of corpus) {
        const legal = enumerateLegalMoves(def, state, undefined, runtime);
        assert.ok(
          legal.moves.length <= MAX_REASONABLE_MOVE_COUNT,
          `enumeration produced ${legal.moves.length} moves (exceeds bound ${MAX_REASONABLE_MOVE_COUNT})`,
        );
      }
    },
  );
});
```

Tune `MAX_REASONABLE_MOVE_COUNT` by running the test once locally, recording the observed peak move count across the corpus, and setting the bound to that peak × 2 (or a documented rationale for a tighter bound). Record the rationale in a short comment above the constant.

### 2. Delete the pre-distillation file

Remove `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` in the same change — per Foundation #14, no legacy path is retained.

### 3. Verify corpus helper interaction

Confirm the parameterized `buildDeterministicFitlStateCorpus(def, { seeds, maxPly })` delivered by ticket 001 produces the expected state sequence for the chosen canary seeds. The corpus helper uses deterministic move selection (`moves[(seed + step) % moves.length]`) which is trajectory-agnostic by construction — exactly what the new test needs.

## Files to Touch

- `packages/engine/test/integration/fitl-enumeration-bounds.test.ts` (new)
- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` (delete)

## Out of Scope

- Changing the `buildDeterministicFitlStateCorpus` helper. Ticket 001 owns the parameterization.
- Population-0 invariance assertions. Ticket 004 covers those in the bounded-termination test.
- Expanding the canary seed corpus beyond the minimum required for invariant coverage. The spec explicitly marks corpus expansion as a separate concern.
- Updating `.claude/rules/testing.md`. Ticket 005 owns the rule-file change.

## Acceptance Criteria

### Tests That Must Pass

1. New test `fitl-enumeration-bounds.test.ts` passes with the chosen `MAX_REASONABLE_MOVE_COUNT` bound and 20s timeout across all canary seeds in the corpus.
2. `grep -n "legal.moves.length === [0-9]" packages/engine/test/integration/fitl-*.test.ts` returns empty.
3. `grep -n "@test-class: convergence-witness" packages/engine/test/integration/fitl-enumeration-bounds.test.ts` returns empty.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Trajectory-agnosticism**: A hypothetical one-bit perturbation of the sampler seed prefix (e.g., `AGENT_RNG_MIX`) must not cause this test to fail. The assertion form ensures this by construction. (Validated manually once in Spec 137 Implementation Direction §6.)
2. **Bounded output**: `enumerateLegalMoves` never returns more than `MAX_REASONABLE_MOVE_COUNT` moves on any state in the corpus.
3. **Deletion atomicity**: The pre-distillation file is deleted in the same commit that creates the replacement — no two-phase migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-enumeration-bounds.test.ts` — architectural-invariant classification; replaces `fitl-policy-agent-enumeration-hang.test.ts`. Asserts move-count bound over a parameterized deterministic state corpus derived from canary seeds.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint typecheck`
