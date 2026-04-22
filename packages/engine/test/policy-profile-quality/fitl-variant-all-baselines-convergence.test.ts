// @test-class: convergence-witness
// @profile-variant: all-baselines

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const VARIANT_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const FITL_1964_CANARY_SEEDS = [
  { seed: 1020, expectedStopReason: 'terminal' },
  { seed: 1049, expectedStopReason: 'terminal' },
  { seed: 1054, expectedStopReason: 'noLegalMoves' },
] as const;
const MAX_TURNS = 300;
const PLAYER_COUNT = 4;
const TEST_FILE = fileURLToPath(import.meta.url);

describe('FITL all-baselines variant convergence witness', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  for (const { seed, expectedStopReason } of FITL_1964_CANARY_SEEDS) {
    it(`seed ${seed}: reaches expected stopReason=${expectedStopReason} within ${MAX_TURNS} decisions`, () => {
      const agents = VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
      emitPolicyProfileQualityRecord({
        file: TEST_FILE,
        variantId: 'all-baselines',
        seed,
        passed: trace.stopReason === expectedStopReason,
        stopReason: trace.stopReason,
        decisions: trace.decisions.length,
      });

      assert.equal(
        trace.stopReason,
        expectedStopReason,
        `seed ${seed} stopped with ${trace.stopReason} instead of expected ${expectedStopReason}`,
      );
    });
  }
});
