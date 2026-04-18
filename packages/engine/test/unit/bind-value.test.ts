// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
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
import { eff } from '../helpers/effect-tag-helper.js';

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
  zoneVars: {},
  playerCount: 1,
  zones: {},
  nextTokenOrdinal: 0,
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

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
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
    const effect: EffectAST = eff({
      bindValue: {
        bind: '$computed',
        value: { _t: 6 as const, op: '+' as const, left: 4, right: 5 },
      },
    });

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.deepEqual(result.emittedEvents, []);
  });

  it('makes bound value available to subsequent effects in sequence', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        eff({
          bindValue: {
            bind: '$computed',
            value: { _t: 6 as const, op: '+' as const, left: 4, right: 5 },
          },
        }),
        eff({ setVar: { scope: 'global', var: 'score', value: { _t: 2 as const, ref: 'binding', name: '$computed' } } }),
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 9);
  });

  it('reads updated global state from earlier effects in the same sequence', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        eff({ setVar: { scope: 'global', var: 'score', value: 4 } }),
        eff({
          bindValue: {
            bind: '$seen',
            value: { _t: 2 as const, ref: 'gvar', var: 'score' },
          },
        }),
        eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 2 as const, ref: 'binding', name: '$seen' } } }),
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 8);
  });

  it('propagates nested bindValue outputs through let while keeping let.bind local', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        eff({
          let: {
            bind: '$local',
            value: 4,
            in: [
              eff({
                bindValue: {
                  bind: '$computed',
                  value: { _t: 6 as const, op: '+' as const, left: { _t: 2 as const, ref: 'binding', name: '$local' }, right: 5 },
                },
              }),
            ],
          },
        }),
        eff({ setVar: { scope: 'global', var: 'score', value: { _t: 2 as const, ref: 'binding', name: '$computed' } } }),
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 9);
  });

  it('evaluates bindValue against move params without exporting them as bindings', () => {
    const ctx = makeCtx({
      moveParams: { selectedScore: 11 },
    });
    const result = applyEffects(
      [
        eff({
          bindValue: {
            bind: '$computed',
            value: { _t: 2 as const, ref: 'binding', name: 'selectedScore' },
          },
        }),
        eff({ setVar: { scope: 'global', var: 'score', value: { _t: 2 as const, ref: 'binding', name: '$computed' } } }),
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.score, 11);
    assert.equal(Object.hasOwn(result.bindings, 'selectedScore'), false);
  });
});
