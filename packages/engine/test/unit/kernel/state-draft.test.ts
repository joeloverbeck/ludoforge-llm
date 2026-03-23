import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameState, Token } from '../../../src/kernel/types.js';
import {
  createDraftTracker,
  createMutableState,
  ensureMarkerCloned,
  ensurePlayerVarCloned,
  ensureZoneCloned,
  ensureZoneVarCloned,
  freezeState,
} from '../../../src/kernel/state-draft.js';

/**
 * Minimal GameState fixture with enough structure to exercise all
 * createMutableState cloning paths. Uses `as unknown as GameState`
 * to avoid requiring every branded type for a unit test.
 */
function makeMinimalState(): GameState {
  const token1: Token = { id: 't1', type: 'card', props: {} } as Token;
  const token2: Token = { id: 't2', type: 'card', props: {} } as Token;
  const token3: Token = { id: 't3', type: 'card', props: {} } as Token;

  return {
    globalVars: { score: 10, round: 1 },
    perPlayerVars: {
      0: { hp: 100, gold: 50 },
      1: { hp: 80, gold: 30 },
    },
    zoneVars: {
      'board:hand': { size: 5 },
      'board:deck': { size: 40 },
    },
    playerCount: 2,
    zones: {
      'board:hand': [token1],
      'board:deck': [token2, token3],
    },
    nextTokenOrdinal: 4,
    currentPhase: 'main',
    activePlayer: 0,
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
    stateHash: 0n,
    actionUsage: { attack: { count: 1, lastTurn: 0 } },
    turnOrderState: { type: 'roundRobin' },
    markers: {
      control: { zoneA: 'red', zoneB: 'blue' },
    },
    reveals: { reveal1: [] },
    globalMarkers: { weather: 'sunny' },
    activeLastingEffects: [],
    interruptPhaseStack: [],
  } as unknown as GameState;
}

/** Same state but without optional fields. */
function makeStateWithoutOptionals(): GameState {
  const base = makeMinimalState() as unknown as Record<string, unknown>;
  delete base.reveals;
  delete base.globalMarkers;
  delete base.activeLastingEffects;
  delete base.interruptPhaseStack;
  return base as unknown as GameState;
}

