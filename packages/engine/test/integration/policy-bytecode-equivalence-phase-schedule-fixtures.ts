import type {
  CompiledAgentPolicyRef,
  CompiledPolicyConsideration,
  CompiledPolicyExpr,
  GameDef,
} from '../../src/kernel/index.js';
import {
  makeScheduleRefDef,
  scheduleDistanceRef,
} from '../unit/agents/schedule-ref-test-fixtures.js';

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
} as const;

const literalExpr = (value: string | number | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): CompiledPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (
  op: Extract<CompiledPolicyExpr, { readonly kind: 'op' }>['op'],
  ...args: readonly CompiledPolicyExpr[]
): CompiledPolicyExpr => ({ kind: 'op', op, args });

const phaseIntrinsicRef = (name: 'current.id' | 'next.id') => ({
  kind: 'phaseIntrinsic',
  name,
}) as const;

export const defWithScheduleUnitRates = (): GameDef => {
  const scheduleDef = makeScheduleRefDef();
  return {
    ...scheduleDef,
    phaseBoundaries: scheduleDef.phaseBoundaries!.map((boundary) => boundary.schedule?.kind === 'cardDraw'
      ? {
          ...boundary,
          schedule: {
            ...boundary.schedule,
            unitRates: { microturns: 3, actions: 2, turns: 5, rounds: 7 },
          },
        }
      : boundary),
  };
};

export const scheduleScoreConsideration = (): CompiledPolicyConsideration => ({
  scopes: ['move'],
  costClass: 'state',
  when: opExpr('gte', refExpr(scheduleDistanceRef('coupEntry', 'cards')), literalExpr(1)),
  weight: refExpr(scheduleDistanceRef('coupEntry', 'turns')),
  value: opExpr('boolToNumber', opExpr('eq', refExpr(phaseIntrinsicRef('current.id')), literalExpr('main'))),
  scheduleFallback: { onUnavailable: 'noContribution' },
  dependencies: emptyDependencies,
});

export const schedulePreviewCandidateFeatureExpr = (): CompiledPolicyExpr => opExpr(
  'add',
  refExpr(scheduleDistanceRef('coupEntry', 'actions')),
  opExpr('boolToNumber', opExpr('eq', refExpr(phaseIntrinsicRef('next.id')), literalExpr('scoring'))),
);

export const unavailableScheduleFallbackConsideration = (): CompiledPolicyConsideration => ({
  scopes: ['move'],
  costClass: 'state',
  weight: literalExpr(1),
  value: refExpr(scheduleDistanceRef('coupEntry', 'cards')),
  scheduleFallback: { onUnavailable: 'noContribution' },
  dependencies: emptyDependencies,
});

export const topNVisibleScheduleFallbackConsideration = (
  visiblePrefixExhausted:
    | 'useLowerBound'
    | 'noContribution'
    | 'dropConsideration'
    | { readonly kind: 'constant'; readonly value: number } = 'useLowerBound',
  clamp?: CompiledPolicyConsideration['clamp'],
): CompiledPolicyConsideration => ({
  scopes: ['move'],
  costClass: 'state',
  weight: literalExpr(10),
  value: refExpr(scheduleDistanceRef('coupEntry', 'cards')),
  scheduleFallback: {
    onUnavailable: { kind: 'constant', value: 99 },
    onPartial: { visiblePrefixExhausted },
  },
  ...(clamp === undefined ? {} : { clamp }),
  dependencies: emptyDependencies,
});
