import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildZoneRuntimeIndex,
  getRuntimeZoneTokenArrays,
  getZoneTokensByCanonicalId,
  invalidateRuntimeZoneStateCache,
  type GameDef,
  type GameState,
  type Token,
} from '../../../src/kernel/index.js';

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: {},
});

const makeDef = (): GameDef => ({
  metadata: { id: 'runtime-zone-state-test', players: { min: 1, max: 2 } },
  internTable: {
    zones: ['bench:none', 'alpha:none', 'zeta:none'],
    actions: [],
    tokenTypes: [],
    seats: [],
    players: ['0', '1'],
    phases: [],
    globalVars: [],
    perPlayerVars: [],
    zoneVars: [],
  },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('bench:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('zeta:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'alpha:none': [makeToken('alpha-1')],
    'bench:none': [makeToken('bench-1'), makeToken('bench-2')],
    'zeta:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('runtime zone state', () => {
  it('builds cached zone token arrays in runtime zone order', () => {
    const def = makeDef();
    const state = makeState();
    const zoneRuntimeIndex = buildZoneRuntimeIndex(def);

    const arrays = getRuntimeZoneTokenArrays(state, zoneRuntimeIndex);

    assert.deepEqual(arrays.map((tokens) => tokens.map((token) => token.id)), [
      [asTokenId('bench-1'), asTokenId('bench-2')],
      [asTokenId('alpha-1')],
      [],
    ]);
    assert.equal(getZoneTokensByCanonicalId(state, asZoneId('bench:none'), zoneRuntimeIndex)?.length, 2);
  });

  it('rebuilds after explicit cache invalidation', () => {
    const def = makeDef();
    const state = makeState();
    const zoneRuntimeIndex = buildZoneRuntimeIndex(def);

    void getRuntimeZoneTokenArrays(state, zoneRuntimeIndex);
    (state.zones as Record<string, readonly Token[]>)['bench:none'] = [makeToken('bench-updated')];
    invalidateRuntimeZoneStateCache(state);

    assert.deepEqual(
      getZoneTokensByCanonicalId(state, asZoneId('bench:none'), zoneRuntimeIndex)?.map((token) => token.id),
      [asTokenId('bench-updated')],
    );
  });
});
