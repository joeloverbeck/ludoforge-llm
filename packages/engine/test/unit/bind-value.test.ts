import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'bind-value-test', players: { min: 1, max: 1 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 1000 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 0 },
  perPlayerVars: {},
  playerCount: 1,
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

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(3n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('bindValue effect', () => {
  it('binds computed values without mutating state', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      bindValue: {
        bind: '$computed',
        value: { op: '+', left: 4, right: 5 },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.deepEqual(result.emittedEvents, []);
  });

  it('makes bound value available to subsequent effects in sequence', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          bindValue: {
            bind: '$computed',
            value: { op: '+', left: 4, right: 5 },
          },
        },
        { setVar: { scope: 'global', var: 'score', value: { ref: 'binding', name: '$computed' } } },
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 9);
  });

  it('propagates nested bindValue outputs through let while keeping let.bind local', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          let: {
            bind: '$local',
            value: 4,
            in: [
              {
                bindValue: {
                  bind: '$computed',
                  value: { op: '+', left: { ref: 'binding', name: '$local' }, right: 5 },
                },
              },
            ],
          },
        },
        { setVar: { scope: 'global', var: 'score', value: { ref: 'binding', name: '$computed' } } },
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 9);
  });
});
