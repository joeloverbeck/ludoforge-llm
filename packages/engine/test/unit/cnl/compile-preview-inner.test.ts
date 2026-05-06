// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { GameDefSchema } from '../../../src/kernel/schemas.js';
import type { GameSpecAgentProfileDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'preview-inner-compile-test', players: { min: 2, max: 2 } },
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
        preview: { mode: 'exactWorld' },
      },
    },
    bindings: { us: 'baseline' },
  },
});

const withPreview = (preview: NonNullable<GameSpecAgentProfileDef['preview']>): GameSpecDoc => {
  const doc = baseDoc();
  return {
    ...doc,
    agents: {
      ...doc.agents,
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
          preview,
        },
      },
    },
  };
};

describe('compile preview.inner', () => {
  it('rejects inner preview configs above the hard cap', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 8, chooseNBeamWidth: 8, depthCap: 8 },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.inner'
        && diagnostic.message.includes('512')
        && diagnostic.message.includes('256')
      )),
      true,
    );
    assert.equal(result.gameDef, null);
  });

  it('lowers inner preview configs at or below the hard cap', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: {
        chooseOne: true,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 4,
        depthCap: 4,
      },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.inner, {
      chooseOne: true,
      chooseNStep: true,
      maxOptions: 4,
      chooseNBeamWidth: 4,
      depthCap: 4,
    });
  });

  it('leaves preview.inner absent when not authored', () => {
    const result = compileGameSpecToGameDef(baseDoc());

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview.inner, undefined);
  });

  it('keeps the hard cap at 256', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 16, chooseNBeamWidth: 16, depthCap: 1 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview.inner?.maxOptions, 16);
  });

  it('rejects schema artifacts with preview.inner.maxOptions below one', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 1, chooseNBeamWidth: 1, depthCap: 1 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.throws(
      () => GameDefSchema.parse({
        ...result.gameDef,
        agents: {
          ...result.gameDef?.agents,
          profiles: {
            baseline: {
              ...result.gameDef?.agents?.profiles.baseline,
              preview: {
                ...result.gameDef?.agents?.profiles.baseline?.preview,
                inner: { maxOptions: 0, chooseNBeamWidth: 1, depthCap: 1 },
              },
            },
          },
        },
      }),
      /Too small/u,
    );
  });
});
