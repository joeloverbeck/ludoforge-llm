// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime, initialState, publishMicroturn } from '../../../src/kernel/index.js';
import { getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';
import { defineProbe } from './define-probe.js';
import { runProbe } from './probe-runner.js';
import type { ProbeLoadedGame, ScenarioId } from './probe-types.js';

const TEXAS_GAME = 'texas-holdem' as const;
const TEXAS_SCENARIO = 'default' as ScenarioId;
const SEED = 1000;

const loadTexasGame = (): ProbeLoadedGame => {
  const def = getTexasProductionFixture().gameDef;
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 2,
    scenario: TEXAS_SCENARIO,
  };
};

const noAssertionProbe = defineProbe({
  id: 'texas-first-action-selection',
  game: TEXAS_GAME,
  profile: 'default',
  seat: '0',
  stateBinding: {
    scenario: TEXAS_SCENARIO,
    seed: SEED,
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'first',
  },
  assertions: [],
  severity: 'architecturalInvariant',
  tags: ['scaffold'],
});

describe('policy probe runner scaffold', () => {
  it('walks a no-assertion probe and records the selected published decision', () => {
    const result = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.equal(result.aggregateOutcome.kind, 'pass');
    const match = result.perSeedOutcomes[0]?.matches[0];
    assert.ok(match, 'expected one matched decision');
    assert.equal(match.contextKind, 'actionSelection');
    assert.equal(match.selectedDecision.kind, 'actionSelection');
    assert.ok(match.trace, 'expected policy trace');
  });

  it('applies replayPrefix before matching decisions', () => {
    const loaded = loadTexasGame();
    const initial = initialState(loaded.def, SEED, loaded.playerCount, undefined, loaded.runtime).state;
    const microturn = publishMicroturn(loaded.def, initial, loaded.runtime);
    const replayDecision = microturn.legalActions[0];
    assert.ok(replayDecision, 'expected at least one initial legal action');

    const replayProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-replay-prefix',
      stateBinding: {
        scenario: TEXAS_SCENARIO,
        seed: SEED,
        replayPrefix: [replayDecision],
      },
    });

    const result = runProbe(replayProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.equal(result.aggregateOutcome.kind, 'pass');
    assert.notEqual(result.perSeedOutcomes[0]?.matches[0]?.stateHash, `0x${initial.stateHash.toString(16)}`);
  });

  it('produces deterministic aggregate outcome and trace byte count', () => {
    const first = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    const second = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.deepEqual(second.aggregateOutcome, first.aggregateOutcome);
    assert.equal(second.traceBytes, first.traceBytes);
  });

  it('reports state hash drift instead of hanging or silently passing', () => {
    const driftProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-state-hash-drift',
      stateBinding: {
        scenario: TEXAS_SCENARIO,
        seed: SEED,
        expectedStateHash: '0x0',
      },
    });

    const result = runProbe(driftProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.equal(result.aggregateOutcome.kind, 'error');
    assert.match(result.perSeedOutcomes[0]?.outcome.kind === 'error' ? result.perSeedOutcomes[0].outcome.message : '', /state hash drift/u);
  });
});
