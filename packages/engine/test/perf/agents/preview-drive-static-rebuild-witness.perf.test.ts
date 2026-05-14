// @test-class: convergence-witness
// @witness: 172POLEVASTA-001
// @profile-variant: arvn-evolved
//
// Phase 0 red witness for Spec 172. This assertion is expected to fail until
// 172POLEVASTA-002..006 route the preview path through first-touch-only caches.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
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
  profiles: ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
} as const;

const FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD = 4;

describe('172POLEVASTA-001 preview-drive static rebuild witness', () => {
  it('exceeds the first-touch-only static rebuild threshold before Spec 172 caches land', () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);

    resetStaticRebuildCounters();
    runPreviewDriveWorkload(def);
    const counts = snapshotStaticRebuildCounts();
    const total = staticRebuildCount(counts);

    assert.ok(total > 0, 'Expected the preview-drive workload to exercise static rebuild counters.');
    assert.ok(
      total <= FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD,
      `172POLEVASTA_STATIC_REBUILD_WITNESS total=${total} ` +
      `threshold=${FIRST_TOUCH_ONLY_STATIC_REBUILD_THRESHOLD} ` +
      `buildEncodedStateLayout=${counts.buildEncodedStateLayoutCount} ` +
      `buildFeatureTable=${counts.buildFeatureTableCount} ` +
      `buildExpressionFeatureTable=${counts.buildExpressionFeatureTableCount} ` +
      `buildEncodedState=${counts.buildEncodedStateCount} ` +
      `seed=${WORKLOAD.seed} maxTurns=${WORKLOAD.maxTurns} profiles=${WORKLOAD.profiles.join(',')}`,
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
}

function snapshotStaticRebuildCounts(): {
  readonly buildEncodedStateLayoutCount: number;
  readonly buildFeatureTableCount: number;
  readonly buildExpressionFeatureTableCount: number;
  readonly buildEncodedStateCount: number;
} {
  return {
    buildEncodedStateLayoutCount: layoutInternals.getBuildEncodedStateLayoutCount(),
    buildFeatureTableCount: featureTableInternals.getBuildFeatureTableCount(),
    buildExpressionFeatureTableCount: compileInternals.getBuildExpressionFeatureTableCount(),
    buildEncodedStateCount: encodedStateInternals.getBuildEncodedStateCount(),
  };
}

function staticRebuildCount(counts: ReturnType<typeof snapshotStaticRebuildCounts>): number {
  return counts.buildEncodedStateLayoutCount
    + counts.buildFeatureTableCount
    + counts.buildExpressionFeatureTableCount
    + counts.buildEncodedStateCount;
}
