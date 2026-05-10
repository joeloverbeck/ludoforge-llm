// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentProfileDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const COST_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP;

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'preview-inner-choosenstep-cost-test', players: { min: 2, max: 2 } },
  dataAssets: [{
    id: 'seat-catalog',
    kind: 'seatCatalog',
    payload: { seats: [{ id: 'us' }, { id: 'them' }] },
  }],
  zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
  turnStructure: { phases: [{ id: 'main' }] },
  actions: [],
  terminal: {
    conditions: [],
    margins: [{ seat: 'us', value: 0 }, { seat: 'them', value: 0 }],
    ranking: { order: 'desc' },
  },
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
      considerations: {},
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

const withPreview = (
  preview: NonNullable<GameSpecAgentProfileDef['preview']>,
): GameSpecDoc => {
  const doc = baseDoc();
  const agents = doc.agents!;
  return {
    ...doc,
    agents: {
      ...agents,
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

describe('compile preview.inner chooseNStep cost', () => {
  it('accepts the ARVN-like chooseNStep squared cost under the hard cap', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseNStep: true, maxOptions: 8, chooseNBeamWidth: 1, depthCap: 4 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.inner, {
      chooseOne: false,
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
      strategy: 'singlePass',
      capClass: 'standard256',
    });
  });

  it('rejects chooseNStep squared cost above the hard cap with the computed cost', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseNStep: true, maxOptions: 8, chooseNBeamWidth: 2, depthCap: 4 },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === COST_CODE
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.inner'
        && diagnostic.message.includes('392')
        && diagnostic.message.includes('256')
      )),
      true,
    );
    assert.equal(result.gameDef, null);
  });

  it('keeps chooseNStep false on the triple-product formula', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseNStep: false, maxOptions: 4, chooseNBeamWidth: 4, depthCap: 4 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview.inner?.chooseNStep, false);
  });

  it('uses the renamed diagnostic for triple-product overflow', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseNStep: false, maxOptions: 8, chooseNBeamWidth: 8, depthCap: 8 },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === COST_CODE
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.inner'
        && diagnostic.message.includes('512')
        && diagnostic.message.includes('256')
      )),
      true,
    );
    assert.equal(result.gameDef, null);
  });
});
