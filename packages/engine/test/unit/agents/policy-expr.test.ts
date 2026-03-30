import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzePolicyExpr } from '../../../src/agents/policy-expr.js';
import type { AgentPolicyExpr, AgentPolicyLiteral, CompiledAgentParameterDef, CompiledAgentPolicyRef } from '../../../src/kernel/types.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function createContext(parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>> = {}) {
  return {
    parameterDefs,
    resolveRef(refPath: string) {
      switch (refPath) {
        case 'candidate.isPass':
          return {
            type: 'boolean' as const,
            costClass: 'candidate' as const,
            ref: { kind: 'candidateIntrinsic' as const, intrinsic: 'isPass' as const },
          };
        case 'candidate.param.eventCardId':
          return {
            type: 'id' as const,
            costClass: 'candidate' as const,
            ref: { kind: 'candidateParam' as const, id: 'eventCardId' },
          };
        case 'candidate.param.$targets':
          return {
            type: 'idList' as const,
            costClass: 'candidate' as const,
            ref: { kind: 'candidateParam' as const, id: '$targets' },
          };
        case 'feature.currentMargin':
          return {
            type: 'number' as const,
            costClass: 'state' as const,
            ref: { kind: 'library' as const, refKind: 'stateFeature' as const, id: 'currentMargin' },
            dependency: { kind: 'stateFeatures' as const, id: 'currentMargin' },
          };
        case 'aggregate.bestProjectedMargin':
          return {
            type: 'number' as const,
            costClass: 'preview' as const,
            ref: { kind: 'library' as const, refKind: 'aggregate' as const, id: 'bestProjectedMargin' },
            dependency: { kind: 'aggregates' as const, id: 'bestProjectedMargin' },
          };
        case 'option.value':
          return {
            type: 'id' as const,
            costClass: 'state' as const,
            ref: { kind: 'optionIntrinsic' as const, intrinsic: 'value' as const },
          };
        default:
          return null;
      }
    },
  };
}

describe('policy-expr analysis', () => {
  it('infers expression type, cost class, and dependencies for supported helper forms', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        if: [
          { ref: 'candidate.isPass' },
          { ref: 'feature.currentMargin' },
          { coalesce: [{ ref: 'aggregate.bestProjectedMargin' }, 0] },
        ],
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis, {
      expr: opExpr(
        'if',
        refExpr({ kind: 'candidateIntrinsic', intrinsic: 'isPass' }),
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'currentMargin' }),
        opExpr('coalesce', refExpr({ kind: 'library', refKind: 'aggregate', id: 'bestProjectedMargin' }), literal(0)),
      ),
      valueType: 'number',
      costClass: 'preview',
      dependencies: {
        parameters: [],
        stateFeatures: ['currentMargin'],
        candidateFeatures: [],
        aggregates: ['bestProjectedMargin'],
      },
      isStaticallyZero: false,
    });
  });

  it('resolves parameter refs to the corresponding scalar types', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        in: [
          { const: 'play-event' },
          { param: 'preferredActions' },
        ],
      },
      createContext({
        preferredActions: {
          type: 'idOrder',
          required: false,
          tunable: false,
          allowedIds: ['play-event', 'pass'],
        },
      }),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, opExpr('in', literal('play-event'), { kind: 'param', id: 'preferredActions' }));
    assert.equal(analysis?.valueType, 'boolean');
    assert.deepEqual(analysis?.dependencies.parameters, ['preferredActions']);
  });

  it('uses the resolved candidate-param contract for candidate.param refs', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      { eq: [{ ref: 'candidate.param.eventCardId' }, 'card-2'] },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, opExpr('eq', refExpr({ kind: 'candidateParam', id: 'eventCardId' }), literal('card-2')));
    assert.equal(analysis?.valueType, 'boolean');
    assert.equal(analysis?.costClass, 'candidate');
  });

  it('uses the resolved candidate-param contract for id-list candidate.param refs', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      { in: ['zone-a', { ref: 'candidate.param.$targets' }] },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, opExpr('in', literal('zone-a'), refExpr({ kind: 'candidateParam', id: '$targets' })));
    assert.equal(analysis?.valueType, 'boolean');
    assert.equal(analysis?.costClass, 'candidate');
  });

  it('rejects nested preview refs', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      { ref: 'preview.preview.metric.fake' },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED' && diagnostic.path === 'expr.ref'));
  });

  it('rejects statically provable divide-by-zero expressions', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      { div: [1, 0] },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_DIVIDE_BY_ZERO' && diagnostic.path === 'expr'));
  });

  it('analyzes dynamic zoneTokenAgg zones through the normal expression pipeline', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneTokenAgg: {
          zone: { ref: 'candidate.param.eventCardId' },
          owner: 'self',
          prop: 'rank',
          op: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis, {
      expr: {
        kind: 'zoneTokenAgg',
        zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
        owner: 'self',
        prop: 'rank',
        aggOp: 'sum',
      },
      valueType: 'number',
      costClass: 'candidate',
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
      },
      isStaticallyZero: false,
    });
  });

  it('accepts completion-oriented option.value refs inside dynamic zoneTokenAgg zones', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneTokenAgg: {
          zone: { ref: 'option.value' },
          owner: 'self',
          prop: 'rank',
          op: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'zoneTokenAgg',
      zone: refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }),
      owner: 'self',
      prop: 'rank',
      aggOp: 'count',
    });
    assert.equal(analysis?.costClass, 'state');
  });

  it('rejects dynamic zoneTokenAgg zones that do not resolve to ids', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneTokenAgg: {
          zone: { ref: 'feature.currentMargin' },
          owner: 'self',
          prop: 'rank',
          op: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(
      diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_TYPE_INVALID'
        && diagnostic.path === 'expr.zoneTokenAgg.zone'),
    );
  });
});
