// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

const ref = (value: string) => ({ ref: value });

describe('partial-visibility observer-policy compile determinism', () => {
  it('compiles observerPolicy-bearing GameDef output byte-identically', () => {
    const first = compileGameSpecToGameDef(observerPolicyDoc());
    const second = compileGameSpecToGameDef(observerPolicyDoc());

    assert.equal(first.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(second.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(JSON.stringify(first.gameDef), JSON.stringify(second.gameDef));
  });
});

function observerPolicyDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'partial-visibility-determinism', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'hidden', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'lookahead', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'leader', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }, { id: 'scoring' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      tags: ['pass'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: [
        { id: 'op-1', title: 'Operation 1', sideMode: 'single', tags: ['operation'] },
        { id: 'coup-1', title: 'Coup 1', sideMode: 'single', tags: ['coup'] },
      ],
    }],
    phaseBoundaries: [{
      id: 'coupEntry',
      kind: 'phaseEntry',
      phaseId: 'scoring',
      schedule: {
        kind: 'cardDraw',
        deckId: 'eventDeck',
        cardSelector: { tags: ['coup'] },
        observerPolicy: {
          kind: 'topNVisible',
          visiblePrefix: {
            zones: [{ id: 'lookahead:none' }, { id: 'leader:none' }],
            maxItems: 2,
          },
        },
      },
    }],
    agents: {
      library: {
        considerations: {
          cards: {
            scopes: ['move'],
            weight: 1,
            value: ref('schedule.distance.toBoundary.coupEntry.cards'),
            scheduleFallback: {
              onUnavailable: 'noContribution',
              onPartial: { visiblePrefixExhausted: 'useLowerBound' },
            },
          },
        },
      },
    },
  };
}
