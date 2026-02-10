import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  isEvalErrorCode,
  resolveRef,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'resolve-ref-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:2'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeToken = (id: string, props: Readonly<Record<string, number | string | boolean>>): Token => ({
  id: asTokenId(id),
  type: 'card',
  props,
});

const makeState = (): GameState => ({
  globalVars: { threat: 5, tempo: 2 },
  perPlayerVars: {
    0: { money: 7 },
    1: { money: 10 },
    2: { money: 4 },
  },
  playerCount: 3,
  zones: {
    'deck:none': [makeToken('deck-1', { cost: 3 }), makeToken('deck-2', { cost: 1 })],
    'hand:0': [],
    'hand:1': [makeToken('hand-1', { cost: 2 })],
    'hand:2': [],
  },
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
  bindings: {
    '$x': 42,
    '$card': makeToken('bound-1', { cost: 9, color: 'blue', faceUp: true }),
  },
  ...overrides,
});

describe('resolveRef', () => {
  it('resolves gvar and throws MISSING_VAR when global var is absent', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'gvar', var: 'threat' }, ctx), 5);

    assert.throws(() => resolveRef({ ref: 'gvar', var: 'missing' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('resolves pvar and enforces single-player selector cardinality', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'pvar', player: 'actor', var: 'money' }, ctx), 10);

    assert.throws(() => resolveRef({ ref: 'pvar', player: 'all', var: 'money' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });

  it('resolves zoneCount and enforces single-zone selector cardinality', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'zoneCount', zone: 'deck:none' }, ctx), 2);

    assert.throws(() => resolveRef({ ref: 'zoneCount', zone: 'hand:all' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });

  it('resolves tokenProp from a bound token and reports unbound/missing prop errors', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'tokenProp', token: '$card', prop: 'cost' }, ctx), 9);

    assert.throws(() => resolveRef({ ref: 'tokenProp', token: '$missing', prop: 'cost' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_BINDING'),
    );

    assert.throws(() => resolveRef({ ref: 'tokenProp', token: '$card', prop: 'missingProp' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_VAR') &&
      typeof error.message === 'string' &&
      error.message.includes('availableBindings'),
    );
  });

  it('resolves binding and rejects missing or non-scalar binding values', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'binding', name: '$x' }, ctx), 42);

    assert.throws(() => resolveRef({ ref: 'binding', name: '$missing' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_BINDING') &&
      typeof error.message === 'string' &&
      error.message.includes('availableBindings'),
    );

    const objectBindingCtx = makeCtx({ bindings: { '$obj': { nested: true } } });
    assert.throws(() => resolveRef({ ref: 'binding', name: '$obj' }, objectBindingCtx), (error: unknown) =>
      isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });
});
