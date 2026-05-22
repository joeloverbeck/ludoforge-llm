// @test-class: architectural-invariant
//
// FITL determinism-parity drive perf gate (POLPREVDRIVE-006).
//
// Mirrors the parity workload shape that surfaced the spec-145/146/147
// drive-perf regression: four FITL baseline profiles concurrent
// (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`) running
// `runGame` under `kernel.verifyIncrementalHash: true`. The existing
// `preview-pipeline.perf.test.ts` exercises one profile at a time and does
// NOT enable incremental-hash verification, so a regression on this combined
// path slipped past the campaign benchmarks and was only caught when CI
// `zobrist-incremental-parity-fitl-*` shards timed out at 30 minutes.
//
// This gate runs in under a wall-clock ceiling so future drive-perf
// regressions are caught at PR review time instead of in the 30-minute CI
// shard.
//
// Calibration
// -----------
// Calibration commit:    promoted-arvn-evolved (arvn-baseline now preview-only)
// Calibration date:      2026-05-22
// Calibration command:   node packages/engine/scripts/profile-fitl-preview-drive.mjs \
//                          --seed 42 --maxTurns 10 --profilesAll
// Calibration runs (ms): 55410, 60732, 56234 (local median ~56000)
// CI observation (ms):   120113 (run 26267333916; CI hardware ~2.14× local)
// Wall-clock ceiling:    240000 ms (~2× the CI-observed wall-clock)
//
// Why anchored to CI, not local: the promoted arvn-baseline is preview-only
// (its sole move consideration `preferOptionProjectedMargin` is costClass:
// preview), so every arvn decision drives the bounded preview pipeline. That
// widened the CI/local ratio to ~2.14×, so ~2× the LOCAL median (~112000) no
// longer clears the CI wall-clock. The ceiling is set to ~2× the CI-observed
// time, preserving the same ">=2x regression" sensitivity the prior
// 75000/37000 calibration had relative to its own environment.
//
// Prior calibration (pre-promotion, light arvn-baseline):
//   commit eed7384d (post-POLPREVDRIVE-005), 2026-04-28
//   local runs 36895/37556/36981 (median ~37000), ceiling 75000 (~2× median)
//
// Recalibration policy
// --------------------
// Raise the ceiling ONLY when a legitimate workload growth (added profile,
// deeper drive, expanded effects) explains the new floor. Do not raise it to
// silence a regression — investigate first using the harness above. To
// recalibrate after a legitimate growth, re-run the harness three times and
// take the local median. Set `WALL_CLOCK_CEILING_MS` to ~2× the local median
// when CI tracks local closely; when the CI/local ratio is materially above
// 2× (as it is for preview-heavy profiles), anchor to ~2× the CI-observed
// wall-clock instead so the gate does not false-positive in CI. Update the
// calibration block above with the new commit, date, raw measurements, and
// the CI observation in the same commit.
//
// Note on historical regression detection
// ---------------------------------------
// POLPREVDRIVE-006 acceptance criterion #2 specified the gate must "fail
// when run against the pre-POLPREVDRIVE-001 commit 7677e4d8" to prove it
// would have caught the original regression. The post-POLPREVDRIVE-005
// wall-clock (~37000 ms) is essentially identical to the original PR-side
// wall-clock from POLPREVDRIVE-001 (34917 ms) because POLPREVDRIVE-002's
// fast-path gain was reverted by the soundness fix in 51a5a6bb, and
// POLPREVDRIVE-003/004/005 produced wall-clock movements within noise.
// A ceiling that catches the historical regression would also fail at
// today's calibration, so the gate is published as a forward-looking
// regression tripwire rather than a back-detector. See ticket Outcome.

import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const FITL_BASELINE_PROFILES = [
  'us-baseline',
  'arvn-baseline',
  'nva-baseline',
  'vc-baseline',
] as const;

const WORKLOAD = {
  seed: 42,
  maxTurns: 10,
  playerCount: 4,
} as const;

const WALL_CLOCK_CEILING_MS = 240_000;

describe('POLPREVDRIVE-006 FITL parity drive perf gate', () => {
  it(`runs 4 baseline profiles under verifyIncrementalHash within ${WALL_CLOCK_CEILING_MS} ms`, () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);

    const elapsedMs = measure(def, runtime);

    assert.ok(
      Number.isFinite(elapsedMs) && elapsedMs > 0,
      `Expected positive elapsedMs, got ${elapsedMs}.`,
    );
    assert.ok(
      elapsedMs <= WALL_CLOCK_CEILING_MS,
      `POLPREVDRIVE_PARITY_PERF_REGRESSION elapsedMs=${round2(elapsedMs)} ` +
      `ceilingMs=${WALL_CLOCK_CEILING_MS} ` +
      `seed=${WORKLOAD.seed} maxTurns=${WORKLOAD.maxTurns} ` +
      `profiles=${FITL_BASELINE_PROFILES.join(',')} verifyIncrementalHash=true`,
    );
  });
});

function measure(
  def: ReturnType<typeof assertValidatedGameDef>,
  runtime: ReturnType<typeof createGameDefRuntime>,
): number {
  const agents: Agent[] = FITL_BASELINE_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
  );

  const startedAt = performance.now();
  runGame(
    def,
    WORKLOAD.seed,
    agents,
    WORKLOAD.maxTurns,
    WORKLOAD.playerCount,
    {
      kernel: { verifyIncrementalHash: true },
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
    },
    runtime,
  );
  return performance.now() - startedAt;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
