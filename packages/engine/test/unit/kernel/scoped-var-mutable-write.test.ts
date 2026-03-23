import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
} from '../../../src/kernel/index.js';
import {
  createDraftTracker,
  createMutableState,
} from '../../../src/kernel/state-draft.js';
import {
  type ScopedVarWrite,
  writeScopedVarsMutable,
  writeScopedVarsToState,
} from '../../../src/kernel/scoped-var-runtime-access.js';
import type { GameState } from '../../../src/kernel/types.js';

const makeState = (): GameState => ({
  globalVars: { score: 5, flag: true },
  perPlayerVars: {
    '0': { hp: 7, ready: false },
    '1': { hp: 3, ready: true },
  },
  zoneVars: { 'zone-a:none': { supply: 9 } },
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('writeScopedVarsMutable', () => {
  it('applies a global var write', () => {
    const original = makeState();
    const mutable = createMutableState(original);
    const tracker = createDraftTracker();

    const writes: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'global', var: 'score' }, value: 42 },
    ];

    writeScopedVarsMutable(mutable, writes, tracker);

    assert.equal(mutable.globalVars.score, 42);
    // Original must be untouched.
    assert.equal(original.globalVars.score, 5);
  });

  it('applies a per-player var write and clones the inner map', () => {
    const original = makeState();
    const originalInnerP0 = original.perPlayerVars[0];
    const mutable = createMutableState(original);
    const tracker = createDraftTracker();

    const writes: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'pvar', var: 'hp', player: 0 as never }, value: 99 },
    ];

    writeScopedVarsMutable(mutable, writes, tracker);

    assert.equal(mutable.perPlayerVars[0]!.hp, 99);
    // Inner map must be a different reference (cloned).
    assert.notEqual(mutable.perPlayerVars[0], originalInnerP0);
    // Original inner map untouched.
    assert.equal(originalInnerP0!.hp, 7);
  });

  it('applies a zone var write and clones the inner map', () => {
    const original = makeState();
    const originalInnerZone = original.zoneVars['zone-a:none'];
    const mutable = createMutableState(original);
    const tracker = createDraftTracker();

    const writes: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'zone', var: 'supply', zone: asZoneId('zone-a:none') }, value: 15 },
    ];

    writeScopedVarsMutable(mutable, writes, tracker);

    assert.equal(mutable.zoneVars['zone-a:none']!.supply, 15);
    // Inner map must be a different reference (cloned).
    assert.notEqual(mutable.zoneVars['zone-a:none'], originalInnerZone);
    // Original inner map untouched.
    assert.equal(originalInnerZone!.supply, 9);
  });

  it('clones a player inner map only once for multiple writes (tracker idempotency)', () => {
    const mutable = createMutableState(makeState());
    const tracker = createDraftTracker();

    const writes: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'pvar', var: 'hp', player: 0 as never }, value: 10 },
    ];
    writeScopedVarsMutable(mutable, writes, tracker);
    const refAfterFirstWrite = mutable.perPlayerVars[0];

    const writes2: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'pvar', var: 'ready', player: 0 as never }, value: true },
    ];
    writeScopedVarsMutable(mutable, writes2, tracker);

    // Same reference — tracker prevented a second clone.
    assert.equal(mutable.perPlayerVars[0], refAfterFirstWrite);
    // Both values applied.
    assert.equal(mutable.perPlayerVars[0]!.hp, 10);
    assert.equal(mutable.perPlayerVars[0]!.ready, true);
  });

  it('produces the same var values as writeScopedVarsToState (parity check)', () => {
    const base = makeState();

    const writes: readonly ScopedVarWrite[] = [
      { endpoint: { scope: 'global', var: 'score' }, value: 77 },
      { endpoint: { scope: 'global', var: 'flag' }, value: false },
      { endpoint: { scope: 'pvar', var: 'hp', player: 0 as never }, value: 20 },
      { endpoint: { scope: 'pvar', var: 'hp', player: 1 as never }, value: 11 },
      { endpoint: { scope: 'zone', var: 'supply', zone: asZoneId('zone-a:none') }, value: 0 },
    ];

    // Spread-based path.
    const spreadResult = writeScopedVarsToState(base, writes);

    // Mutable path.
    const mutable = createMutableState(base);
    const tracker = createDraftTracker();
    writeScopedVarsMutable(mutable, writes, tracker);

    assert.deepStrictEqual(mutable.globalVars, spreadResult.globalVars);
    assert.deepStrictEqual(mutable.perPlayerVars, spreadResult.perPlayerVars);
    assert.deepStrictEqual(mutable.zoneVars, spreadResult.zoneVars);
  });
});
