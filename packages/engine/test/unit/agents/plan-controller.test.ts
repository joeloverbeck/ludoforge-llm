// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planExecutionKey, type PlanExecutionStateStore } from '../../../src/agents/plan-execution.js';
import { selectPlanControlledDecision } from '../../../src/agents/plan-controller.js';
import {
  asDecisionFrameId,
  asSeatId,
  asTurnId,
  type AgentPolicyCatalog,
  type CompiledAgentDependencyRefs,
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

describe('plan controller', () => {
  it('matches authored constant step values for enum decisions', () => {
    const def = createSyntheticDecisionDef();
    const store: PlanExecutionStateStore = new Map();
    store.set(planExecutionKey(asTurnId(1), asSeatId('0')), {
      selectedTemplate: 'chooseRight',
      intent: 'chooseRight',
      roleBindings: {
        placeholder: {
          role: 'placeholder',
          selectedId: 'unused',
          quality: 0,
          rank: 0,
          components: {},
        },
      },
      nextStepIndex: 0,
      fallbackHistory: [],
      deviations: [],
      turnId: '1',
      seatId: '0',
    });

    const result = selectPlanControlledDecision({
      def,
      catalog: {
        library: {
          planTemplates: {
            chooseRight: {
              traceLabel: 'choose right',
              root: { actionTags: [], actionIds: ['branch'] },
              roles: {
                placeholder: {
                  selectorId: 'unused' as never,
                  required: false,
                  constraints: [],
                  selector: {
                    selectorId: 'unused' as never,
                    role: 'placeholder',
                    scopes: ['move'],
                    source: { kind: 'collection', collection: { kind: 'players' } },
                    result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
                    costClass: 'state',
                    dependencies: emptyDependencies(),
                    refs: {
                      id: 'role.placeholder.id',
                      quality: 'role.placeholder.quality',
                      rank: 'role.placeholder.rank',
                      components: 'role.placeholder.components',
                    },
                  },
                },
              },
              steps: [{
                label: 'choose-enum',
                role: 'placeholder',
                match: {
                  decisionKind: 'chooseOne',
                  targetKind: 'value',
                  decisionPath: '$pick',
                  selectedValue: 'right',
                },
              }],
              caps: { capClass: 'standard256', maxSteps: 1 },
              fallback: {},
              dependencies: emptyDependencies(),
            },
          },
        },
      } as unknown as AgentPolicyCatalog,
      store,
      turnId: asTurnId(1),
      seatId: '0',
      legalActions: [
        { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'left' },
        { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'right' },
      ],
      decisionContext: {
        kind: 'chooseOne',
        seatId: asSeatId('0'),
        decisionKey: '$pick' as DecisionKey,
        options: [],
        targetKinds: ['value'],
        stageIndex: 0,
      },
    });

    assert.equal(result?.decision.kind, 'chooseOne');
    assert.equal(result?.decision.value, 'right');
    assert.equal(result?.planTrace.microturns?.[0]?.match, 'exact');
  });
});

function emptyDependencies(): CompiledAgentDependencyRefs {
  return {
    parameters: [],
    candidateFeatures: [],
    stateFeatures: [],
    aggregates: [],
    selectors: [],
    strategicConditions: [],
  };
}
