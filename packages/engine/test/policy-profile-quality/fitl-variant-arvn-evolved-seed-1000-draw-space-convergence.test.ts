// @test-class: convergence-witness
// @profile-variant: arvn-evolved

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const MAX_TURNS = 600;
const PLAYER_COUNT = 4;

describe('FITL arvn-evolved seed 1000 draw-space convergence witness', () => {
  it('keeps the former draw-space witness bounded and non-throwing', { timeout: 15_000 }, () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);

    const agents = (def.seats ?? []).map((seat) => {
      const profileId = seat.id.toLowerCase() === 'arvn'
        ? 'arvn-evolved'
        : `${seat.id.toLowerCase()}-baseline`;
      return new PolicyAgent({ profileId, traceLevel: 'summary' });
    });

    const trace = runGame(def, 1000, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
    const passed = trace.stopReason === 'terminal' || trace.stopReason === 'noLegalMoves';
    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: 1000,
      passed,
      stopReason: trace.stopReason,
      decisions: trace.decisions.length,
    });

    assert.equal(
      passed,
      true,
      `seed 1000 should terminate without exhausting the profile-quality turn budget, got ${trace.stopReason}`,
    );
    assert.ok(trace.decisions.length > 0, 'seed 1000 must produce at least one move');
  });
});
