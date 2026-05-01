// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Uses the fallback short-deck fixture path from 150LIFECYCONTR-002. The
// historical full-production seed was too expensive for a fast integration
// sentinel, so this isolates the same FITL-style accumulating deck lifecycle.
import { createSeededChoiceAgents } from '../helpers/test-agents.js';
import { createLifecycleStalledFitlDef } from '../fixtures/lifecycle-stalled-fitl.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';

const SEED = 343912;
const MAX_TURNS = 10;
const PLAYER_COUNT = 4;

const runShortDeckFitl = () => {
  const def = assertValidatedGameDef(createLifecycleStalledFitlDef());
  const runtime = createGameDefRuntime(def);
  return runGame(
    def,
    SEED,
    createSeededChoiceAgents(PLAYER_COUNT),
    MAX_TURNS,
    PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );
};

const cardLifecycleZones = (trace: ReturnType<typeof runShortDeckFitl>) => {
  const turnOrder = trace.finalState.turnOrderState;
  assert.equal(turnOrder.type, 'cardDriven');
  return {
    draw: trace.finalState.zones['deck:none'] ?? [],
    lookahead: trace.finalState.zones['lookahead:none'] ?? [],
  };
};

describe('FITL deck exhaustion produces lifecycle-stalled terminal', () => {
  it('runGame stops with noLegalMoves and lifecycleStatus.stalled=true', () => {
    const trace = runShortDeckFitl();

    assert.equal(trace.stopReason, 'noLegalMoves');
    assert.equal(trace.finalState.turnOrderState.type, 'cardDriven');
    assert.equal(trace.finalState.turnOrderState.runtime.lifecycleStatus.stalled, true);

    const { draw, lookahead } = cardLifecycleZones(trace);
    assert.equal(draw.length, 0);
    assert.equal(lookahead.length, 0);
  });

  it('replay produces identical lifecycleStatus and stateHash', () => {
    const trace1 = runShortDeckFitl();
    const trace2 = runShortDeckFitl();

    assert.equal(
      trace1.finalState.turnOrderState.type === 'cardDriven'
        ? trace1.finalState.turnOrderState.runtime.lifecycleStatus.stalled
        : false,
      trace2.finalState.turnOrderState.type === 'cardDriven'
        ? trace2.finalState.turnOrderState.runtime.lifecycleStatus.stalled
        : false,
    );
    assert.equal(trace1.finalState.stateHash, trace2.finalState.stateHash);
  });
});
