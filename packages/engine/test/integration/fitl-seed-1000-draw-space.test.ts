import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL seed 1000 historical draw-space regression', () => {
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

    const trace = runGame(def, 1000, agents, 200, 4, undefined, runtime);

    assert.equal(trace.stopReason, 'maxTurns');
    assert.equal(trace.moves.length, 200);
  });
});
