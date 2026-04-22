// @test-class: convergence-witness
// @profile-variant: campaign-seat-mapping

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  serializeTrace,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
const TEST_FILE = fileURLToPath(import.meta.url);

describe('FITL campaign-seat-mapping seed 1000 convergence witness', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const runOnce = () => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );
    return runGame(def, 1000, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
  };

  it('keeps the campaign seat mapping non-throwing and within the turn budget', { timeout: 15_000 }, () => {
    const trace = runOnce();
    const passed = ALLOWED_STOP_REASONS.has(trace.stopReason);

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'campaign-seat-mapping',
      seed: 1000,
      passed,
      stopReason: trace.stopReason,
      decisions: trace.decisions.length,
    });

    assert.equal(
      passed,
      true,
      `seed 1000: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason} after ${trace.decisions.length} decisions`,
    );
    assert.ok(trace.decisions.length > 0, 'seed 1000 should advance at least one decision');
    assert.ok(
      trace.compoundTurns.length <= MAX_TURNS,
      `seed 1000 exceeded ${MAX_TURNS} compound turns`,
    );
  });

  it('remains deterministic across repeated runs', { timeout: 20_000 }, () => {
    const first = JSON.stringify(serializeTrace(runOnce()));
    const second = JSON.stringify(serializeTrace(runOnce()));

    assert.equal(first, second);
  });
});
