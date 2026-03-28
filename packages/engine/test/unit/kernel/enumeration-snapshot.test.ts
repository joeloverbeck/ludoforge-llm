import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  computeZoneTotal,
  createEnumerationSnapshot,
  createLazyMarkerStates,
  createLazyZoneTotals,
  createLazyZoneVars,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'enumeration-snapshot-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('province:alpha'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: { monsoon: true, resources: 6 },
  perPlayerVars: {
    0: { resources: 2, ready: false },
    1: { resources: 5, ready: true },
  },
  zoneVars: {
    'board:none': { support: 1 },
    'province:alpha': { support: 3 },
  },
  playerCount: 2,
  zones: {
    'board:none': [
      { id: asTokenId('tok-1'), type: 'troop', props: {} },
      { id: asTokenId('tok-2'), type: 'troop', props: {} },
      { id: asTokenId('tok-3'), type: 'base', props: {} },
    ],
    'province:alpha': [
      { id: asTokenId('tok-4'), type: 'troop:red', props: {} },
    ],
  },
  nextTokenOrdinal: 5,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {
    hanoi: { control: 'nva', posture: 'active' },
  },
});

describe('enumeration snapshot', () => {
  it('creates a plain snapshot with direct global and per-player var references', () => {
    const def = makeDef();
    const state = makeState();
    const snapshot = createEnumerationSnapshot(def, state);

    assert.equal(Object.getPrototypeOf(snapshot), Object.prototype);
    assert.equal(snapshot.globalVars, state.globalVars);
    assert.equal(snapshot.perPlayerVars, state.perPlayerVars);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'activePlayerVars'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'activePlayer'), false);
  });

  it('exposes multiple players through the same snapshot', () => {
    const def = makeDef();
    const state = makeState();

    const snapshot = createEnumerationSnapshot(def, state);

    assert.equal(snapshot.perPlayerVars[0]?.resources, 2);
    assert.equal(snapshot.perPlayerVars[1]?.resources, 5);
  });
});

describe('createLazyZoneTotals()', () => {
  it('returns token-type and total counts for a zone', () => {
    const totals = createLazyZoneTotals(makeState(), makeDef());

    assert.equal(totals.get('board:none', 'troop'), 2);
    assert.equal(totals.get('board:none'), 3);
    assert.equal(totals.get('province:alpha', 'troop:red'), 1);
  });

  it('caches each zone/token pair after the first computation', () => {
    const state = makeState();
    const totals = createLazyZoneTotals(state, makeDef());

    assert.equal(totals.get('board:none', 'troop'), 2);
    (state.zones as Record<string, unknown>)['board:none'] = [];
    assert.equal(totals.get('board:none', 'troop'), 2);
  });

  it('supports zone ids containing colons without parsing ambiguity', () => {
    const totals = createLazyZoneTotals(makeState(), makeDef());

    assert.equal(totals.get('board:none', 'base'), 1);
    assert.equal(totals.get('province:alpha'), 1);
  });
});

describe('createLazyZoneVars()', () => {
  it('returns zone var values and undefined for missing entries', () => {
    const zoneVars = createLazyZoneVars(makeState());

    assert.equal(zoneVars.get(asZoneId('province:alpha'), 'support'), 3);
    assert.equal(zoneVars.get('province:alpha', 'missing'), undefined);
    assert.equal(zoneVars.get('missing:zone', 'support'), undefined);
  });
});

describe('createLazyMarkerStates()', () => {
  it('returns marker states and undefined for missing entries', () => {
    const markerStates = createLazyMarkerStates(makeState());

    assert.equal(markerStates.get('hanoi', 'control'), 'nva');
    assert.equal(markerStates.get('hanoi', 'missing'), undefined);
    assert.equal(markerStates.get('saigon', 'control'), undefined);
  });
});

describe('computeZoneTotal()', () => {
  it('rejects unknown or empty structured zone requests', () => {
    const state = makeState();
    const def = makeDef();

    assert.throws(() => computeZoneTotal(state, def, ''), /must not be empty/u);
    assert.throws(() => computeZoneTotal(state, def, 'missing:none'), /unknown zone/u);
  });

  it('returns totals for declared zones with optional token filtering', () => {
    const state = makeState();
    const def = makeDef();

    assert.equal(computeZoneTotal(state, def, 'board:none'), 3);
    assert.equal(computeZoneTotal(state, def, 'board:none', 'troop'), 2);
    assert.equal(computeZoneTotal(state, def, 'province:alpha', 'troop:red'), 1);
  });
});
