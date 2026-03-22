import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyMove,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
  probeMoveViability,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

describe('Texas Hold\'em policy agent integration', () => {
  it('compiles the production Texas spec with an authored neutral policy binding', () => {
    const { compiled } = compileTexasProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.bindingsBySeat, {
      neutral: 'baseline',
    });
  });

  it('chooses only legal production Texas moves through the generic PolicyAgent', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const seeded = initialState(def, 23, 4).state;
    const state = advanceToDecisionPoint(def, seeded);
    const moves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const agent = new PolicyAgent();

    const selected = agent.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: moves,
      rng: createRng(23n),
      runtime,
    });
    const viability = probeMoveViability(def, state, selected.move, runtime);

    assert.equal(viability.viable, true);
    if (!viability.viable) {
      assert.fail('expected selected Texas move to remain viable');
    }
    assert.equal(viability.complete, true);
    assert.doesNotThrow(() => applyMove(def, state, selected.move, undefined, runtime));
    assert.equal(selected.agentDecision?.kind, 'policy');
    if (selected.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(selected.agentDecision.seatId, 'neutral');
    assert.equal(selected.agentDecision.resolvedProfileId, 'baseline');
    assert.equal(selected.agentDecision.emergencyFallback, false);
  });

  it('keeps Texas policy choice invariant when only acting-seat-invisible hidden cards change', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const seeded = initialState(def, 29, 2).state;
    const state = advanceToDecisionPoint(def, seeded);
    const agent = new PolicyAgent();
    const opponentPlayer = Number(state.activePlayer) === 0 ? 1 : 0;
    const opponentZoneId = `hand:${opponentPlayer}`;
    const opponentCards = state.zones[opponentZoneId] ?? [];

    assert.equal(opponentCards.length >= 2, true, 'expected opponent to hold two hidden cards');

    const swappedState = {
      ...state,
      zones: {
        ...state.zones,
        [opponentZoneId]: [...opponentCards].reverse(),
      },
    };
    const baseMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const swappedMoves = enumerateLegalMoves(def, swappedState, undefined, runtime).moves;

    const left = agent.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: baseMoves,
      rng: createRng(29n),
      runtime,
    });
    const right = agent.chooseMove({
      def,
      state: swappedState,
      playerId: swappedState.activePlayer,
      legalMoves: swappedMoves,
      rng: createRng(29n),
      runtime,
    });

    assert.deepEqual(right.move, left.move);
    assert.equal(left.agentDecision?.kind, 'policy');
    assert.equal(right.agentDecision?.kind, 'policy');
    if (left.agentDecision?.kind !== 'policy' || right.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(left.agentDecision.resolvedProfileId, 'baseline');
    assert.equal(right.agentDecision.resolvedProfileId, 'baseline');
  });

  it('runs fixed-seed Texas policy self-play without fallback across symmetric players', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()];

    const trace = runGame(def, 31, agents, 12, 4);

    assert.equal(trace.moves.length > 0, true);
    for (const move of trace.moves) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.seatId, 'neutral');
      assert.equal(move.agentDecision.resolvedProfileId, 'baseline');
      assert.equal(move.agentDecision.emergencyFallback, false);
    }
  });
});
