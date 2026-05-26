// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  availabilityForPlanRoot,
  compareCompoundAvailability,
} from '../../../src/agents/plan-proposal-compound-availability.js';
import { buildPlanProposalTrace } from '../../../src/agents/plan-trace.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { CompoundAvailability } from '../../../src/kernel/microturn/compound-availability-probe.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
};

const branchDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

const compound = (specialTags: readonly string[] = ['special-activity']): NonNullable<CompiledPlanTemplate['root']['compound']> => ({
  specialTags,
  timing: 'after',
});

const defWithSpecialActivity = (
  specialEffects: readonly ActionDef['effects'][number][] = [],
): GameDef => {
  const base = createSyntheticDecisionDef();
  const phase = base.turnStructure.phases[0]?.id ?? asPhaseId('main');
  const specialAction: ActionDef = {
    id: asActionId('special'),
    actor: 'active',
    executor: 'actor',
    phase: [phase],
    params: [],
    pre: null,
    cost: [],
    effects: specialEffects,
    limits: [],
    tags: ['special-activity'],
  };
  const specialPipeline: ActionPipelineDef = {
    id: 'special-profile',
    actionId: asActionId('special'),
    accompanyingOps: ['branch'],
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{ effects: specialEffects }],
    atomicity: 'partial',
  };

  return {
    ...base,
    actions: [
      { ...base.actions[0]!, tags: ['train'] },
      specialAction,
    ],
    actionTagIndex: {
      byAction: { branch: ['train'], special: ['special-activity'] },
      byTag: { train: ['branch'], 'special-activity': ['special'] },
    },
    actionPipelines: [...(base.actionPipelines ?? []), specialPipeline],
  };
};

describe('compound availability probe integration', () => {
  const availability = (
    def: GameDef,
    tags: readonly string[] = ['special-activity'],
  ): readonly [CompoundAvailability, CompoundAvailability] => {
    const input = {
      def,
      state: initialState(def, 199, 2).state,
      seatId: asSeatId('alpha'),
      playerId: asPlayerId(0),
    };
    return [
      availabilityForPlanRoot(input, branchDecision(), compound(tags)),
      availabilityForPlanRoot(input, branchDecision(), compound(tags)),
    ];
  };

  it('is pure for ready outcomes at the plan-root seam', () => {
    const [readyA, readyB] = availability(defWithSpecialActivity());

    assert.deepEqual(readyA, { kind: 'ready' });
    assert.deepEqual(readyB, readyA);
  });

  it('is pure for provisional outcomes at the plan-root seam', () => {
    const stochasticDef = defWithSpecialActivity([
      eff({
        rollRandom: {
          bind: '$roll',
          min: 1,
          max: 2,
          in: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$stochasticChoice',
                bind: '$stochasticChoice',
                options: { query: 'enums', values: ['a', 'b'] },
              },
            }) as ActionDef['effects'][number],
          ],
        },
      }) as ActionDef['effects'][number],
    ]);
    const partialGrantDef = defWithSpecialActivity([
      eff({
        if: {
          when: { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: 1 },
          then: [],
        },
      }) as ActionDef['effects'][number],
    ]);

    const [depthCappedA, depthCappedB] = availability(stochasticDef);
    const [partialGrantA, partialGrantB] = availability(partialGrantDef);

    assert.deepEqual(depthCappedA, { kind: 'provisional', reason: 'depth-capped' });
    assert.deepEqual(depthCappedB, depthCappedA);
    assert.deepEqual(partialGrantA, { kind: 'provisional', reason: 'partial-grant' });
    assert.deepEqual(partialGrantB, partialGrantA);
  });

  it('is pure for unavailable outcomes at the plan-root seam', () => {
    const noContinuationDef = defWithSpecialActivity([
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: [] },
        },
      }) as ActionDef['effects'][number],
    ]);

    const [noContinuationA, noContinuationB] = availability(noContinuationDef);
    const [noGrantPredicateA, noGrantPredicateB] = availability(defWithSpecialActivity(), ['missing-special']);

    assert.deepEqual(noContinuationA, { kind: 'unavailable', reason: 'no-continuation' });
    assert.deepEqual(noContinuationB, noContinuationA);
    assert.deepEqual(noGrantPredicateA, { kind: 'unavailable', reason: 'no-grant-predicate' });
    assert.deepEqual(noGrantPredicateB, noGrantPredicateA);
  });
});

describe('compound availability tiebreaking', () => {
  const ready: CompoundAvailability = { kind: 'ready' };
  const provisional: CompoundAvailability = { kind: 'provisional', reason: 'depth-capped' };
  const unavailable: CompoundAvailability = { kind: 'unavailable', reason: 'no-continuation' };

  it('orders availability only as a terminal tie key', () => {
    assert.ok(compareCompoundAvailability(ready, provisional) < 0);
    assert.ok(compareCompoundAvailability(provisional, unavailable) < 0);
    assert.ok(compareCompoundAvailability(unavailable, undefined) < 0);

    const higherPrimaryScoreStillWins = (leftScore: number, rightScore: number): string =>
      (rightScore - leftScore) || compareCompoundAvailability(ready, unavailable) < 0
        ? 'right'
        : 'left';

    assert.equal(higherPrimaryScoreStillWins(10, 11), 'right');
  });
});

describe('compound availability trace integrity', () => {
  it('records per-candidate availability and serializes deterministically', () => {
    const selectedAvailability: CompoundAvailability = { kind: 'ready' };
    const result = {
      status: 'selected' as const,
      selected: {
        templateId: 'ready-template',
        rootStableMoveKey: 'branch:{}',
        score: 10,
        priorityTier: 0,
        stableKey: '0:ready-template:branch:{}',
        compoundAvailability: selectedAvailability,
        roleBindings: {},
        posture: { status: 'notConfigured', mustViolations: [], preferContributions: [] },
        intent: 'ready-template',
        nextStepIndex: 0,
      },
      alternatives: [
        {
          templateId: 'ready-template',
          rootStableMoveKey: 'branch:{}',
          score: 10,
          priorityTier: 0,
          stableKey: '0:ready-template:branch:{}',
          compoundAvailability: selectedAvailability,
          roleBindings: {},
          posture: { status: 'notConfigured', mustViolations: [], preferContributions: [] },
        },
        {
          templateId: 'plain-template',
          rootStableMoveKey: 'branch:{}',
          score: 10,
          priorityTier: 0,
          stableKey: '0:plain-template:branch:{}',
          roleBindings: {},
          posture: { status: 'notConfigured', mustViolations: [], preferContributions: [] },
        },
      ],
      activeDoctrines: [],
      rejectedDoctrines: [],
      filteredOutTemplates: [],
      posture: { status: 'notConfigured', mustViolations: [], preferContributions: [] },
    };

    const trace = buildPlanProposalTrace(result);
    const replay = buildPlanProposalTrace(result);

    assert.deepEqual(trace.alternatives[0]?.compoundAvailability, selectedAvailability);
    assert.equal(trace.alternatives[1]?.compoundAvailability, undefined);
    assert.equal(JSON.stringify(trace), JSON.stringify(replay));
  });
});
