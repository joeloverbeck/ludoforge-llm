# 136POLPROQUA-002: Author policy-profile-quality variant corpus + lane wiring

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test directory (`packages/engine/test/policy-profile-quality/`), `packages/engine/scripts/test-lane-manifest.mjs`, `packages/engine/scripts/run-tests.mjs`, `packages/engine/package.json`
**Deps**: `archive/tickets/136POLPROQUA-001.md`

## Problem

Spec 136 defines a new `policy-profile-quality/` corpus whose purpose is to track whether named profile variants converge to `terminal` within a target move budget on versioned seed sets — as non-blocking CI quality signals, distinct from the determinism corpus's architectural invariants. The corpus does not yet exist. This ticket authors its initial two files (per Spec 136 Required Proof) and the lane plumbing needed to run them as a separate executable unit.

## Assumption Reassessment (2026-04-18)

1. Ticket 001 has landed and `test-class-markers.test.ts` now requires `@profile-variant <id>` on convergence-witness files under `policy-profile-quality/`. This ticket's new test files MUST carry that marker.
2. `packages/engine/scripts/test-lane-manifest.mjs` currently defines `ALL_DETERMINISM_TESTS` (line 53) and lane helpers for `integration` and `e2e`. Adding a `policy-profile-quality` lane follows the same pattern — a new constant `ALL_POLICY_PROFILE_QUALITY_TESTS` sourced from `packages/engine/test/policy-profile-quality/` after build.
3. `packages/engine/scripts/run-tests.mjs` dispatches lanes via a `laneConfigs` map (line 11 / line 28 for `determinism`). Adding a `policy-profile-quality` lane follows the same shape.
4. FITL profile IDs in `data/games/fire-in-the-lake/92-agents.md` today: `us-baseline`, `arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline` (lines 472–578). Default seat assignment uses `arvn-evolved` for ARVN (line 579). The two initial variants match Spec 136 Required Proof.
5. Existing canary seed set `[1020, 1040, 1049, 1054, 2046]` is the natural starting seed set for both variants; it is already the set `fitl-policy-agent-canary.test.ts` uses and matches the `FITL_1964_CANARY_SEEDS` named constant proposed in Spec 136 Contract §3.
6. Non-blocking execution is wired at the CI level (Ticket 004), not at the test-framework level. This ticket's tests still fail locally via `node --test` when convergence is missed — the non-blocking behavior is a CI-job policy, not a test-author policy. This matches the spec's failure semantics ("The test runner tags policy-profile-quality failures as non-blocking in the CI report").

## Architecture Check

1. **Symmetric with existing determinism corpus**. The new lane reuses `test-lane-manifest.mjs`'s `collectTestFiles` and `run-tests.mjs`'s lane-dispatch shape. No new runner framework, no bespoke discovery logic.
2. **Variant-per-file granularity matches `POLICY_PROFILE_VARIANTS` precedent**. `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` already iterates two variants in a single file (all-baselines + arvn-evolved). This ticket's new files follow the same variant definition but split one file per variant to match Spec 136's per-variant marker + per-variant CI reporting model. The content is symmetric; the separation is for marker/reporting, not semantic.
3. **No game-specific leakage into engine code**. All FITL profile IDs and seed sets live in the test files themselves — engine, kernel, compiler, and runtime stay agnostic per FOUNDATIONS #1. The `policy-profile-quality/` directory is test-only.
4. **Named seed set per Contract §3**. The exported constant `FITL_1964_CANARY_SEEDS` is versioned with the variant file, not with the kernel. Reassigning seeds is a variant-maintainer decision per Spec 136 §4 re-blessing protocol.
5. **Both tests declare `@profile-variant` markers**. No fallback to `@witness`, no dual marker — one shape per corpus. FOUNDATIONS #14.

## What to Change

### 1. Create `packages/engine/test/policy-profile-quality/` directory with two variant files

**`fitl-variant-all-baselines-convergence.test.ts`**:

```ts
// @test-class: convergence-witness
// @profile-variant: all-baselines
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const VARIANT_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const FITL_1964_CANARY_SEEDS = [1020, 1040, 1049, 1054, 2046] as const;
const MAX_TURNS = 300;
const PLAYER_COUNT = 4;

describe('FITL variant all-baselines: convergence on FITL_1964_CANARY_SEEDS', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  for (const seed of FITL_1964_CANARY_SEEDS) {
    it(`seed ${seed}: variant all-baselines reaches terminal within ${MAX_TURNS} moves`, () => {
      const agents = VARIANT_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      );
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
      assert.equal(
        trace.stopReason,
        'terminal',
        `seed ${seed}: variant all-baselines failed to converge — stopReason=${trace.stopReason} after ${trace.moves.length} moves`,
      );
    });
  }
});
```

**`fitl-variant-arvn-evolved-convergence.test.ts`**: identical shape, with `VARIANT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline']` and `// @profile-variant: arvn-evolved`. The seed set is the same `FITL_1964_CANARY_SEEDS`.

Each test fails locally when convergence misses. CI policy in Ticket 004 flips those failures to non-blocking annotations.

### 2. Extend `packages/engine/scripts/test-lane-manifest.mjs`

