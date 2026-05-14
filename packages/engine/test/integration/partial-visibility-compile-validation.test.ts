// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import type { GameSpecDoc, GameSpecPhaseBoundaryDef, GameSpecScheduleKindDef } from '../../src/cnl/game-spec-doc.js';

const ref = (value: string) => ({ ref: value });

function baseDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'partial-visibility-compile-validation', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'hidden', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'lookahead', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'leader', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'privateSlot', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'unorderedSlot', owner: 'none', visibility: 'public', ordering: 'set' },
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
    phaseBoundaries: [validBoundary()],
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

function validBoundary(): GameSpecPhaseBoundaryDef {
  return {
    id: 'coupEntry',
    kind: 'phaseEntry',
    phaseId: 'scoring',
    schedule: validSchedule(),
  };
}

function validSchedule(): Extract<GameSpecScheduleKindDef, { readonly kind: 'cardDraw' }> {
  return {
    kind: 'cardDraw',
    deckId: 'eventDeck',
    cardSelector: { tags: ['coup'] },
    observerPolicy: {
      kind: 'topNVisible',
      visiblePrefix: {
        sources: [{ id: 'lookahead:none', take: 1 }, { id: 'leader:none', take: 1 }],
      },
    },
  };
}

function docWithBoundary(boundary: GameSpecPhaseBoundaryDef): GameSpecDoc {
  return { ...baseDoc(), phaseBoundaries: [boundary] };
}

function diagnosticCodes(doc: GameSpecDoc): readonly string[] {
  return compileGameSpecToGameDef(doc).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('partial-visibility observer-policy compile validation', () => {
  const malformedRows: readonly [string, GameSpecPhaseBoundaryDef, string][] = [
    [
      'rejects unknown observer policy kinds',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: {
            kind: 'futurePolicy',
            visiblePrefix: { sources: [{ id: 'lookahead:none', take: 1 }] },
          },
        } as unknown as GameSpecScheduleKindDef,
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_UNKNOWN_KIND,
    ],
    [
      'rejects deferred observer policy kinds',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: {
            kind: 'omniscient',
            visiblePrefix: { sources: [{ id: 'lookahead:none', take: 1 }] },
          },
        } as unknown as GameSpecScheduleKindDef,
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_DEFERRED_KIND,
    ],
    [
      'rejects empty visible prefixes',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX,
    ],
    [
      'rejects missing source take',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: {
            kind: 'topNVisible',
            visiblePrefix: { sources: [{ id: 'lookahead:none' }] },
          },
        } as unknown as GameSpecScheduleKindDef,
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_MISSING_TAKE,
    ],
    [
      'rejects invalid source take',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [{ id: 'lookahead:none', take: 0 }] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_INVALID_TAKE,
    ],
    [
      'rejects unknown visible-prefix zones',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [{ id: 'missing:none', take: 1 }] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_UNKNOWN_ZONE,
    ],
    [
      'rejects non-public visible-prefix zones',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [{ id: 'privateSlot:none', take: 1 }] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_NON_PUBLIC_ZONE,
    ],
    [
      'rejects unordered visible-prefix zones',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [{ id: 'unorderedSlot:none', take: 1 }] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_INVALID_ZONE_KIND,
    ],
    [
      'rejects draw zones in the visible prefix',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: { kind: 'topNVisible', visiblePrefix: { sources: [{ id: 'draw:none', take: 1 }] } },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX,
    ],
    [
      'rejects duplicate visible-prefix zones',
      {
        ...validBoundary(),
        schedule: {
          ...validSchedule(),
          observerPolicy: {
            kind: 'topNVisible',
            visiblePrefix: { sources: [{ id: 'lookahead:none', take: 1 }, { id: 'lookahead:none', take: 1 }] },
          },
        },
      },
      CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_DUPLICATE_ZONE,
    ],
  ];

  for (const [name, boundary, code] of malformedRows) {
    it(name, () => {
      assert.ok(diagnosticCodes(docWithBoundary(boundary)).includes(code), `expected ${code}`);
    });
  }

  it('accepts a valid topNVisible declaration and lowers the partial fallback shape', () => {
    const result = compileGameSpecToGameDef(baseDoc());

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef!.phaseBoundaries![0]!.schedule, validBoundary().schedule);
    assert.deepEqual(result.gameDef!.agents!.compiled.considerations.cards!.scheduleFallback, {
      onUnavailable: 'noContribution',
      onPartial: { visiblePrefixExhausted: 'useLowerBound' },
    });
  });

  it('requires onPartial.visiblePrefixExhausted for topNVisible schedule-distance refs', () => {
    const result = compileGameSpecToGameDef({
      ...baseDoc(),
      agents: {
        library: {
          considerations: {
            cards: {
              scopes: ['move'],
              weight: 1,
              value: ref('schedule.distance.toBoundary.coupEntry.cards'),
              scheduleFallback: { onUnavailable: 'noContribution' },
            },
          },
        },
      },
    });

    assert.ok(result.diagnostics.some((diagnostic) =>
      diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_FALLBACK_PARTIAL_REQUIRED
      && diagnostic.path === 'doc.agents.library.considerations.cards.scheduleFallback.onPartial.visiblePrefixExhausted',
    ));
  });
});
