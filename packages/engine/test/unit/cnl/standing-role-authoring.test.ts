// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecObservabilitySection } from '../../../src/cnl/game-spec-doc.js';
import type { AgentPolicyExpr, CompiledAgentPolicyRef } from '../../../src/kernel/types.js';

const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function createTestObservability(): GameSpecObservabilitySection {
  return {
    observers: {
      testObserver: {
        surfaces: {
          victory: {
            currentMargin: 'public',
          },
        },
      },
    },
  };
}

function createCompileReadyDoc(seatIds: readonly string[] = ['us', 'arvn']) {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agents-standing-role-demo', players: { min: seatIds.length, max: seatIds.length } },
    observability: createTestObservability(),
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', attributes: { population: 0 } }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'draw',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: seatIds.map((seatId) => ({ seat: seatId, value: 0 })),
      ranking: { order: 'desc' as const },
    },
  };
}

function createSeatCatalogAsset(seatIds: readonly string[]) {
  return {
    id: 'seats',
    kind: 'seatCatalog' as const,
    payload: {
      seats: seatIds.map((seatId) => ({ id: seatId })),
    },
  };
}

describe('standing role policy authoring', () => {
  it('compiles direct and seatAgg standing role references', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(['us', 'arvn']),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        library: {
          stateFeatures: {
            currentLeaderMargin: {
              type: 'number',
              expr: { ref: 'victory.currentMargin.role:currentLeader' },
            },
            nearestThreatMargin: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: { role: 'nearestThreat' },
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'sum',
                  availability: 'selfAndTargetReady',
                },
              },
            },
          },
        },
      },
    });

    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.gameDef);
    const stateFeatures = compiled.gameDef.agents?.compiled.stateFeatures ?? {};
    assert.deepEqual(stateFeatures.currentLeaderMargin?.expr, refExpr({
      kind: 'currentSurface',
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      selector: { kind: 'role', seatToken: 'role:currentLeader' },
    }));
    assert.deepEqual(stateFeatures.nearestThreatMargin?.expr, {
      kind: 'seatAgg',
      over: { role: 'nearestThreat' },
      expr: refExpr({
        kind: 'currentSurface',
        family: 'victoryCurrentMargin',
        id: 'currentMargin',
        selector: { kind: 'role', seatToken: '$seat' },
      }),
      aggOp: 'sum',
      availability: 'selfAndTargetReady',
    });
  });

  it('rejects unknown standing role selectors in refs and seatAgg.over', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(['us', 'arvn']),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        library: {
          stateFeatures: {
            badRefRole: {
              type: 'number',
              expr: { ref: 'victory.currentMargin.role:missingLeader' },
            },
            badOverRole: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: { role: 'missingLeader' },
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'sum',
                },
              },
            },
          },
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(compiled.diagnostics.some((diagnostic) =>
      diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
      && diagnostic.path === 'doc.agents.library.stateFeatures.badRefRole.expr.ref'));
    assert.ok(compiled.diagnostics.some((diagnostic) =>
      diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_EXPR_INVALID'
      && diagnostic.path === 'doc.agents.library.stateFeatures.badOverRole.expr.seatAgg.over.role'));
  });
});