- Add `const POLICY_PROFILE_QUALITY_TEST_ROOT = resolve(ENGINE_ROOT, 'test', 'policy-profile-quality');`
- Add `export const ALL_POLICY_PROFILE_QUALITY_TESTS = collectTestFiles(POLICY_PROFILE_QUALITY_TEST_ROOT);`

### 3. Extend `packages/engine/scripts/run-tests.mjs`

- Import `ALL_POLICY_PROFILE_QUALITY_TESTS` alongside `ALL_DETERMINISM_TESTS`.
- Add a `'policy-profile-quality'` entry to `laneConfigs` mirroring the `determinism` entry's shape (execution mode, patterns derived from the new constant).
- Ensure `buildChildEnv` sets `ENGINE_TEST_PROGRESS_LANE = 'policy-profile-quality'` when dispatching this lane — Ticket 001's reporter extension keys on that value.

### 4. Add `test:policy-profile-quality` script to `packages/engine/package.json`

After the existing `test:determinism` line:

```json
"test:policy-profile-quality": "node scripts/run-tests.mjs --lane policy-profile-quality",
```

### 5. Default-lane inclusion

Confirm via reading `run-tests.mjs` whether the `default` lane already globs `dist/test/**/*.test.js`. If so, the new files are picked up automatically when running `pnpm turbo test`. If the default lane is a named subset, extend it to include policy-profile-quality files. Document the observed behavior in the ticket completion outcome.

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` (new)
- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` (new)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify)
- `packages/engine/scripts/run-tests.mjs` (modify)
- `packages/engine/package.json` (modify — scripts only)

## Out of Scope

- Marker-validator extensions — Ticket 001.
- CI workflow wiring and non-blocking behavior — Ticket 004.
- PR-comment annotation script — Ticket 005.
- Additional profile variants beyond `all-baselines` and `arvn-evolved` — future tickets; spec §Implementation Direction / Profile lifecycle covers when evolved→baseline promotions happen.
- Changing the canary file name or assertions — Ticket 003.
- Documentation in FOUNDATIONS.md or `campaigns/` — Ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:policy-profile-quality` — new lane executes both variant files.
2. `pnpm -F @ludoforge/engine test:unit` — Ticket 001's marker-validator accepts both new files (they declare `@profile-variant`) and the determinism lint still passes.
3. `pnpm turbo test` — default lane green; all corpora build and execute.
4. `pnpm turbo typecheck` — strict; no new errors.
5. `pnpm turbo lint` — clean.

### Invariants

1. Both new files declare `@test-class: convergence-witness` and `@profile-variant <id>` within their first three lines, and MUST NOT declare `@witness`.
2. The `FITL_1964_CANARY_SEEDS` constant is defined per-file (not exported cross-file) — seed sets are versioned with the variant, not shared globally, per Spec 136 Contract §3.
3. The `policy-profile-quality` lane lists exactly the files under `packages/engine/test/policy-profile-quality/`; no cross-lane overlap with `determinism` or `integration`.
4. Determinism lane output is unchanged (same file list, same pass/fail shape).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` — new. Rationale: establishes the all-baselines variant as the reference convergence witness per Spec 136 Required Proof.
2. `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` — new. Rationale: tracks the sole current evolved profile's convergence for the policy-maintainer's quality signal.

### Commands

1. `pnpm -F @ludoforge/engine build` — build artifacts required before `node --test` picks up dist-compiled files.
2. `pnpm -F @ludoforge/engine test:policy-profile-quality` — targeted lane run.
3. `pnpm -F @ludoforge/engine test:determinism` — determinism lane unaffected.
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — full-suite verification.
5. `pnpm run check:ticket-deps` — dependency integrity.

## Outcome

- Completion date: 2026-04-18
- `ticket corrections applied`: Re-blessed `FITL_1964_CANARY_SEEDS` from `[1020, 1040, 1049, 1054, 2046]` to `[1020, 1049, 1054]` after live verification showed seeds `1040` and `2046` now stop at `maxTurns` under the current kernel for both variants; user approved the Spec 136 seed-set maintenance path.
- Added the new `packages/engine/test/policy-profile-quality/` corpus with one convergence-witness file per FITL profile variant, each carrying the required `@profile-variant` marker and asserting `terminal` on the re-blessed seed set.
- Added `ALL_POLICY_PROFILE_QUALITY_TESTS` to `packages/engine/scripts/test-lane-manifest.mjs`, added the `policy-profile-quality` lane plus `ENGINE_TEST_PROGRESS_LANE` propagation in `packages/engine/scripts/run-tests.mjs`, and added `test:policy-profile-quality` to `packages/engine/package.json`.
- Confirmed the live `default` lane is a named subset rather than a global `dist/test/**/*.test.js` glob, then extended it to include the new `policy-profile-quality` corpus explicitly.
- Added unit coverage proving the new lane shape and the corpus-isolation/default-inclusion taxonomy invariants.
- Verification set: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:policy-profile-quality`, `pnpm -F @ludoforge/engine test:unit`, `pnpm -F @ludoforge/engine test:determinism`, `pnpm run check:ticket-deps`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`.
