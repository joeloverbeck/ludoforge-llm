// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';
import { probes } from './architectural/constructibility-published.probe.js';
import { runProbe } from './probe-runner.js';
import type { ProbeLoadedGame, ProbeLoadGameRequest } from './probe-types.js';

const loadTexasGame = (request: ProbeLoadGameRequest): ProbeLoadedGame => {
  const def = getTexasProductionFixture().gameDef;
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 2,
    scenario: request.scenario,
  };
};

describe('architectural policy probes', () => {
  for (const probe of probes) {
    it(probe.id, () => {
      const result = runProbe(probe, { loadGame: loadTexasGame, maxDecisionSteps: 8 });
      assert.equal(result.aggregateOutcome.kind, 'pass');
      const matchedCount = result.perSeedOutcomes.reduce((count, outcome) => count + outcome.matches.length, 0);
      assert.ok(matchedCount > 0, 'expected the architectural probe to inspect at least one published frontier');
    });
  }
});
