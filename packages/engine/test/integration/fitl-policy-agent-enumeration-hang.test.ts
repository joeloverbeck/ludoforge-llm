// @test-class: convergence-witness
// @witness: 132AGESTUVIA-001
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

  it('advances seed 1012 through the former ply-59 sweep/event viability hotspot', () => {
    const { compiled, parsed } = compileProductionSpec();
    assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.notEqual(compiled.gameDef, null);

    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
    const agentRngByPlayer = Array.from(
      { length: 4 },
      (_, index) => createRng(BigInt(1012) ^ (BigInt(index + 1) * AGENT_RNG_MIX)),
    );

    // The regression guard is "enumeration does not hang" at the former
    // ply-59 hotspot — every `enumerateLegalMoves` call must return bounded
    // in finite time, the agent must reach ply 59 (or terminate cleanly
    // before it) without throwing, and no call must produce an empty
    // legal-move set while the game is live.
    let state = initialState(def, 1012, 4, undefined, runtime).state;
    for (let ply = 0; ply <= 59; ply += 1) {
      if (terminalResult(def, state, runtime) !== null) {
        return;
      }
      const legal = enumerateLegalMoves(def, state, undefined, runtime);
      assert.ok(
        legal.moves.length > 0,
        `seed 1012 ply ${ply}: enumerateLegalMoves returned no moves before termination`,
      );
      if (ply === 59) {
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
  });
});
