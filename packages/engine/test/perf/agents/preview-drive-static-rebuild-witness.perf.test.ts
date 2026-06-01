// @test-class: convergence-witness
// @witness: 172POLEVASTA-001
//
// Phase 0 regression witness for Spec 172. 172POLEVASTA-007 proved that the
// remaining encoded-state builds are unique preview-state first touches, while
// duplicate static/runtime-cache rebuilds stay eliminated.
//
// Spec 188 retarget: the four FITL profiles now carry plan/posture evaluators
// whose expressions reference zone props/lookups beyond the base feature table.
// Each is compiled exactly once via the shared runtime bytecode cache (no
// duplicates), raising the first-touch static budget from 4 to 8. The hard
// invariant — duplicateEncodedStateRebuilds === 0 — remains unchanged.
//
// Spec 204 retarget: FITL VC commitment mechanics add one additional unique
// evaluator expression to the four-profile workload, raising the first-touch
// static budget from 8 to 9. Each new expression still compiles exactly once
// via the shared runtime bytecode cache, so the hard invariant remains intact.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import { __policyEncodedStateCache_internal_for_tests as encodedStateCacheInternals } from '../../../src/agents/policy-encoded-state-cache.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { __compile_internal_for_tests as compileInternals } from '../../../src/cnl/policy-bytecode/compile.js';
import { __featureTable_internal_for_tests as featureTableInternals } from '../../../src/cnl/policy-bytecode/feature-table.js';
import { __layout_internal_for_tests as layoutInternals } from '../../../src/kernel/encoded-state/layout.js';
import { __view_internal_for_tests as encodedStateInternals } from '../../../src/kernel/encoded-state/view.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const WORKLOAD = {
  seed: 1013,
  maxTurns: 1,
  playerCount: 4,
  profiles: ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
} as const;

const FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD = 9;
const DUPLICATE_ENCODED_STATE_REBUILD_THRESHOLD = 0;

describe('172POLEVASTA-001 preview-drive static rebuild witness', () => {
  it('eliminates duplicate static and encoded-state rebuilds', () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);

    resetStaticRebuildCounters();
    runPreviewDriveWorkload(def);
    const counts = snapshotStaticRebuildCounts();
    const total = staticRebuildCount(counts);
    const staticOnlyTotal = staticOnlyRebuildCount(counts);
    const duplicateEncodedStateRebuilds = counts.buildEncodedStateCount
      - counts.policyEncodedStateCacheMissCount;
    const witnessLine = `172POLEVASTA_STATIC_REBUILD_WITNESS total=${total} ` +
      `threshold=${FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD} ` +
      `staticOnlyTotal=${staticOnlyTotal} ` +
      `duplicateEncodedStateRebuilds=${duplicateEncodedStateRebuilds} ` +
      `duplicateEncodedStateThreshold=${DUPLICATE_ENCODED_STATE_REBUILD_THRESHOLD} ` +
      `buildEncodedStateLayout=${counts.buildEncodedStateLayoutCount} ` +
      `buildFeatureTable=${counts.buildFeatureTableCount} ` +
      `buildExpressionFeatureTable=${counts.buildExpressionFeatureTableCount} ` +
      `buildEncodedState=${counts.buildEncodedStateCount} ` +
      `policyEncodedStateCacheObjectHit=${counts.policyEncodedStateCacheObjectHitCount} ` +
      `policyEncodedStateCacheHashHit=${counts.policyEncodedStateCacheHashHitCount} ` +
      `policyEncodedStateCacheMiss=${counts.policyEncodedStateCacheMissCount} ` +
      `seed=${WORKLOAD.seed} maxTurns=${WORKLOAD.maxTurns} profiles=${WORKLOAD.profiles.join(',')}`;

    console.warn(witnessLine);

    assert.ok(total > 0, 'Expected the preview-drive workload to exercise static rebuild counters.');
    assert.ok(
      staticOnlyTotal <= FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD
        && duplicateEncodedStateRebuilds <= DUPLICATE_ENCODED_STATE_REBUILD_THRESHOLD
        && counts.policyEncodedStateCacheObjectHitCount > 0
        && counts.policyEncodedStateCacheHashHitCount > 0,
      witnessLine,
    );
  });
});

function runPreviewDriveWorkload(def: ValidatedGameDef): void {
  const runtime = createGameDefRuntime(def);
  const agents: Agent[] = WORKLOAD.profiles.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'none' }),
  );
  runGame(
    def,
    WORKLOAD.seed,
    agents,
    WORKLOAD.maxTurns,
    WORKLOAD.playerCount,
    { skipDeltas: true, traceRetention: 'finalStateOnly' },
    runtime,
  );
}

function resetStaticRebuildCounters(): void {
  layoutInternals.resetBuildEncodedStateLayoutCount();
  featureTableInternals.resetBuildFeatureTableCount();
  compileInternals.resetBuildExpressionFeatureTableCount();
  encodedStateInternals.resetBuildEncodedStateCount();
  encodedStateCacheInternals.resetCounts();
}

function snapshotStaticRebuildCounts(): {
  readonly buildEncodedStateLayoutCount: number;
  readonly buildFeatureTableCount: number;
  readonly buildExpressionFeatureTableCount: number;
  readonly buildEncodedStateCount: number;
  readonly policyEncodedStateCacheObjectHitCount: number;
  readonly policyEncodedStateCacheHashHitCount: number;
  readonly policyEncodedStateCacheMissCount: number;
} {
  return {
    buildEncodedStateLayoutCount: layoutInternals.getBuildEncodedStateLayoutCount(),
    buildFeatureTableCount: featureTableInternals.getBuildFeatureTableCount(),
    buildExpressionFeatureTableCount: compileInternals.getBuildExpressionFeatureTableCount(),
    buildEncodedStateCount: encodedStateInternals.getBuildEncodedStateCount(),
    policyEncodedStateCacheObjectHitCount: encodedStateCacheInternals.getObjectHitCount(),
    policyEncodedStateCacheHashHitCount: encodedStateCacheInternals.getHashHitCount(),
    policyEncodedStateCacheMissCount: encodedStateCacheInternals.getMissCount(),
  };
}

function staticRebuildCount(counts: ReturnType<typeof snapshotStaticRebuildCounts>): number {
  return counts.buildEncodedStateLayoutCount
    + counts.buildFeatureTableCount
    + counts.buildExpressionFeatureTableCount
    + counts.buildEncodedStateCount;
}

function staticOnlyRebuildCount(counts: ReturnType<typeof snapshotStaticRebuildCounts>): number {
  return counts.buildEncodedStateLayoutCount
    + counts.buildFeatureTableCount
    + counts.buildExpressionFeatureTableCount;
}
