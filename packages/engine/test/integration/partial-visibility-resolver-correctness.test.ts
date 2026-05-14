// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import { asPlayerId, createGameDefRuntime, type GameDef, type GameState } from '../../src/kernel/index.js';
import {
  makePartialVisibilityDef,
  scheduleDistanceRef,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';

describe('partial-visibility resolver correctness', () => {
  it('returns ready value 0 when the first visible-prefix card matches', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, ['coup-1'], ['op-1'])), {
      kind: 'ready',
      value: 0,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 1,
      visibleSequenceSources: [{ zoneId: 'lookahead:none', availablePublic: 1, taken: 1 }],
    });
  });

  it('returns ready value 1 when the second visible-prefix card matches', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, ['op-1'], ['coup-1'])), {
      kind: 'ready',
      value: 1,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('caps each source contribution at take before scanning the next source', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, ['op-1', 'op-2', 'op-1'], ['coup-1'])), {
      kind: 'ready',
      value: 1,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 3, taken: 1 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('returns partial lowerBound 2 when two occupied visible zones do not match', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, ['op-1'], ['op-2'])), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('returns partial lowerBound 1 when the first visible zone is empty and the second does not match', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, [], ['op-1'])), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 1,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 1,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 0, taken: 0 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('returns partial lowerBound 0 when all listed visible-prefix zones are empty', () => {
    assert.deepEqual(resolve(stateWithVisiblePrefix(def, [], [])), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 0,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 0,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 0, taken: 0 },
        { zoneId: 'leader:none', availablePublic: 0, taken: 0 },
      ],
    });
  });

  it('returns byte-identical resolver readouts across twenty turn-indexed states for the same fixture seed', () => {
    const expected = {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    };

    for (let turnCount = 0; turnCount < 20; turnCount += 1) {
      assert.deepEqual(resolve(stateWithVisiblePrefix(def, ['op-1'], ['op-2'], ['coup-1'], turnCount)), expected);
    }
  });
});

const def = makePartialVisibilityDef();

function resolve(state: GameState) {
  const providers = providersFor(def, state);
  return providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef());
}

function providersFor(gameDef: GameDef, state: GameState) {
  return createPolicyRuntimeProviders({
    def: gameDef,
    state,
    playerId: asPlayerId(0),
    seatId: 'solo',
    trustedMoveIndex: new Map(),
    catalog: gameDef.agents!,
    runtime: createGameDefRuntime(gameDef),
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}
