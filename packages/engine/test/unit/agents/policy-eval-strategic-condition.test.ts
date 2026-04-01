import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledStrategicCondition,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (
  op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'],
  ...args: AgentPolicyExpr[]
): AgentPolicyExpr => ({ kind: 'op', op, args });

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function createBaseDef(): GameDef {
  return {
    metadata: { id: 'strategic-cond-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'progress', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'threshold', type: 'int', init: 10, min: 0, max: 100 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: {
      schemaVersion: 2,
      catalogFingerprint: 'test',
      surfaceVisibility: {
        globalVars: {
          progress: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
          threshold: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        },
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          currentRank: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        },
        activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      parameterDefs: {},
      candidateParamDefs: {},
      library: {
        stateFeatures: {},
        candidateFeatures: {},
        candidateAggregates: {},
        pruningRules: {},
        considerations: {},
        tieBreakers: {
          rng: { kind: 'rng', costClass: 'state', dependencies: emptyDeps },
        },
        strategicConditions: {},
      },
      profiles: {
        baseline: {
          fingerprint: 'baseline',
          params: {},
          use: { pruningRules: [], considerations: [], tieBreakers: ['rng'] },
          plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
        },
      },
      bindingsBySeat: { alpha: 'baseline' },
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'alpha', value: 0 }, { seat: 'beta', value: 0 }],
      ranking: { order: 'desc', tieBreakOrder: ['alpha', 'beta'] },
    },
  };
}

function createCatalog(
  strategicConditions: Record<string, CompiledStrategicCondition>,
): AgentPolicyCatalog {
  const def = createBaseDef();
  const catalog = def.agents as AgentPolicyCatalog;
  return {
    ...catalog,
    library: {
      ...catalog.library,
      strategicConditions,
    },
  };
}

function createContext(
  strategicConditions: Record<string, CompiledStrategicCondition>,
  globalVarOverrides: Record<string, number> = {},
): PolicyEvaluationContext {
  const catalog = createCatalog(strategicConditions);
  const def = createBaseDef();
  const { state } = initialState(def, 42, 2);
  const overriddenState = {
    ...state,
    globalVars: { ...state.globalVars, ...globalVarOverrides },
  };
  return new PolicyEvaluationContext(
    {
      def,
      state: overriddenState,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    },
    [],
  );
}

// Helper: build a ref expr for a strategic condition field
function conditionRef(conditionId: string, field: 'satisfied' | 'proximity'): AgentPolicyExpr {
  return refExpr({ kind: 'strategicCondition', conditionId, field });
}

// Strategic condition whose target is: progress >= threshold (uses globalVar surface refs)
function progressGteCondition(thresholdValue: number): CompiledStrategicCondition {
  return {
    target: opExpr(
      'gte',
      refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'progress' }),
      literal(thresholdValue),
    ),
    proximity: {
      current: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'progress' }),
      threshold: thresholdValue,
    },
  };
}

describe('strategic condition evaluation', () => {
  describe('condition.X.satisfied', () => {
    it('returns true when target expression evaluates to true', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 15 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'satisfied'), undefined);
      assert.equal(result, true);
    });

    it('returns false when target expression evaluates to false', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 5 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'satisfied'), undefined);
      assert.equal(result, false);
    });
  });

  describe('condition.X.proximity', () => {
    it('returns 0.0 when current value is 0', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 0 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(result, 0);
    });

    it('returns 0.5 when current value is half of threshold', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 5 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(result, 0.5);
    });

    it('returns 1.0 when current value equals threshold', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 10 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(result, 1.0);
    });

    it('clamps to 1.0 when current value exceeds threshold', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 20 },
      );
      const result = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(result, 1.0);
    });

    it('clamps to 0.0 when current value is negative', () => {
      // Use a condition with a literal negative current
      const ctx = createContext({
        negTest: {
          target: literal(false),
          proximity: {
            current: literal(-5),
            threshold: 10,
          },
        },
      });
      const result = ctx.evaluateExpr(conditionRef('negTest', 'proximity'), undefined);
      assert.equal(result, 0);
    });

    it('returns undefined when condition has no proximity definition', () => {
      const ctx = createContext({
        boolOnly: {
          target: literal(true),
        },
      });
      const result = ctx.evaluateExpr(conditionRef('boolOnly', 'proximity'), undefined);
      assert.equal(result, undefined);
    });
  });

  describe('caching', () => {
    it('returns same value for repeated evaluations in one context', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 7 },
      );
      const first = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      const second = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(first, second);
      assert.equal(first, 0.7);
    });

    it('caches satisfied and proximity independently', () => {
      const ctx = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 7 },
      );
      const satisfied = ctx.evaluateExpr(conditionRef('readiness', 'satisfied'), undefined);
      const proximity = ctx.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.equal(satisfied, false);
      assert.equal(proximity, 0.7);
    });
  });

  describe('cache isolation between contexts', () => {
    it('separate contexts compute independent values', () => {
      const ctx1 = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 3 },
      );
      const ctx2 = createContext(
        { readiness: progressGteCondition(10) },
        { progress: 8 },
      );
      const prox1 = ctx1.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      const prox2 = ctx2.evaluateExpr(conditionRef('readiness', 'proximity'), undefined);
      assert.notEqual(prox1, prox2);
      assert.ok(Math.abs((prox1 as number) - 0.3) < 0.001);
      assert.ok(Math.abs((prox2 as number) - 0.8) < 0.001);
    });
  });
});
