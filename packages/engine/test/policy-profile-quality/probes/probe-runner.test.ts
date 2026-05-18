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
  seat: 'neutral',
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
    assert.equal(match.trace, null);
  });

  it('keeps lightweight probes trace-free by default', () => {
    const result = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    const trace = result.perSeedOutcomes[0]?.matches[0]?.trace;
    assert.equal(trace, null);
  });

  it('uses summary trace when explicitly requested', () => {
    const result = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8, traceLevel: 'summary' });
    const trace = result.perSeedOutcomes[0]?.matches[0]?.trace;
    assert.ok(trace, 'expected policy trace');
    assert.equal(trace.candidates, undefined);
  });

  it('attaches a verbose trace when an assertion fails', () => {
    const failingProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-verbose-on-failure',
      assertions: [
        {
          kind: 'selectedCandidateHasTag',
          tag: '__missing_tag__',
        },
      ],
    });

    const result = runProbe(failingProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.equal(result.aggregateOutcome.kind, 'fail');
    assert.ok(result.aggregateOutcome.kind === 'fail' ? result.aggregateOutcome.trace?.candidates : undefined);
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

  it('matches only the probe-bound seat', () => {
    const wrongSeatProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-wrong-seat-filter',
      seat: '__not_the_current_seat__',
    });

    const result = runProbe(wrongSeatProbe, { loadGame: loadTexasGame, maxDecisionSteps: 1 });
    assert.equal(result.aggregateOutcome.kind, 'error');
    assert.equal(result.perSeedOutcomes[0]?.matches.length, 0);
  });

  it('produces deterministic aggregate outcome and trace byte count', () => {
    const first = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    const second = runProbe(noAssertionProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.deepEqual(second.aggregateOutcome, first.aggregateOutcome);
    assert.equal(second.traceBytes, first.traceBytes);
  });

  it('evaluates seed-range distribution assertions over the aggregate match window', () => {
    const aggregateProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-aggregate-action-distribution',
      stateBinding: {
        scenario: TEXAS_SCENARIO,
        seedRange: { start: 1000, end: 1001 },
      },
      decisionBinding: {
        contextKind: 'actionSelection',
        occurrence: 'every',
      },
      assertions: [
        {
          kind: 'actionFamilyDistributionBelow',
          family: 'any',
          threshold: 1.01,
          windowMinDecisions: 2,
        },
      ],
    });

    const result = runProbe(aggregateProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
    assert.equal(result.aggregateOutcome.kind, 'pass');
    assert.equal(result.perSeedOutcomes.some((outcome) => outcome.outcome.kind === 'error'), false);
    assert.equal(result.perSeedOutcomes.reduce((count, outcome) => count + outcome.matches.length, 0), 2);
  });

  it('caps aggregate probes to a bounded number of matches per seed', () => {
    const aggregateProbe = defineProbe({
      id: 'texas-aggregate-per-seed-cap',
      game: 'texas-holdem',
      profile: 'texas-baseline',
      seat: 'neutral',
      stateBinding: {
        scenario: 'texas-default',
        seedRange: { start: 1000, end: 1002 },
        maxMatchesPerSeed: 1,
      },
      decisionBinding: {
        contextKind: 'actionSelection',
        occurrence: 'every',
      },
      assertions: [{
        kind: 'actionFamilyDistributionBelow',
        family: 'any',
        threshold: 1.01,
        windowMinDecisions: 2,
      }],
      severity: 'profileQuality',
      tags: ['test'],
    });

    const result = runProbe(aggregateProbe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });

    assert.equal(result.aggregateOutcome.kind, 'pass');
    assert.deepEqual(result.perSeedOutcomes.map((outcome) => outcome.matches.length), [1, 1]);
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

  it('reports terminal before match instead of publishing past the end of the game', () => {
    const terminalBeforeMatchProbe = defineProbe({
      ...noAssertionProbe,
      id: 'texas-terminal-before-match',
      decisionBinding: {
        contextKind: 'actionSelection',
        occurrence: { kind: 'nth', n: 999 },
      },
    });

    const result = runProbe(terminalBeforeMatchProbe, { loadGame: loadTexasGame, maxDecisionSteps: 256 });
    assert.equal(result.aggregateOutcome.kind, 'error');
    assert.match(result.perSeedOutcomes[0]?.outcome.kind === 'error' ? result.perSeedOutcomes[0].outcome.message : '', /terminal state/u);
  });
});
