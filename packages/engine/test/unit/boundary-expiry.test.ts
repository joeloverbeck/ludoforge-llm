import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  type GameDef,
  type GameState,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

import { applyBoundaryExpiry } from '../../src/kernel/boundary-expiry.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'boundary-expiry-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zoneVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
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

describe('applyBoundaryExpiry', () => {
  it('returns unchanged state when boundaryDurations is undefined', () => {
    const def = makeDef();
    const state = makeState();
    const result = applyBoundaryExpiry(def, state, undefined);
    assert.equal(result.state, state);
    assert.deepEqual(result.traceEntries, []);
  });

  it('returns unchanged state when boundaryDurations is empty array', () => {
    const def = makeDef();
    const state = makeState();
    const result = applyBoundaryExpiry(def, state, []);
    assert.equal(result.state, state);
    assert.deepEqual(result.traceEntries, []);
  });

  it('does not mutate provided triggerLogCollector when no expiry occurs', () => {
    const def = makeDef();
    const state = makeState();
    const collector: TriggerLogEntry[] = [];
    applyBoundaryExpiry(def, state, undefined, collector);
    assert.equal(collector.length, 0);
  });

  it('processes non-empty boundaryDurations and returns result', () => {
    const def = makeDef();
    const state = makeState();
    const result = applyBoundaryExpiry(def, state, ['turn']);
    assert.ok(result.state !== undefined);
    assert.ok(Array.isArray(result.traceEntries));
  });

  it('accepts effectPathRoot parameter without error', () => {
    const def = makeDef();
    const state = makeState();
    const result = applyBoundaryExpiry(def, state, ['turn'], undefined, undefined, undefined, 'customPath');
    assert.ok(result.state !== undefined);
  });

  it('passes collector when provided without error', () => {
    const def = makeDef();
    const state = makeState();
    const collector: TriggerLogEntry[] = [];
    const result = applyBoundaryExpiry(def, state, ['turn'], collector);
    assert.ok(result.state !== undefined);
  });
});
