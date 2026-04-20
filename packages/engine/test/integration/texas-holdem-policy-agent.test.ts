// @test-class: architectural-invariant
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
    assert.deepEqual(agents.profiles.baseline?.selection, {
      mode: 'softmaxSample',
      temperature: 0.5,
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

    const selected = agent.chooseDecision({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: moves,
      rng: createRng(23n),
      runtime,
    });
    const viability = probeMoveViability(def, state, selected.move.move, runtime);

    assert.equal(viability.viable, true);
    if (!viability.viable) {
      assert.fail('expected selected Texas move to remain viable');
    }
    assert.equal(viability.complete, true);
    assert.doesNotThrow(() => applyMove(def, state, selected.move.move, undefined, runtime));
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

    const left = agent.chooseDecision({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: baseMoves,
      rng: createRng(29n),
      runtime,
    });
    const right = agent.chooseDecision({
      def,
      state: swappedState,
      playerId: swappedState.activePlayer,
      legalMoves: swappedMoves,
      rng: createRng(29n),
      runtime,
    });

    assert.deepEqual(right.move.move, left.move.move);
    assert.equal(left.agentDecision?.kind, 'policy');
    assert.equal(right.agentDecision?.kind, 'policy');
    if (left.agentDecision?.kind !== 'policy' || right.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(left.agentDecision.resolvedProfileId, 'baseline');
    assert.equal(right.agentDecision.resolvedProfileId, 'baseline');
  });

  it('compiles the Texas profile with disabled preview mode and authored stochastic selection', () => {
    const { compiled } = compileTexasProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.profiles['baseline']?.preview, { mode: 'disabled', phase1: false, phase1CompletionsPerAction: 1 },
      'Texas baseline profile should explicitly disable preview because the game relies on hidden information');
    assert.deepEqual(agents.profiles['baseline']?.selection, { mode: 'softmaxSample', temperature: 0.5 });
  });

  it('keeps Texas preview outcomes as hidden (not affected by FITL RNG tolerance)', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const seeded = initialState(def, 23, 4).state;
    const state = advanceToDecisionPoint(def, seeded);
    const moves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const result = new PolicyAgent({ traceLevel: 'summary' }).chooseDecision({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: moves,
      rng: createRng(23n),
      runtime,
    });

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
    const breakdown = result.agentDecision.previewUsage.outcomeBreakdown!;
    assert.ok(breakdown);
    assert.equal(breakdown.ready + breakdown.unknownRandom, 0,
      'Texas should not produce ready or unknownRandom outcomes — it has no preview surface refs in its score terms');
  });

  it('runs fixed-seed Texas policy self-play without fallback across symmetric players', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()];

    const trace = runGame(def, 31, agents, 12, 4);

    assert.equal(trace.decisions.length > 0, true);
    for (const move of trace.decisions) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.seatId, 'neutral');
      assert.equal(move.agentDecision.resolvedProfileId, 'baseline');
      assert.equal(move.agentDecision.emergencyFallback, false);
    }
  });

  it('produces non-trivial Texas policy action distributions across repeated seeds', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const counts = new Map<string, number>();

    for (let seed = 1; seed <= 10; seed += 1) {
      const trace = runGame(
        def,
        seed,
        [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()],
        6,
        4,
      );

      for (const move of trace.decisions) {
        assert.equal(move.decision.kind, 'actionSelection');
        assert.ok(move.decision.move);
        counts.set(String(move.decision.move.actionId), (counts.get(String(move.decision.move.actionId)) ?? 0) + 1);
      }
    }

    assert.equal(counts.size > 1, true, `expected multiple Texas action ids across seeds, got ${JSON.stringify([...counts.entries()])}`);
  });
});
