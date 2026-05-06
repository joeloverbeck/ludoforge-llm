// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'preview-budget-compile-test', players: { min: 2, max: 2 } },
  dataAssets: [{
    id: 'seat-catalog',
    kind: 'seatCatalog',
    payload: { seats: [{ id: 'us' }, { id: 'them' }] },
  }],
  zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
  turnStructure: { phases: [{ id: 'main' }] },
  actions: [],
  terminal: { conditions: [] },
  observability: {
    observers: {
      currentPlayer: {
        surfaces: {
          victory: {
            currentMargin: 'public',
          },
        },
      },
    },
  },
  agents: {
    parameters: {},
    library: {
      tieBreakers: {
        stableMoveKey: { kind: 'stableMoveKey' },
      },
    },
    profiles: {
      baseline: {
        observer: 'currentPlayer',
        params: {},
        use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
        preview: {
          mode: 'exactWorld',
          budget: { strategy: 'balancedCoverage', fullCandidateCap: 4, minPerGroup: 1 },
        },
      },
    },
    bindings: { us: 'baseline' },
  },
});

describe('compile preview.budget', () => {
  it('lowers balancedCoverage budget into compiled profiles', () => {
    const result = compileGameSpecToGameDef(baseDoc());

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.budget, {
      strategy: 'balancedCoverage',
      fullCandidateCap: 4,
      minPerGroup: 1,
    });
  });

  it('rejects the removed authored cap field with migration guidance', () => {
    const doc = baseDoc();
    const result = compileGameSpecToGameDef({
      ...doc,
      agents: {
        ...doc.agents,
        profiles: {
          baseline: {
            observer: 'currentPlayer',
            params: {},
            use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
            preview: { mode: 'exactWorld', ['top' + 'K']: 4 } as never,
          },
        },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_TOPK_INVALID'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.topK'
        && diagnostic.message.includes('preview.budget')
      )),
      true,
    );
  });

  it('rejects uniform-projection widening without its cap and step fields', () => {
    const doc = baseDoc();
    const result = compileGameSpecToGameDef({
      ...doc,
      agents: {
        ...doc.agents,
        profiles: {
          baseline: {
            observer: 'currentPlayer',
            params: {},
            use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
            preview: {
              mode: 'exactWorld',
              budget: {
                strategy: 'balancedCoverage',
                fullCandidateCap: 4,
                minPerGroup: 1,
                widenOnUniformProjection: true,
              },
            },
          },
        },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.budget'
      )),
      true,
    );
  });
});
