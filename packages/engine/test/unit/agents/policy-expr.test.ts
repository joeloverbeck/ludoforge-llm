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
        strategicConditions: [],
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
        strategicConditions: [],
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

  it('analyzes zoneProp with static and dynamic zone expressions through the shared path', () => {
    const staticDiagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const staticAnalysis = analyzePolicyExpr(
      {
        zoneProp: {
          zone: 'frontier:none',
          prop: 'population',
        },
      },
      createContext(),
      staticDiagnostics,
      'expr',
    );

    assert.deepEqual(staticDiagnostics, []);
    assert.deepEqual(staticAnalysis?.expr, {
      kind: 'zoneProp',
      zone: 'frontier:none',
      prop: 'population',
    });
    assert.equal(staticAnalysis?.valueType, 'unknown');
    assert.equal(staticAnalysis?.costClass, 'state');

    const dynamicDiagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const dynamicAnalysis = analyzePolicyExpr(
      {
        zoneProp: {
          zone: { ref: 'option.value' },
          prop: 'category',
        },
      },
      createContext(),
      dynamicDiagnostics,
      'expr',
    );

    assert.deepEqual(dynamicDiagnostics, []);
    assert.deepEqual(dynamicAnalysis?.expr, {
      kind: 'zoneProp',
      zone: refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }),
      prop: 'category',
    });
    assert.equal(dynamicAnalysis?.costClass, 'state');
  });

  it('rejects dynamic zoneProp zones that do not resolve to ids', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneProp: {
          zone: { ref: 'feature.currentMargin' },
          prop: 'population',
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
        && diagnostic.path === 'expr.zoneProp.zone'),
    );
  });

  it('accepts numeric runtime player ids for zoneTokenAgg owners', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneTokenAgg: {
          zone: 'frontier',
          owner: '0',
          prop: 'rank',
          op: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.equal(analysis?.expr.kind, 'zoneTokenAgg');
    assert.equal(analysis?.expr.kind === 'zoneTokenAgg' ? analysis.expr.owner : null, '0');
  });

  it('analyzes globalTokenAgg expressions with filters and explicit scope', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalTokenAgg: {
          tokenFilter: {
            type: 'base',
            props: {
              seat: { eq: 'self' },
              hidden: { eq: false },
            },
          },
          aggOp: 'sum',
          prop: 'strength',
          zoneFilter: {
            category: 'province',
            attribute: {
              prop: 'population',
              op: 'gt',
              value: 0,
            },
            variable: {
              prop: 'opposition',
              op: 'gte',
              value: 1,
            },
          },
          zoneScope: 'all',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis, {
      expr: {
        kind: 'globalTokenAgg',
        tokenFilter: {
          type: 'base',
          props: {
            seat: { eq: 'self' },
            hidden: { eq: false },
          },
        },
        aggOp: 'sum',
        prop: 'strength',
        zoneFilter: {
          category: 'province',
          attribute: {
            prop: 'population',
            op: 'gt',
            value: 0,
          },
          variable: {
            prop: 'opposition',
            op: 'gte',
            value: 1,
          },
        },
        zoneScope: 'all',
      },
      valueType: 'number',
      costClass: 'state',
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
        strategicConditions: [],
      },
      isStaticallyZero: false,
    });
  });

  it('defaults globalTokenAgg zoneScope to board and permits count without prop', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalTokenAgg: {
          tokenFilter: { type: 'base' },
          aggOp: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'base' },
      aggOp: 'count',
      zoneScope: 'board',
    });
    assert.equal(analysis?.costClass, 'state');
  });

  it('rejects globalTokenAgg expressions without aggOp', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalTokenAgg: {
          tokenFilter: { type: 'base' },
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.globalTokenAgg.aggOp'
      && diagnostic.message.includes('must be one of')));
  });

  it('rejects globalTokenAgg sum expressions without prop', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalTokenAgg: {
          tokenFilter: { type: 'base' },
          aggOp: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.globalTokenAgg.prop'
      && diagnostic.message.includes('required')));
  });

  it('rejects invalid globalTokenAgg tokenFilter prop comparison shapes', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalTokenAgg: {
          tokenFilter: {
            props: {
              seat: { in: ['self'] },
            },
          },
          aggOp: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.globalTokenAgg.tokenFilter.props.seat'
      && diagnostic.message.includes('{ eq: <scalar> }')));
  });

  it('analyzes globalZoneAgg expressions with explicit attribute source and shared zone filters', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalZoneAgg: {
          source: 'attribute',
          field: 'population',
          aggOp: 'max',
          zoneFilter: {
            category: 'province',
            attribute: {
              prop: 'population',
              op: 'gt',
              value: 0,
            },
            variable: {
              prop: 'opposition',
              op: 'gte',
              value: 1,
            },
          },
          zoneScope: 'all',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis, {
      expr: {
        kind: 'globalZoneAgg',
        source: 'attribute',
        field: 'population',
        aggOp: 'max',
        zoneFilter: {
          category: 'province',
          attribute: {
            prop: 'population',
            op: 'gt',
            value: 0,
          },
          variable: {
            prop: 'opposition',
            op: 'gte',
            value: 1,
          },
        },
        zoneScope: 'all',
      },
      valueType: 'number',
      costClass: 'state',
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
        strategicConditions: [],
      },
      isStaticallyZero: false,
    });
  });

  it('defaults globalZoneAgg source to variable and zoneScope to board', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalZoneAgg: {
          field: 'opposition',
          aggOp: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'globalZoneAgg',
      source: 'variable',
      field: 'opposition',
      aggOp: 'sum',
      zoneScope: 'board',
    });
  });

  it('rejects globalZoneAgg expressions without field', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalZoneAgg: {
          source: 'variable',
          aggOp: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.globalZoneAgg.field'
      && diagnostic.message.includes('non-empty string')));
  });

  it('rejects invalid globalZoneAgg aggregation operators', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        globalZoneAgg: {
          source: 'attribute',
          field: 'population',
          aggOp: 'avg',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.globalZoneAgg.aggOp'
      && diagnostic.message.includes('must be one of')));
  });

  it('analyzes adjacentTokenAgg expressions with count and optional token filters', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        adjacentTokenAgg: {
          anchorZone: 'frontier:actor',
          tokenFilter: {
            type: 'base',
            props: {
              seat: { eq: 'self' },
              hidden: { eq: false },
            },
          },
          aggOp: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'adjacentTokenAgg',
      anchorZone: 'frontier:actor',
      tokenFilter: {
        type: 'base',
        props: {
          seat: { eq: 'self' },
          hidden: { eq: false },
        },
      },
      aggOp: 'count',
    });
    assert.equal(analysis?.costClass, 'state');
  });

  it('analyzes adjacentTokenAgg expressions with numeric props', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        adjacentTokenAgg: {
          anchorZone: 'saigon:none',
          tokenFilter: { type: 'troop' },
          aggOp: 'sum',
          prop: 'strength',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'adjacentTokenAgg',
      anchorZone: 'saigon:none',
      tokenFilter: { type: 'troop' },
      aggOp: 'sum',
      prop: 'strength',
    });
  });

  it('rejects adjacentTokenAgg expressions without anchorZone', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        adjacentTokenAgg: {
          aggOp: 'count',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.adjacentTokenAgg.anchorZone'
      && diagnostic.message.includes('non-empty string')));
  });

  it('rejects adjacentTokenAgg sum expressions without prop', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        adjacentTokenAgg: {
          anchorZone: 'saigon:none',
          aggOp: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.adjacentTokenAgg.prop'
      && diagnostic.message.includes('required')));
  });

  it('rejects invalid adjacentTokenAgg aggregation operators', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        adjacentTokenAgg: {
          anchorZone: 'saigon:none',
          aggOp: 'avg',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.adjacentTokenAgg.aggOp'
      && diagnostic.message.includes('must be one of')));
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

  it('rejects seat ids for zoneTokenAgg owners', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        zoneTokenAgg: {
          zone: 'frontier',
          owner: 'us',
          prop: 'rank',
          op: 'sum',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.equal(analysis, null);
    assert.ok(diagnostics.some((diagnostic) =>
      diagnostic.path === 'expr.zoneTokenAgg.owner'
      && diagnostic.message.includes('numeric runtime player id')));
  });
});
