// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  advanceScheduleIndexForDraw,
  asBoundaryId,
  asPlayerId,
  createGameDefRuntime,
  initialState,
  type CompiledAgentPolicyRef,
  type GameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const COUP_CARD_IDS = ['card-125', 'card-126', 'card-127', 'card-128', 'card-129', 'card-130'] as const;
const REF: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }> = {
  kind: 'scheduleDistance',
  target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') },
  unit: 'cards',
};

function resolveAtDrawCount(def: GameDef, drawnCount: number) {
  const state = initialState(def, 1000, 4).state;
  const runtime = createGameDefRuntime(def);
  advanceScheduleIndexForDraw(runtime, 'fitl-events-initial-card-pack', drawnCount);
  const providers = createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(1),
    seatId: 'arvn',
    trustedMoveIndex: new Map(),
    catalog: def.agents!,
    runtime,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
  return providers.phaseSchedule.resolveScheduleDistance(REF);
}

describe('FITL coupEntry phase boundary distance status', () => {
  it('byte-pins hidden-deck schedule status across representative coup positions', () => {
    const { parsed, compiled, gameDef } = getFitlProductionFixture();
    assertNoErrors(parsed);

    const boundary = gameDef.phaseBoundaries?.find((entry) => String(entry.id) === 'coupEntry');
    assert.deepEqual(boundary, {
      id: asBoundaryId('coupEntry'),
      kind: 'phaseEntry',
      phaseId: 'coupVictory',
      schedule: {
        kind: 'cardDraw',
        deckId: 'fitl-events-initial-card-pack',
        cardSelector: { tags: ['coup'] },
      },
    });

    const eventDeck = gameDef.eventDecks?.find((deck) => deck.id === 'fitl-events-initial-card-pack');
    assert.ok(eventDeck, 'expected FITL event deck');
    assert.deepEqual(
      eventDeck.cards.filter((card) => card.tags?.includes('coup')).map((card) => card.id),
      [...COUP_CARD_IDS],
    );
    assert.equal(
      gameDef.zones.find((zone) => String(zone.id) === eventDeck.drawZone)?.visibility,
      'hidden',
    );

    const runtime = createGameDefRuntime(gameDef);
    assert.deepEqual(
      runtime.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))?.cardDrawState?.triggeringCardPositions,
      [125, 126, 127, 128, 129, 130],
      'coupEntry should derive from the canonical FITL coup-card positions',
    );

    assert.deepEqual(
      [0, 1, 125, 128, 130].map((drawnCount) => [drawnCount, resolveAtDrawCount(gameDef, drawnCount)]),
      [
        [0, { kind: 'unavailable', reason: 'hiddenDeck' }],
        [1, { kind: 'unavailable', reason: 'hiddenDeck' }],
        [125, { kind: 'unavailable', reason: 'hiddenDeck' }],
        [128, { kind: 'unavailable', reason: 'hiddenDeck' }],
        [130, { kind: 'unavailable', reason: 'hiddenDeck' }],
      ],
    );
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  });
});
