import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';
import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  type GameDef,
  type GameState,
  type Token,
  type ZoneDef,
  createCollector,
} from '../../src/kernel/index.js';
import { shuffleTokenArray } from '../../src/kernel/effects-token.js';

const token = (id: string): Token => ({ id: asTokenId(id), type: 'card', props: {} });

const makeDeckZone = (overrides?: Partial<ZoneDef>): ZoneDef => ({
  id: asZoneId('deck:none'),
  owner: 'none',
  visibility: 'hidden',
  ordering: 'stack',
  ...overrides,
});

const makeDef = (zones: readonly ZoneDef[]): GameDef => ({
  metadata: { id: 'deck-behavior-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [...zones],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (zones: Record<string, readonly Token[]>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones,
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

describe('deck behavior — shuffleTokenArray utility', () => {
  it('returns the same array for 0 or 1 tokens', () => {
    const rng = createRng(42n);
    const empty = shuffleTokenArray([], rng);
    assert.deepEqual(empty.tokens, []);
    assert.deepEqual(empty.rng, rng);

    const single = [token('a')];
    const singleResult = shuffleTokenArray(single, rng);
    assert.deepEqual(singleResult.tokens, single);
    assert.deepEqual(singleResult.rng, rng);
  });

  it('produces deterministic results with the same seed', () => {
    const tokens = [token('a'), token('b'), token('c'), token('d'), token('e')];
    const r1 = shuffleTokenArray(tokens, createRng(99n));
    const r2 = shuffleTokenArray(tokens, createRng(99n));
    assert.deepEqual(
      r1.tokens.map(t => t.id),
      r2.tokens.map(t => t.id),
    );
  });

  it('preserves all tokens (no loss, no duplicates)', () => {
    const tokens = [token('a'), token('b'), token('c'), token('d')];
    const result = shuffleTokenArray(tokens, createRng(7n));
    const ids = result.tokens.map(t => t.id).sort();
    assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  });
});

describe('deck behavior — applyDraw drawFrom: top', () => {
  it('takes tokens from front of array (index 0)', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'top' },
    });
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, handZone]);
    const state = makeState({
      'deck:none': [token('d1'), token('d2'), token('d3')],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(1n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 2 } },
      ctx,
    );
    assert.deepEqual(
      result.state.zones['hand:0']?.map(t => t.id),
      ['d1', 'd2'],
    );
    assert.deepEqual(
      result.state.zones['deck:none']?.map(t => t.id),
      ['d3'],
    );
  });
});

describe('deck behavior — applyDraw drawFrom: bottom', () => {
  it('takes tokens from end of array', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'bottom' },
    });
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, handZone]);
    const state = makeState({
      'deck:none': [token('d1'), token('d2'), token('d3')],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(1n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 2 } },
      ctx,
    );
    assert.deepEqual(
      result.state.zones['hand:0']?.map(t => t.id),
      ['d2', 'd3'],
    );
    assert.deepEqual(
      result.state.zones['deck:none']?.map(t => t.id),
      ['d1'],
    );
  });
});

describe('deck behavior — applyDraw drawFrom: random', () => {
  it('uses RNG for token selection and is deterministic', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'random' },
    });
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, handZone]);
    const tokens = [token('d1'), token('d2'), token('d3'), token('d4'), token('d5')];
    const state = makeState({
      'deck:none': tokens,
      'hand:0': [],
    });

    const makeCtx = () => makeExecutionEffectContext({
      def,
      state,
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const r1 = applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, makeCtx());
    const r2 = applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, makeCtx());

    // Deterministic: same seed gives same draw
    assert.deepEqual(
      r1.state.zones['hand:0']?.map(t => t.id),
      r2.state.zones['hand:0']?.map(t => t.id),
    );

    // All tokens accounted for
    const hand = r1.state.zones['hand:0']!;
    const deck = r1.state.zones['deck:none']!;
    assert.equal(hand.length, 2);
    assert.equal(deck.length, 3);
    const allIds = [...hand.map(t => t.id), ...deck.map(t => t.id)].sort();
    assert.deepEqual(allIds, ['d1', 'd2', 'd3', 'd4', 'd5']);
  });
});

describe('deck behavior — auto-reshuffle', () => {
  it('reshuffles from discard when deck runs out', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('discard:none') },
    });
    const discardZone: ZoneDef = { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' };
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, discardZone, handZone]);

    // Deck has 1 card, discard has 3. Drawing 3 should trigger reshuffle.
    const state = makeState({
      'deck:none': [token('d1')],
      'discard:none': [token('x1'), token('x2'), token('x3')],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(7n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 3 } },
      ctx,
    );

    // Drew 3 cards total
    assert.equal(result.state.zones['hand:0']?.length, 3);
    // Discard is empty after reshuffle
    assert.equal(result.state.zones['discard:none']?.length, 0);
    // Deck has 1 remaining (4 total - 3 drawn)
    assert.equal(result.state.zones['deck:none']?.length, 1);
    // All token ids preserved
    const allIds = [
      ...result.state.zones['hand:0']!.map(t => t.id),
      ...result.state.zones['deck:none']!.map(t => t.id),
    ].sort();
    assert.deepEqual(allIds, ['d1', 'x1', 'x2', 'x3']);
  });

  it('is deterministic: same seed produces same reshuffle order', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('discard:none') },
    });
    const discardZone: ZoneDef = { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' };
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, discardZone, handZone]);
    const state = makeState({
      'deck:none': [],
      'discard:none': [token('x1'), token('x2'), token('x3'), token('x4')],
      'hand:0': [],
    });

    const makeCtx = () => makeExecutionEffectContext({
      def,
      state,
      rng: createRng(55n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const r1 = applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, makeCtx());
    const r2 = applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, makeCtx());
    assert.deepEqual(
      r1.state.zones['hand:0']?.map(t => t.id),
      r2.state.zones['hand:0']?.map(t => t.id),
    );
  });

  it('draws 0 on empty deck when reshuffleFrom is absent', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'top' },
    });
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, handZone]);
    const state = makeState({
      'deck:none': [],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(1n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 3 } },
      ctx,
    );
    assert.equal(result.state.zones['hand:0']?.length, 0);
  });

  it('draws 0 when reshuffleFrom zone is also empty', () => {
    const deckZone = makeDeckZone({
      behavior: { type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('discard:none') },
    });
    const discardZone: ZoneDef = { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' };
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, discardZone, handZone]);
    const state = makeState({
      'deck:none': [],
      'discard:none': [],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(1n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 3 } },
      ctx,
    );
    assert.equal(result.state.zones['hand:0']?.length, 0);
  });
});

describe('deck behavior — zone without behavior', () => {
  it('draws from front of array (unchanged default)', () => {
    const deckZone: ZoneDef = { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' };
    const handZone: ZoneDef = { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' };
    const def = makeDef([deckZone, handZone]);
    const state = makeState({
      'deck:none': [token('d1'), token('d2'), token('d3')],
      'hand:0': [],
    });
    const ctx = makeExecutionEffectContext({
      def,
      state,
      rng: createRng(1n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      { draw: { from: 'deck:none', to: 'hand:0', count: 2 } },
      ctx,
    );
    assert.deepEqual(
      result.state.zones['hand:0']?.map(t => t.id),
      ['d1', 'd2'],
    );
    assert.deepEqual(
      result.state.zones['deck:none']?.map(t => t.id),
      ['d3'],
    );
  });
});
