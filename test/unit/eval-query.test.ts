import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalQuery,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-query-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('bench:1'), owner: 'player', visibility: 'public', ordering: 'queue' },
    { id: asZoneId('tableau:2'), owner: 'player', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { cost: 1 },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 3,
  zones: {
    'deck:none': [makeToken('deck-1'), makeToken('deck-2')],
    'hand:0': [makeToken('hand-0')],
    'hand:1': [makeToken('hand-1')],
    'bench:1': [],
    'tableau:2': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(2),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  state: makeState(),
  activePlayer: asPlayerId(2),
  actorPlayer: asPlayerId(1),
  bindings: {},
  ...overrides,
});

describe('evalQuery', () => {
  it('returns tokensInZone in state container order and without mutating zone arrays', () => {
    const ctx = makeCtx();

    const result = evalQuery({ query: 'tokensInZone', zone: 'deck:none' }, ctx);
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('deck-1'), asTokenId('deck-2')],
    );

    const mutableCopy = [...result] as Token[];
    mutableCopy.push(makeToken('deck-3'));
    assert.equal(ctx.state.zones['deck:none']?.length, 2);
  });

  it('evaluates intsInRange edge cases', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 1, max: 5 }, ctx), [1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 3, max: 3 }, ctx), [3]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 5, max: 3 }, ctx), []);
  });

  it('echoes enums and returns players sorted ascending', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'enums', values: ['red', 'blue', 'green'] }, ctx), ['red', 'blue', 'green']);
    assert.deepEqual(evalQuery({ query: 'players' }, ctx), [asPlayerId(0), asPlayerId(1), asPlayerId(2)]);
  });

  it('returns zones sorted, and filter.owner=actor resolves correctly', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'zones' }, ctx), ['bench:1', 'deck:none', 'hand:0', 'hand:1', 'tableau:2']);
    assert.deepEqual(evalQuery({ query: 'zones', filter: { owner: 'actor' } }, ctx), ['bench:1', 'hand:1']);
  });

  it('throws SPATIAL_NOT_IMPLEMENTED for all spatial query variants', () => {
    const ctx = makeCtx();

    assert.throws(
      () => evalQuery({ query: 'adjacentZones', zone: 'deck:none' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'SPATIAL_NOT_IMPLEMENTED') &&
        typeof error.message === 'string' &&
        error.message.includes('adjacentZones'),
    );
    assert.throws(
      () => evalQuery({ query: 'tokensInAdjacentZones', zone: 'deck:none' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'SPATIAL_NOT_IMPLEMENTED') &&
        typeof error.message === 'string' &&
        error.message.includes('tokensInAdjacentZones'),
    );
    assert.throws(
      () => evalQuery({ query: 'connectedZones', zone: 'deck:none' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'SPATIAL_NOT_IMPLEMENTED') &&
        typeof error.message === 'string' &&
        error.message.includes('connectedZones'),
    );
  });

  it('throws QUERY_BOUNDS_EXCEEDED when a query would exceed maxQueryResults', () => {
    const ctx = makeCtx({ maxQueryResults: 3 });

    assert.throws(
      () => evalQuery({ query: 'intsInRange', min: 1, max: 10 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
  });
});
