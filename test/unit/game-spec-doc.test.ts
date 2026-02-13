import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

describe('game-spec-doc', () => {
  it('creates an all-null document shape for missing sections', () => {
    const doc = createEmptyGameSpecDoc();

    const expected: GameSpecDoc = {
      metadata: null,
      constants: null,
      dataAssets: null,
      globalVars: null,
      perPlayerVars: null,
      zones: null,
      tokenTypes: null,
      setup: null,
      turnStructure: null,
      turnOrder: null,
      actionPipelines: null,
      eventDecks: null,
      terminal: null,
      actions: null,
      triggers: null,
      effectMacros: null,
    };

    assert.deepEqual(doc, expected);
  });
});
