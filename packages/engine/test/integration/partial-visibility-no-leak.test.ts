// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import { asPlayerId, createGameDefRuntime } from '../../src/kernel/index.js';
import {
  makePartialVisibilityDef,
  scheduleDistanceRef,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';

describe('partial-visibility hidden-tail no-leak behavior', () => {
  it('returns the visible-prefix lower bound even when the hidden tail contains a matching card', () => {
    const state = stateWithVisiblePrefix(def, ['op-1'], ['op-2'], ['coup-1']);
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'solo',
      trustedMoveIndex: new Map(),
      catalog: def.agents!,
      runtime: createGameDefRuntime(def),
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.deepEqual(providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef()), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
    });
  });
});

const def = makePartialVisibilityDef();
