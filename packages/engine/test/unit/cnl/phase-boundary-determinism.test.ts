// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function doc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'phase-boundary-determinism', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'public', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }, { id: 'scoring' }, { id: 'reset' }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: [
        { id: 'card-1', title: 'Card 1', sideMode: 'single', tags: ['coup'] },
        { id: 'card-2', title: 'Card 2', sideMode: 'single', tags: ['event'] },
      ],
    }],
    phaseBoundaries: [
      {
        id: 'coupEntry',
        kind: 'phaseEntry',
        phaseId: 'scoring',
        schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { tags: ['coup'] } },
      },
      {
        id: 'resetExit',
        kind: 'phaseExit',
        phaseId: 'reset',
        schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { cardIds: ['card-2'] } },
      },
    ],
  };
}

describe('phase boundary determinism', () => {
  it('compiles phaseBoundaries byte-identically and preserves declaration order', () => {
    const first = compileGameSpecToGameDef(doc());
    const second = compileGameSpecToGameDef(doc());

    assert.equal(first.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(second.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(first.gameDef!.phaseBoundaries?.map((boundary) => boundary.id), ['coupEntry', 'resetExit']);
    assert.equal(JSON.stringify(first.gameDef), JSON.stringify(second.gameDef));
  });

  it('omits phaseBoundaries from compiled output when absent', () => {
    const result = compileGameSpecToGameDef({ ...doc(), phaseBoundaries: null });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(Object.hasOwn(result.gameDef!, 'phaseBoundaries'), false);
  });
});
