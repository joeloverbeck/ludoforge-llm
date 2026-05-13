// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { asPlayerId } from '../../../src/kernel/index.js';
import {
  makeScheduleRefDef,
  runtimeWithDrawnCount,
  scheduleDistanceRef,
  stateWithDrawnCount,
} from './schedule-ref-test-fixtures.js';

const unitRates = { microturns: 5, actions: 3, turns: 2, rounds: 7 } as const;
type RatedUnit = keyof typeof unitRates;

function makeRatedDef() {
  const def = makeScheduleRefDef();
  return {
    ...def,
    phaseBoundaries: def.phaseBoundaries!.map((boundary) => boundary.schedule?.kind === 'cardDraw'
      ? {
          ...boundary,
          schedule: { ...boundary.schedule, unitRates },
        }
      : boundary),
  };
}

function resolve(drawnCount: number, unit: 'cards' | RatedUnit) {
  const def = makeRatedDef();
  const providers = createPolicyRuntimeProviders({
    def,
    state: stateWithDrawnCount(def, drawnCount),
    playerId: asPlayerId(0),
    seatId: 'solo',
    trustedMoveIndex: new Map(),
    catalog: def.agents!,
    runtime: runtimeWithDrawnCount(def, drawnCount),
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
  return providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef('coupEntry', unit));
}

describe('schedule distance cross-unit consistency', () => {
  it('keeps non-card distances as exact multiples of card distance', () => {
    for (const drawnCount of [0, 1, 2, 3]) {
      const cards = resolve(drawnCount, 'cards');
      assert.equal(cards.kind, 'ready');
      const cardValue = cards.value;
      if (typeof cardValue !== 'number') {
        throw new Error(`expected numeric card distance, got ${String(cardValue)}`);
      }
      for (const [unit, rate] of Object.entries(unitRates) as [RatedUnit, number][]) {
        assert.deepEqual(resolve(drawnCount, unit), {
          kind: 'ready',
          value: cardValue * rate,
        });
      }
    }
  });

  it('shares card distance unavailable status across all declared units', () => {
    for (const unit of Object.keys(unitRates) as RatedUnit[]) {
      assert.deepEqual(resolve(5, unit), {
        kind: 'unavailable',
        reason: 'noTriggeringCardRemaining',
      });
    }
  });
});
