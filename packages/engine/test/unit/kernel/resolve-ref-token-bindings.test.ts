// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  resolveRef,
  type GameDef,
  type GameState,
  type Token,
} from '../../../src/kernel/index.js';
import { isEvalErrorCode } from '../../../src/kernel/eval-error.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'resolve-ref-token-bindings-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('zone-a:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('zone-b:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { value: 'int' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
}) as unknown as GameDef;

const makeState = (tokens: readonly Token[]): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'zone-a:none': [...tokens],
    'zone-b:none': [],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

describe('resolveRef tokenProp token bindings', () => {
  it('resolves tokenProp from token-id string bindings', () => {
    const token: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 7 } };
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([token]),
      rng: createRng(7n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: asTokenId('tok-1') },
      moveParams: {},
      collector: createCollector(),
    });

    const resolved = resolveRef({ ref: 'tokenProp', token: '$tok', prop: 'value' }, ctx);
    assert.equal(resolved, 7);
  });

  it('resolves tokenProp from token-object bindings', () => {
    const token: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 9 } };
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([token]),
      rng: createRng(11n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: token },
      moveParams: {},
      collector: createCollector(),
    });

    const resolved = resolveRef({ ref: 'tokenProp', token: '$tok', prop: 'value' }, ctx);
    assert.equal(resolved, 9);
  });

  it('throws missing-token error when token-id binding cannot be resolved in state', () => {
    const token: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 9 } };
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([token]),
      rng: createRng(13n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: asTokenId('tok-missing') },
      moveParams: {},
      collector: createCollector(),
    });

    assert.throws(
      () => resolveRef({ ref: 'tokenProp', token: '$tok', prop: 'value' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR') && String(error).includes('not found in any zone'),
    );
  });

  it('preserves first-match semantics for duplicate token ids across zones', () => {
    const tokenA: Token = { id: asTokenId('tok-dup'), type: 'piece', props: { value: 3 } };
    const tokenB: Token = { id: asTokenId('tok-dup'), type: 'piece', props: { value: 8 } };
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: {
        ...makeState([]),
        zones: {
          'zone-a:none': [tokenA],
          'zone-b:none': [tokenB],
        },
      },
      rng: createRng(17n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: asTokenId('tok-dup') },
      moveParams: {},
      collector: createCollector(),
    });

    const prop = resolveRef({ ref: 'tokenProp', token: '$tok', prop: 'value' }, ctx);
    const zone = resolveRef({ ref: 'tokenZone', token: '$tok' }, ctx);
    assert.equal(prop, 3);
    assert.equal(zone, 'zone-a:none');
  });

  it('resolves tokenZone from token-object bindings', () => {
    const token: Token = { id: asTokenId('tok-1'), type: 'piece', props: { value: 5 } };
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([token]),
      rng: createRng(19n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: token },
      moveParams: {},
      collector: createCollector(),
    });

    const zone = resolveRef({ ref: 'tokenZone', token: '$tok' }, ctx);
    assert.equal(zone, 'zone-a:none');
  });

  it('rejects malformed token-object bindings for tokenProp with TYPE_MISMATCH', () => {
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([]),
      rng: createRng(23n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: { id: 42, type: 'piece', props: { value: 1 } } as unknown },
      moveParams: {},
      collector: createCollector(),
    });

    assert.throws(
      () => resolveRef({ ref: 'tokenProp', token: '$tok', prop: 'value' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH') && String(error).includes('must resolve to a Token or token-id string'),
    );
  });

  it('rejects malformed token-object bindings for tokenZone with TYPE_MISMATCH', () => {
    const ctx = makeExecutionEffectContext({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState([]),
      rng: createRng(29n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $tok: { id: asTokenId('tok-1'), props: { value: 1 } } as unknown },
      moveParams: {},
      collector: createCollector(),
    });

    assert.throws(
      () => resolveRef({ ref: 'tokenZone', token: '$tok' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH') && String(error).includes('must resolve to a Token or token-id string'),
    );
  });
});
