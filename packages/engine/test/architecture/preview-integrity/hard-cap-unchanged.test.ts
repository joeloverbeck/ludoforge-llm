// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INNER_PREVIEW_HARD_CAP } from '../../../src/cnl/compile-agents.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentProfileDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function docWithInner(inner: NonNullable<NonNullable<GameSpecAgentProfileDef['preview']>['inner']>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'preview-hard-cap-unchanged', players: { min: 2, max: 2 } },
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
    agents: {
      parameters: {},
      library: {
        considerations: {},
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'omniscient',
          params: {},
          use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
          preview: { mode: 'exactWorld', inner },
        },
      },
      bindings: { us: 'baseline' },
    },
  };
}

describe('preview inner hard cap', () => {
  it('keeps INNER_PREVIEW_HARD_CAP at 256', () => {
    assert.equal(INNER_PREVIEW_HARD_CAP, 256);
  });

  it('accepts the exact hard-cap cost and rejects one above it', () => {
    const atCap = compileGameSpecToGameDef(docWithInner({
      maxOptions: 16,
      chooseNBeamWidth: 16,
      depthCap: 1,
    }));
    const aboveCap = compileGameSpecToGameDef(docWithInner({
      maxOptions: 257,
      chooseNBeamWidth: 1,
      depthCap: 1,
    }));

    assert.equal(atCap.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(atCap.gameDef?.agents?.profiles.baseline?.preview.inner?.maxOptions, 16);
    assert.equal(
      aboveCap.diagnostics.some((entry) => (
        entry.code === 'CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP'
        && entry.message.includes('257')
        && entry.message.includes('256')
      )),
      true,
    );
    assert.equal(aboveCap.gameDef, null);
  });
});
