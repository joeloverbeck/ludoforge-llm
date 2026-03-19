import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzePolicyExpr } from '../../../src/agents/policy-expr.js';
import type { CompiledAgentParameterDef } from '../../../src/kernel/types.js';

function createContext(parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>> = {}) {
  return {
    parameterDefs,
    resolveRef(refPath: string) {
      switch (refPath) {
        case 'candidate.isPass':
          return { type: 'boolean' as const, costClass: 'candidate' as const };
        case 'feature.currentMargin':
          return {
            type: 'number' as const,
            costClass: 'state' as const,
            dependency: { kind: 'stateFeatures' as const, id: 'currentMargin' },
          };
        case 'aggregate.bestProjectedMargin':
          return {
            type: 'number' as const,
            costClass: 'preview' as const,
            dependency: { kind: 'aggregates' as const, id: 'bestProjectedMargin' },
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
    assert.equal(analysis?.valueType, 'boolean');
    assert.deepEqual(analysis?.dependencies.parameters, ['preferredActions']);
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
});
