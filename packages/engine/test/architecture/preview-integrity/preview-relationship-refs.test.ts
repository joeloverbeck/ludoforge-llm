// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecCandidateFeatureDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const refExpr = (ref: string) => ({ ref }) as const;

function baseDoc(candidateFeatures: Readonly<Record<string, GameSpecCandidateFeatureDef>>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'preview-relationship-refs', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seat-catalog',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'us' }, { id: 'ally' }] },
    }],
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'us', value: 0 }, { seat: 'ally', value: 1 }],
      ranking: { order: 'desc' },
    },
    observability: {
      observers: {
        currentPlayer: {
          surfaces: {
            victory: { currentMargin: 'public' },
          },
        },
      },
    },
    agents: {
      parameters: {},
      library: {
        candidateFeatures,
        relationships: {
          usNominalAlly: {
            role: 'nominalAlly',
            seat: 'ally',
            gainValue: refExpr('victory.currentMargin.ally'),
          },
        },
        considerations: {},
        tieBreakers: {},
      },
      profiles: {},
      bindings: {},
    },
  };
}

describe('preview relationship refs', () => {
  it('compiles generic preview relationship victory margin and gain delta refs', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      allyMargin: {
        type: 'number',
        expr: refExpr('preview.relationship.nominalAlly.victoryMargin'),
        previewFallback: { onUnavailable: 'noContribution' },
      },
      allyGainDelta: {
        type: 'number',
        expr: refExpr('preview.relationship.nominalAlly.gainValueDelta'),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.compiled.candidateFeatures.allyMargin?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.deepEqual(
      result.gameDef?.agents?.compiled.candidateFeatures.allyGainDelta?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
  });

  it('rejects unknown preview relationship fields', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      badRelationshipRef: {
        type: 'number',
        expr: refExpr('preview.relationship.nominalAlly.seat'),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some((entry) =>
      entry.severity === 'error'
      && /preview\.relationship\.nominalAlly\.seat/u.test(entry.message)
    ));
  });
});
