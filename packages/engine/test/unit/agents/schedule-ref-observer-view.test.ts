// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { asPlayerId } from '../../../src/kernel/index.js';
import { createGameDefRuntime, forkGameDefRuntimeForRun } from '../../../src/kernel/gamedef-runtime.js';
import { makeScheduleRefDef, scheduleDistanceRef, scoreScheduleConsiderations, stateWithDrawnCount } from './schedule-ref-test-fixtures.js';

describe('schedule ref observer view', () => {
  it('resolves public draw-zone deck distance as ready', () => {
    const def = makeScheduleRefDef(false);
    const runtime = forkGameDefRuntimeForRun(createGameDefRuntime(def));
    const providers = providersFor(def, runtime);

    assert.deepEqual(providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef()), { kind: 'ready', value: 2 });
  });

  it('returns hiddenDeck for hidden draw-zone decks and does not leak numeric distance through fallback', () => {
    const def = makeScheduleRefDef(true);
    const runtime = forkGameDefRuntimeForRun(createGameDefRuntime(def));
    const providers = providersFor(def, runtime);

    assert.deepEqual(providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef()), {
      kind: 'unavailable',
      reason: 'hiddenDeck',
    });

    const scored = scoreScheduleConsiderations(def, stateWithDrawnCount(def, 0), ['explicitZero'], runtime);
    assert.deepEqual(scored.scoreContributions, [{ termId: 'explicitZero', contribution: 0 }]);
    assert.deepEqual(scored.scheduleFallbackFired, { termId: 'explicitZero', kind: 'constant', value: 0 });
  });
});

function providersFor(def: ReturnType<typeof makeScheduleRefDef>, runtime: ReturnType<typeof forkGameDefRuntimeForRun>) {
  return createPolicyRuntimeProviders({
    def,
    state: stateWithDrawnCount(def, 0),
    playerId: asPlayerId(0),
    seatId: 'solo',
    trustedMoveIndex: new Map(),
    catalog: def.agents!,
    runtime,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}
