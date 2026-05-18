// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { probes } from './fire-in-the-lake/arvn-action-distribution.probe.js';
import { runProbe } from './probe-runner.js';
import type { ProbeLoadedGame, ScenarioId } from './probe-types.js';

const FITL_SCENARIO = 'fitl-default' as ScenarioId;

const loadFitlGame = (): ProbeLoadedGame => {
  const def = getFitlProductionFixture().gameDef;
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 4,
    scenario: FITL_SCENARIO,
  };
};

describe('fire-in-the-lake policy probes', () => {
  for (const probe of probes) {
    it(probe.id, () => {
      const result = runProbe(probe, { loadGame: loadFitlGame });
      if (probe.severity === 'architecturalInvariant') {
        assert.equal(result.aggregateOutcome.kind, 'pass');
      } else if (result.aggregateOutcome.kind !== 'pass') {
        console.warn('POLICY_PROFILE_QUALITY_REGRESSION', {
          probeId: probe.id,
          outcome: result.aggregateOutcome,
        });
      }
    });
  }
});
