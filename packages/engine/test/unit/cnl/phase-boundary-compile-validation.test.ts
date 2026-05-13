// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const ref = (value: string) => ({ ref: value });

function baseDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'phase-boundary-validation', players: { min: 1, max: 1 } },
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
        { id: 'card-1', title: 'Card 1', sideMode: 'single', tags: ['coup'] },
        { id: 'card-2', title: 'Card 2', sideMode: 'single', tags: ['event'] },
      ],
    }],
    phaseBoundaries: [{
      id: 'coupEntry',
      kind: 'phaseEntry',
      phaseId: 'scoring',
      schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { tags: ['coup'] } },
    }],
  };
}

function docWithAgentRef(refPath: string, phaseBoundaries = baseDoc().phaseBoundaries): GameSpecDoc {
  return {
    ...baseDoc(),
    phaseBoundaries,
    agents: {
      library: {
        considerations: {
          schedule: { scopes: ['move'], weight: 1, value: ref(refPath) },
        },
      },
    },
  };
}

function docWithStateFeatureRef(refPath: string): GameSpecDoc {
  return {
    ...baseDoc(),
    agents: {
      library: {
        stateFeatures: {
          scheduleState: { type: 'number', expr: ref(refPath) },
        },
      },
    },
  };
}

function diagnosticCodes(doc: GameSpecDoc): readonly string[] {
  return compileGameSpecToGameDef(doc).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('phase boundary compile validation', () => {
  const rows: readonly [string, GameSpecDoc, string][] = [
    [
      'rejects duplicate boundary ids',
      { ...baseDoc(), phaseBoundaries: [...baseDoc().phaseBoundaries!, { ...baseDoc().phaseBoundaries![0]! }] },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_DUPLICATE_ID,
    ],
    [
      'rejects unknown phase ids',
      { ...baseDoc(), phaseBoundaries: [{ ...baseDoc().phaseBoundaries![0]!, phaseId: 'missing' }] },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_PHASE,
    ],
    [
      'rejects unknown event decks',
      {
        ...baseDoc(),
        phaseBoundaries: [{
          ...baseDoc().phaseBoundaries![0]!,
          schedule: { kind: 'cardDraw', deckId: 'missingDeck', cardSelector: { tags: ['coup'] } },
        }],
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_DECK,
    ],
    [
      'rejects unknown card tags',
      {
        ...baseDoc(),
        phaseBoundaries: [{
          ...baseDoc().phaseBoundaries![0]!,
          schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { tags: ['missing-tag'] } },
        }],
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_CARD_TAG,
    ],
    [
      'rejects unknown card ids',
      {
        ...baseDoc(),
        phaseBoundaries: [{
          ...baseDoc().phaseBoundaries![0]!,
          schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { cardIds: ['missing-card'] } },
        }],
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_CARD_ID,
    ],
    [
      'rejects empty card selectors',
      {
        ...baseDoc(),
        phaseBoundaries: [{
          ...baseDoc().phaseBoundaries![0]!,
          schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: {} },
        }],
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_EMPTY_CARD_SELECTOR,
    ],
    [
      'rejects unknown boundary refs',
      docWithAgentRef('schedule.distance.toBoundary.missing.cards'),
      CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNKNOWN_BOUNDARY,
    ],
    [
      'rejects unknown phase schedule refs',
      docWithAgentRef('schedule.distance.toPhase.missing.cards'),
      CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNKNOWN_PHASE,
    ],
    [
      'rejects phase refs without a phaseEntry boundary',
      docWithAgentRef('schedule.distance.toPhase.main.cards'),
      CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_NO_PHASE_BOUNDARY,
    ],
    [
      'rejects unsupported schedule units',
      docWithAgentRef('schedule.distance.toBoundary.unscheduled.cards', [
        { id: 'unscheduled', kind: 'condition' },
      ]),
      CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNSUPPORTED_UNIT,
    ],
    [
      'keeps future turn-count schedules validation-only in Phase 0',
      docWithAgentRef('schedule.distance.toBoundary.futureTurns.turns', [
        { id: 'futureTurns', kind: 'condition', schedule: { kind: 'turnCount' } },
      ]),
      CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNSUPPORTED_UNIT,
    ],
    [
      'rejects phase refs outside move and microturn policy scopes',
      docWithStateFeatureRef('phase.current.id'),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
    ],
    [
      'rejects schedule refs outside move and microturn policy scopes',
      docWithStateFeatureRef('schedule.distance.toBoundary.coupEntry.cards'),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
    ],
  ];

  for (const [name, doc, code] of rows) {
    it(name, () => {
      assert.ok(diagnosticCodes(doc).includes(code), `expected ${code}`);
    });
  }

  it('lowers phase and schedule refs to validation-only compiled ref nodes', () => {
    const result = compileGameSpecToGameDef({
      ...docWithAgentRef('schedule.distance.toBoundary.coupEntry.cards'),
      agents: {
        library: {
          considerations: {
            currentPhase: { scopes: ['move'], when: { eq: [ref('phase.current.id'), 'main'] }, weight: 1, value: 1 },
            nextPhase: { scopes: ['move'], when: { eq: [ref('phase.next.id'), 'scoring'] }, weight: 1, value: 1 },
            nextBoundary: { scopes: ['move'], when: { eq: [ref('schedule.nextBoundary.id'), 'coupEntry'] }, weight: 1, value: 1 },
            cards: { scopes: ['move'], weight: 1, value: ref('schedule.distance.toBoundary.coupEntry.cards') },
            phaseCards: { scopes: ['move'], weight: 1, value: ref('schedule.distance.toPhase.scoring.cards') },
            scheduleFallback: {
              scopes: ['microturn'],
              weight: 1,
              value: ref('schedule.distance.toBoundary.coupEntry.cards'),
              scheduleFallback: { onUnavailable: 'dropConsideration' },
            },
          },
        },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    const considerations = result.gameDef!.agents!.compiled.considerations;
    assert.deepEqual(considerations.currentPhase!.when, { kind: 'op', op: 'eq', args: [{ kind: 'ref', ref: { kind: 'phaseIntrinsic', name: 'current.id' } }, { kind: 'literal', value: 'main' }] });
    assert.deepEqual(considerations.nextPhase!.when, { kind: 'op', op: 'eq', args: [{ kind: 'ref', ref: { kind: 'phaseIntrinsic', name: 'next.id' } }, { kind: 'literal', value: 'scoring' }] });
    assert.deepEqual(considerations.nextBoundary!.when, { kind: 'op', op: 'eq', args: [{ kind: 'ref', ref: { kind: 'scheduleDistance', target: { kind: 'nextBoundary' } } }, { kind: 'literal', value: 'coupEntry' }] });
    assert.deepEqual(considerations.cards!.value, {
      kind: 'ref',
      ref: { kind: 'scheduleDistance', target: { kind: 'boundary', boundaryId: 'coupEntry' }, unit: 'cards' },
    });
    assert.deepEqual(considerations.phaseCards!.value, {
      kind: 'ref',
      ref: { kind: 'scheduleDistance', target: { kind: 'phase', phaseId: 'scoring' }, unit: 'cards' },
    });
    assert.deepEqual(considerations.scheduleFallback!.scheduleFallback, { onUnavailable: 'dropConsideration' });
  });
});
