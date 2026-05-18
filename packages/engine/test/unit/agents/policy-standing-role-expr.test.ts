// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzePolicyExpr } from '../../../src/agents/policy-expr.js';
import type { CompiledAgentParameterDef } from '../../../src/kernel/types.js';

function createContext(parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>> = {}) {
  return {
    parameterDefs,
    referenceSeatIds: ['us', 'arvn', 'nva', 'vc'],
    resolveRef(refPath: string) {
      if (refPath !== 'victory.currentMargin.$seat') {
        return null;
      }
      return {
        type: 'number' as const,
        costClass: 'state' as const,
        ref: {
          kind: 'currentSurface' as const,
          family: 'victoryCurrentMargin' as const,
          id: 'currentMargin',
          selector: { kind: 'role' as const, seatToken: '$seat' },
        },
      };
    },
  };
}

describe('policy standing role expression analysis', () => {
  it('accepts standing role objects as seatAgg targets', () => {
    const diagnostics: Parameters<typeof analyzePolicyExpr>[2] = [];
    const analysis = analyzePolicyExpr(
      {
        seatAgg: {
          over: { role: 'nearestThreat' },
          expr: { ref: 'victory.currentMargin.$seat' },
          aggOp: 'sum',
          availability: 'selfAndTargetReady',
        },
      },
      createContext(),
      diagnostics,
      'expr',
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(analysis?.expr, {
      kind: 'seatAgg',
      over: { role: 'nearestThreat' },
      expr: {
        kind: 'ref',
        ref: {
          kind: 'currentSurface',
          family: 'victoryCurrentMargin',
          id: 'currentMargin',
          selector: { kind: 'role', seatToken: '$seat' },
        },
      },
      aggOp: 'sum',
      availability: 'selfAndTargetReady',
    });
  });
});
