// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { asPlayerId } from '../../../src/kernel/index.js';
import { makeScheduleRefDef, runtimeWithDrawnCount, scheduleDistanceRef, stateWithDrawnCount } from './schedule-ref-test-fixtures.js';

describe('schedule distance cards golden', () => {
  it('byte-pins card distances across five deck positions', () => {
    const def = makeScheduleRefDef();
    const rows = [0, 1, 2, 3, 5].map((drawnCount) => {
      const runtime = runtimeWithDrawnCount(def, drawnCount);
      const state = stateWithDrawnCount(def, drawnCount);
      const providers = createPolicyRuntimeProviders({
        def,
        state,
        playerId: asPlayerId(0),
        seatId: 'solo',
        trustedMoveIndex: new Map(),
        catalog: def.agents!,
        runtime,
        runtimeError: (code, message) => new Error(`${code}: ${message}`),
      });
      return [drawnCount, providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef())] as const;
    });

    assert.deepEqual(rows, [
      [0, { kind: 'ready', value: 2 }],
      [1, { kind: 'ready', value: 1 }],
      [2, { kind: 'ready', value: 2 }],
      [3, { kind: 'ready', value: 1 }],
      [5, { kind: 'unavailable', reason: 'noTriggeringCardRemaining' }],
    ]);
  });
});
