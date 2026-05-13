// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import { makeScheduleRefDef, runtimeWithDrawnCount, scoreScheduleConsiderations, stateWithDrawnCount } from './schedule-ref-test-fixtures.js';

const ref = (value: string) => ({ ref: value });

describe('schedule ref fallback discipline', () => {
  it('rejects schedule distance refs in numeric value context without scheduleFallback', () => {
    const result = compileGameSpecToGameDef(docWithScheduleValueRef());

    assert.ok(result.diagnostics.some((diagnostic) =>
      diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_MISSING_FALLBACK
      && diagnostic.path === 'doc.agents.library.considerations.cards.scheduleFallback',
    ));
  });

  it('does not require scheduleFallback for when-only schedule refs', () => {
    const result = compileGameSpecToGameDef({
      ...docWithScheduleValueRef(),
      agents: {
        library: {
          considerations: {
            whenOnly: {
              scopes: ['move'],
              when: { gt: [ref('schedule.distance.toBoundary.coupEntry.cards'), 0] },
              weight: 1,
              value: 1,
            },
          },
        },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  });

  it('records noContribution, constant, and dropConsideration fallback metadata', () => {
    const def = makeScheduleRefDef();
    const runtime = runtimeWithDrawnCount(def, 5);
    const state = stateWithDrawnCount(def, 5);

    const noContribution = scoreScheduleConsiderations(def, state, ['cards'], runtime);
    assert.deepEqual(noContribution.scoreContributions, [{ termId: 'cards', contribution: 0 }]);
    assert.deepEqual(noContribution.scheduleFallbackFired, { termId: 'cards', kind: 'noContribution' });

    const constant = scoreScheduleConsiderations(def, state, ['explicitZero'], runtime);
    assert.deepEqual(constant.scoreContributions, [{ termId: 'explicitZero', contribution: 0 }]);
    assert.deepEqual(constant.scheduleFallbackFired, { termId: 'explicitZero', kind: 'constant', value: 0 });

    const dropped = scoreScheduleConsiderations(def, state, ['drop'], runtime);
    assert.deepEqual(dropped.scoreContributions, []);
    assert.deepEqual(dropped.scheduleFallbackFired, { termId: 'drop', kind: 'dropConsideration' });
  });
});

function docWithScheduleValueRef(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'schedule-fallback-discipline', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'public', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
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
      schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { tags: ['coup'] } },
    }],
    agents: {
      library: {
        considerations: {
          cards: { scopes: ['move'], weight: 1, value: ref('schedule.distance.toBoundary.coupEntry.cards') },
        },
      },
    },
  };
}
