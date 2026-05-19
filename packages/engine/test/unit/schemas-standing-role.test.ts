// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameDefSchema } from '../../src/kernel/index.js';

const minimalGameDef = {
  metadata: { id: 'minimal-game', players: { min: 2, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
} as const;

function buildGameDefWithAgentExpr(featureId: string, expr: Record<string, unknown>) {
  return {
    ...minimalGameDef,
    agents: {
      schemaVersion: 2,
      catalogFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      surfaceVisibility: {
        globalVars: {},
        globalMarkers: {},
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
          currentRank: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
        },
        activeCardIdentity: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardTag: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardMetadata: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardAnnotation: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      parameterDefs: {},
      candidateParamDefs: {},
      library: {
        stateFeatures: {},
        candidateFeatures: {
          [featureId]: {
            type: 'number',
            costClass: 'state',
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
              strategicConditions: [],
            },
          },
        },
        candidateAggregates: {},
        guardrails: {},
        considerations: {},
        tieBreakers: {},
        strategicConditions: {},
      },
      compiled: {
        stateFeatures: {},
        candidateFeatures: {
          [featureId]: {
            type: 'number',
            costClass: 'state',
            expr,
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
              strategicConditions: [],
            },
          },
        },
        candidateAggregates: {},
        guardrails: {},
        considerations: {},
        tieBreakers: {},
        strategicConditions: {},
      },
      profiles: {
        baseline: {
          fingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: {
            guardrails: [],
            considerations: [],
            tieBreakers: [],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: [featureId],
            candidateAggregates: [],
            considerations: [],
          },
        },
      },
      bindingsBySeat: {
        us: 'baseline',
      },
    },
  };
}

describe('standing role runtime schemas', () => {
  it('accepts compiled seatAgg expressions over standing roles', () => {
    const roleResult = GameDefSchema.safeParse(buildGameDefWithAgentExpr('nearestThreatMargin', {
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
    }));

    assert.equal(roleResult.success, true);
  });

  it('rejects unknown compiled seatAgg standing roles', () => {
    const invalidRole = GameDefSchema.safeParse(buildGameDefWithAgentExpr('invalidRole', {
      kind: 'seatAgg',
      over: { role: 'missingLeader' },
      expr: {
        kind: 'literal',
        value: 1,
      },
      aggOp: 'count',
    }));

    assert.equal(invalidRole.success, false);
  });
});
