import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  buildAdjacencyGraph,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

const token = (id: string, rank: number): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { rank },
});

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-golden-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { rank: 'int' } }],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 1 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1', 1), token('d2', 2)],
    'discard:none': [token('x1', 9)],
  },
  nextTokenOrdinal: 3,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(555n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects golden outputs', () => {
  it('known seed + fixed effect list yields expected final state snapshot', () => {
    const ctx = makeCtx({ bindings: { $move: asTokenId('d2') } });
    const effects: readonly EffectAST[] = [
      { addVar: { scope: 'global', var: 'score', delta: 4 } },
      { moveToken: { token: '$move', from: 'deck:none', to: 'discard:none', position: 'top' } },
      { draw: { from: 'deck:none', to: 'discard:none', count: 1 } },
      { createToken: { type: 'card', zone: 'deck:none', props: { rank: 7 } } },
    ];

    const result = applyEffects(effects, ctx);

    const snapshot = {
      globalVars: result.state.globalVars,
      zones: {
        'deck:none': result.state.zones['deck:none'],
        'discard:none': result.state.zones['discard:none'],
      },
      nextTokenOrdinal: result.state.nextTokenOrdinal,
      rng: result.rng,
    };

    assert.deepEqual(snapshot, {
      globalVars: { score: 5 },
      zones: {
        'deck:none': [{ id: asTokenId('tok_card_3'), type: 'card', props: { rank: 7 } }],
        'discard:none': [
          { id: asTokenId('d1'), type: 'card', props: { rank: 1 } },
          { id: asTokenId('d2'), type: 'card', props: { rank: 2 } },
          { id: asTokenId('x1'), type: 'card', props: { rank: 9 } },
        ],
      },
      nextTokenOrdinal: 4,
      rng: ctx.rng,
    });
  });
});
