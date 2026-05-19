// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type CompiledPolicyExpr,
  type GameDef,
  type TurnShapeEvaluatorDef,
} from '../../../src/kernel/index.js';
import { getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';
import { createStrategyModuleGameDef } from '../../unit/agents/strategy-module-test-fixtures.js';
import { probes as constructibilityProbes } from './architectural/constructibility-published.probe.js';
import { probes as turnShapePreviewDriveProbes } from './architectural/turn-shape-no-additional-preview-drive.probe.js';
import { runProbe } from './probe-runner.js';
import type { ProbeLoadedGame, ProbeLoadGameRequest } from './probe-types.js';

const emptyTurnShapeDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  guardrails: [],
  turnShapeEvaluators: [],
  strategicConditions: [],
};

const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

const createTurnShapeArchitecturalFixture = (): GameDef => {
  const base = createStrategyModuleGameDef();
  const turnShape: TurnShapeEvaluatorDef = {
    id: 'impact' as TurnShapeEvaluatorDef['id'],
    traceLabel: 'current turn impact',
    source: 'currentPreviewDrive',
    bounds: { depthCapRef: 'profile.preview.inner.depthCap', maxSyntheticDecisions: 4 },
    objectives: [{ id: 'standing' as never, value: literal(1) }],
    minimumImpact: literal(false),
    fallback: { onPreviewUnavailable: 'traceOnly' },
    costClass: 'preview',
    dependencies: emptyTurnShapeDependencies,
  };
  const agents = base.agents!;
  return {
    ...base,
    metadata: { ...base.metadata, id: 'turn-shape-architectural-fixture' },
    agents: {
      ...agents,
      compiled: {
        ...agents.compiled,
        turnShapeEvaluators: { impact: turnShape },
      },
      profiles: {
        ...agents.profiles,
        baseline: {
          ...agents.profiles.baseline!,
          use: {
            ...agents.profiles.baseline!.use,
            turnShapeEvaluators: ['impact'],
          },
          plan: {
            ...agents.profiles.baseline!.plan,
            turnShapeEvaluators: ['impact'],
          },
        },
      },
    },
  };
};

const loadArchitecturalGame = (request: ProbeLoadGameRequest): ProbeLoadedGame => {
  const def = assertValidatedGameDef(request.game === 'turn-shape-architectural-fixture'
    ? createTurnShapeArchitecturalFixture()
    : getTexasProductionFixture().gameDef);
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 2,
    scenario: request.scenario,
  };
};

describe('architectural policy probes', () => {
  const probes = [...constructibilityProbes, ...turnShapePreviewDriveProbes];

  for (const probe of probes) {
    it(probe.id, () => {
      const result = runProbe(probe, { loadGame: loadArchitecturalGame, maxDecisionSteps: 8 });
      assert.equal(result.aggregateOutcome.kind, 'pass');
      const matchedCount = result.perSeedOutcomes.reduce((count, outcome) => count + outcome.matches.length, 0);
      assert.ok(matchedCount > 0, 'expected the architectural probe to inspect at least one published frontier');
    });
  }
});
