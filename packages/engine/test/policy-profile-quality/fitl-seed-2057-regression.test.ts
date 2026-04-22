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

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const MAX_TURNS = 300;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
const TEST_FILE = fileURLToPath(import.meta.url);

describe('FITL seed 2057 regression', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it('keeps the former $targetSpaces crash witness bounded and non-throwing', () => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );

    const trace = runGame(def, 2057, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
    const passed = ALLOWED_STOP_REASONS.has(trace.stopReason);

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'all-baselines',
      seed: 2057,
      passed,
      stopReason: trace.stopReason,
      decisions: trace.decisions.length,
    });

    assert.equal(
      passed,
      true,
      `seed 2057: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason} after ${trace.decisions.length} decisions`,
    );
    assert.equal(trace.decisions.length > 0, true, 'seed 2057 should advance at least one move');
  });
});
