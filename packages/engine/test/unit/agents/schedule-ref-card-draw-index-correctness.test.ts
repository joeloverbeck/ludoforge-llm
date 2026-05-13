// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { applyEffects, buildAdjacencyGraph, createCollector, createRng } from '../../../src/kernel/index.js';
import { asBoundaryId, asPlayerId } from '../../../src/kernel/branded.js';
import {
  advanceScheduleIndexForDraw,
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
} from '../../../src/kernel/gamedef-runtime.js';
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { makeScheduleRefDef, scheduleDistanceRef, stateWithDrawnCount } from './schedule-ref-test-fixtures.js';

describe('schedule ref card-draw index correctness', () => {
  it('forks run-local draw positions without sharing currentDrawPosition across runs', () => {
    const def = makeScheduleRefDef();
    const shared = createGameDefRuntime(def);
    const left = forkGameDefRuntimeForRun(shared);
    const right = forkGameDefRuntimeForRun(shared);

    assert.equal(left.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))!.cardDrawState!.currentDrawPosition, 0);
    advanceScheduleIndexForDraw(left, 'eventDeck', 2);

    assert.equal(left.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))!.cardDrawState!.currentDrawPosition, 2);
    assert.equal(right.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))!.cardDrawState!.currentDrawPosition, 0);
    assert.deepEqual(
      left.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))!.definition,
      right.scheduleIndex.boundaries.get(asBoundaryId('coupEntry'))!.definition,
    );
  });

  it('updates card-draw distance once per matching boundary when draw effects move cards', () => {
    const def = makeScheduleRefDef();
    const runtime = forkGameDefRuntimeForRun(createGameDefRuntime(def));
    let state = stateWithDrawnCount(def, 0);

    const expectedDistances = [2, 1, 2, 1, undefined] as const;
    for (let draw = 0; draw < expectedDistances.length; draw += 1) {
      const resolution = createResolution(def, state, runtime);
      if (expectedDistances[draw] === undefined) {
        assert.deepEqual(resolution, { kind: 'unavailable', reason: 'noTriggeringCardRemaining' });
      } else {
        assert.deepEqual(resolution, { kind: 'ready', value: expectedDistances[draw] });
      }

      if (draw < expectedDistances.length - 1) {
        const ctx = makeExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          state,
          rng: createRng(1n),
          bindings: {},
          moveParams: {},
          collector: createCollector(),
          cachedRuntime: runtime,
        });
        state = applyEffects([{ _k: 7, draw: { from: 'draw:none', to: 'discard:none', count: 1 } }], ctx).state;
      }
    }

    assert.equal(runtime.scheduleIndex.lastAdvanceCount, 2);
  });
});

function createResolution(
  def: ReturnType<typeof makeScheduleRefDef>,
  state: ReturnType<typeof stateWithDrawnCount>,
  runtime: ReturnType<typeof forkGameDefRuntimeForRun>,
) {
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
  return providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef());
}