describe('state-draft', () => {
  describe('createMutableState', () => {
    it('produces a structurally equivalent state (deep equality)', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      assert.deepStrictEqual(mutable, original);
    });

    it('does NOT alias top-level nested objects', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);

      assert.notEqual(mutable.globalVars, original.globalVars);
      assert.notEqual(mutable.perPlayerVars, original.perPlayerVars);
      assert.notEqual(mutable.zoneVars, original.zoneVars);
      assert.notEqual(mutable.zones, original.zones);
      assert.notEqual(mutable.actionUsage, original.actionUsage);
      assert.notEqual(mutable.markers, original.markers);
      assert.notEqual(mutable.turnOrderState, original.turnOrderState);
      assert.notEqual(mutable.reveals, original.reveals);
      assert.notEqual(mutable.globalMarkers, original.globalMarkers);
      assert.notEqual(mutable.activeLastingEffects, original.activeLastingEffects);
      assert.notEqual(mutable.interruptPhaseStack, original.interruptPhaseStack);
    });

    it('inner maps of top-level records ARE still aliased (copy-on-write deferred)', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);

      // Inner maps are shared until copy-on-write
      assert.equal(mutable.perPlayerVars[0], original.perPlayerVars[0]);
      assert.equal(mutable.zoneVars['board:hand'], original.zoneVars['board:hand']);
      assert.equal(mutable.zones['board:hand'], original.zones['board:hand']);
      assert.equal(mutable.markers['control'], original.markers['control']);
    });

    it('omits optional fields that are undefined', () => {
      const original = makeStateWithoutOptionals();
      const mutable = createMutableState(original);
      assert.equal(mutable.reveals, undefined);
      assert.equal(mutable.globalMarkers, undefined);
      assert.equal(mutable.activeLastingEffects, undefined);
      assert.equal(mutable.interruptPhaseStack, undefined);
    });
  });

  describe('freezeState', () => {
    it('returns the same reference it receives', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      const frozen = freezeState(mutable);
      assert.equal(frozen, mutable);
    });
  });

  describe('createDraftTracker', () => {
    it('returns empty Sets', () => {
      const tracker = createDraftTracker();
      assert.equal(tracker.playerVars.size, 0);
      assert.equal(tracker.zoneVars.size, 0);
      assert.equal(tracker.zones.size, 0);
      assert.equal(tracker.markers.size, 0);
    });
  });

  describe('ensurePlayerVarCloned', () => {
    it('clones the inner map on first call', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      const tracker = createDraftTracker();

      // Before: inner map is aliased
      assert.equal(mutable.perPlayerVars[0], original.perPlayerVars[0]);

      ensurePlayerVarCloned(mutable, tracker, 0);

      // After: inner map is a fresh clone
      assert.notEqual(mutable.perPlayerVars[0], original.perPlayerVars[0]);
      assert.deepStrictEqual(mutable.perPlayerVars[0], original.perPlayerVars[0]);
      assert.ok(tracker.playerVars.has(0));
    });

    it('is idempotent — second call returns same reference', () => {
      const mutable = createMutableState(makeMinimalState());
      const tracker = createDraftTracker();

      ensurePlayerVarCloned(mutable, tracker, 0);
      const afterFirst = mutable.perPlayerVars[0];

      ensurePlayerVarCloned(mutable, tracker, 0);
      assert.equal(mutable.perPlayerVars[0], afterFirst);
    });
  });

  describe('ensureZoneVarCloned', () => {
    it('clones the inner map on first call', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      const tracker = createDraftTracker();

      assert.equal(mutable.zoneVars['board:hand'], original.zoneVars['board:hand']);

      ensureZoneVarCloned(mutable, tracker, 'board:hand');

      assert.notEqual(mutable.zoneVars['board:hand'], original.zoneVars['board:hand']);
      assert.deepStrictEqual(mutable.zoneVars['board:hand'], original.zoneVars['board:hand']);
      assert.ok(tracker.zoneVars.has('board:hand'));
    });

    it('is idempotent', () => {
      const mutable = createMutableState(makeMinimalState());
      const tracker = createDraftTracker();

      ensureZoneVarCloned(mutable, tracker, 'board:hand');
      const afterFirst = mutable.zoneVars['board:hand'];

      ensureZoneVarCloned(mutable, tracker, 'board:hand');
      assert.equal(mutable.zoneVars['board:hand'], afterFirst);
    });
  });

  describe('ensureZoneCloned', () => {
    it('clones the zone token array on first call', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      const tracker = createDraftTracker();

      assert.equal(mutable.zones['board:hand'], original.zones['board:hand']);

      ensureZoneCloned(mutable, tracker, 'board:hand');

      assert.notEqual(mutable.zones['board:hand'], original.zones['board:hand']);
      assert.deepStrictEqual(mutable.zones['board:hand'], original.zones['board:hand']);
      assert.ok(tracker.zones.has('board:hand'));
    });

    it('is idempotent', () => {
      const mutable = createMutableState(makeMinimalState());
      const tracker = createDraftTracker();

      ensureZoneCloned(mutable, tracker, 'board:hand');
      const afterFirst = mutable.zones['board:hand'];

      ensureZoneCloned(mutable, tracker, 'board:hand');
      assert.equal(mutable.zones['board:hand'], afterFirst);
    });

    it('produces an empty array for a non-existent zone', () => {
      const mutable = createMutableState(makeMinimalState());
      const tracker = createDraftTracker();

      ensureZoneCloned(mutable, tracker, 'board:nonexistent');
      assert.deepStrictEqual(mutable.zones['board:nonexistent'], []);
    });
  });

  describe('ensureMarkerCloned', () => {
    it('clones the inner marker map on first call', () => {
      const original = makeMinimalState();
      const mutable = createMutableState(original);
      const tracker = createDraftTracker();

      assert.equal(mutable.markers['control'], original.markers['control']);

      ensureMarkerCloned(mutable, tracker, 'control');

      assert.notEqual(mutable.markers['control'], original.markers['control']);
      assert.deepStrictEqual(mutable.markers['control'], original.markers['control']);
      assert.ok(tracker.markers.has('control'));
    });

    it('is idempotent', () => {
      const mutable = createMutableState(makeMinimalState());
      const tracker = createDraftTracker();

      ensureMarkerCloned(mutable, tracker, 'control');
      const afterFirst = mutable.markers['control'];

      ensureMarkerCloned(mutable, tracker, 'control');
      assert.equal(mutable.markers['control'], afterFirst);
    });
  });
});
