import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  applyTrustedMove,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
  terminalResult,
} from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

describe('FITL policy-agent enumeration hang regression', () => {
  it('advances seed 1040 through the former ply-20 event enumeration stall', () => {
    const { compiled, parsed } = compileProductionSpec();
    assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.notEqual(compiled.gameDef, null);

    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
    const agentRngByPlayer = Array.from(
      { length: 4 },
      (_, index) => createRng(BigInt(1040) ^ (BigInt(index + 1) * AGENT_RNG_MIX)),
    );

    let state = initialState(def, 1040, 4, undefined, runtime).state;
    for (let ply = 0; ply <= 20; ply += 1) {
      assert.equal(terminalResult(def, state, runtime), null, `seed 1040 terminated before ply ${ply}`);
      const legal = enumerateLegalMoves(def, state, undefined, runtime);
      if (ply === 20) {
        assert.equal(state.activePlayer, 2);
        assert.equal(legal.moves.length, 19);
        return;
      }

      const selected = agents[state.activePlayer]!.chooseMove({
        def,
        state,
        playerId: state.activePlayer,
        legalMoves: legal.moves,
        rng: agentRngByPlayer[state.activePlayer]!,
        runtime,
      });
      agentRngByPlayer[state.activePlayer] = selected.rng;
      state = applyTrustedMove(def, state, selected.move, undefined, runtime).state;
    }

    assert.fail('expected to reach the ply-20 enumeration checkpoint');
  });
});
