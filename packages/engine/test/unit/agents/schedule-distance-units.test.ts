// @test-class: golden-trace
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

const defWithUnitRates = () => {
  const def = makeScheduleRefDef();
  return {
    ...def,
    phaseBoundaries: def.phaseBoundaries!.map((boundary) => boundary.schedule?.kind === 'cardDraw'
      ? {
          ...boundary,
          schedule: {
            ...boundary.schedule,
            unitRates: { microturns: 3, actions: 2, turns: 1, rounds: 4 },
          },
        }
      : boundary),
  };
};

function resolveAt(
  drawnCount: number,
  unit: 'microturns' | 'actions' | 'turns' | 'rounds',
) {
  const def = defWithUnitRates();
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

describe('schedule distance non-card units', () => {
  it('resolves declared non-card unit rates from the card distance source', () => {
    assert.deepEqual(
      [0, 1, 2].map((drawnCount) => [
        drawnCount,
        resolveAt(drawnCount, 'microturns'),
        resolveAt(drawnCount, 'actions'),
        resolveAt(drawnCount, 'turns'),
        resolveAt(drawnCount, 'rounds'),
      ]),
      [
        [
          0,
          { kind: 'ready', value: 6 },
          { kind: 'ready', value: 4 },
          { kind: 'ready', value: 2 },
          { kind: 'ready', value: 8 },
        ],
        [
          1,
          { kind: 'ready', value: 3 },
          { kind: 'ready', value: 2 },
          { kind: 'ready', value: 1 },
          { kind: 'ready', value: 4 },
        ],
        [
          2,
          { kind: 'ready', value: 6 },
          { kind: 'ready', value: 4 },
          { kind: 'ready', value: 2 },
          { kind: 'ready', value: 8 },
        ],
      ],
    );
  });

  it('preserves card-distance unavailable status for declared non-card units', () => {
    assert.deepEqual(resolveAt(5, 'actions'), {
      kind: 'unavailable',
      reason: 'noTriggeringCardRemaining',
    });
  });
});
