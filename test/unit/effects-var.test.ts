import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  EffectRuntimeError,
  applyEffect,
  asPhaseId,
  asPlayerId,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  createCollector,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-var-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'round', type: 'int', init: 1, min: 1, max: 9 },
    { name: 'flag', type: 'boolean', init: false },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'mana', type: 'int', init: 0, min: 0, max: 9 },
    { name: 'ready', type: 'boolean', init: false },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 3, round: 2, flag: false },
  perPlayerVars: {
    '0': { hp: 6, mana: 1, ready: false },
    '1': { hp: 8, mana: 4, ready: false },
  },
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
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
  rng: createRng(17n),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects var handlers', () => {
  it('setVar updates a global variable and preserves unrelated state branches', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'global', var: 'score', value: 9 } };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.globalVars.score, 9);
    assert.equal(result.state.globalVars.round, ctx.state.globalVars.round);
    assert.equal(result.state.perPlayerVars, ctx.state.perPlayerVars);
    assert.equal(result.state.zones, ctx.state.zones);
    assert.notEqual(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('setVar updates only the selected per-player variable cell', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: 11 } };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.perPlayerVars['0']?.hp, 11);
    assert.equal(result.state.perPlayerVars['1']?.hp, 8);
    assert.equal(result.state.perPlayerVars['1'], ctx.state.perPlayerVars['1']);
    assert.equal(result.state.globalVars, ctx.state.globalVars);
  });

  it('setVar supports boolean variables for global and per-player scopes', () => {
    const ctx = makeCtx();

    const globalResult = applyEffect({ setVar: { scope: 'global', var: 'flag', value: true } }, ctx);
    assert.equal(globalResult.state.globalVars.flag, true);

    const pvarResult = applyEffect({ setVar: { scope: 'pvar', player: 'actor', var: 'ready', value: true } }, ctx);
    assert.equal(pvarResult.state.perPlayerVars['0']?.ready, true);
  });

  it('setVar clamps values to min/max bounds', () => {
    const ctx = makeCtx();

    const clampedHigh = applyEffect({ setVar: { scope: 'global', var: 'score', value: 999 } }, ctx);
    assert.equal(clampedHigh.state.globalVars.score, 10);

    const clampedLow = applyEffect({ setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: -4 } }, ctx);
    assert.equal(clampedLow.state.perPlayerVars['0']?.hp, 0);
  });

  it('addVar applies signed deltas for global and per-player vars', () => {
    const ctx = makeCtx();

    const globalResult = applyEffect({ addVar: { scope: 'global', var: 'score', delta: -2 } }, ctx);
    assert.equal(globalResult.state.globalVars.score, 1);

    const pvarResult = applyEffect({ addVar: { scope: 'pvar', player: 'active', var: 'hp', delta: 5 } }, ctx);
    assert.equal(pvarResult.state.perPlayerVars['1']?.hp, 13);
  });

  it('addVar clamps values to min/max bounds', () => {
    const ctx = makeCtx();

    const clampedHigh = applyEffect({ addVar: { scope: 'global', var: 'score', delta: 30 } }, ctx);
    assert.equal(clampedHigh.state.globalVars.score, 10);

    const clampedLow = applyEffect({ addVar: { scope: 'pvar', player: 'actor', var: 'hp', delta: -30 } }, ctx);
    assert.equal(clampedLow.state.perPlayerVars['0']?.hp, 0);
  });

  it('throws EFFECT_RUNTIME for unknown variable names', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'global', var: 'missing', value: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown global variable');
    });
  });

  it('throws EFFECT_RUNTIME when evaluated setVar/addVar numeric inputs are not integers', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'global', var: 'score', value: true } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('setVar.value');
    });

    assert.throws(() => applyEffect({ addVar: { scope: 'global', var: 'score', delta: 'x' as unknown as number } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('addVar.delta');
    });
  });

  it('throws EFFECT_RUNTIME for invalid boolean setVar/addVar usage', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'global', var: 'flag', value: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('setVar.value');
    });

    assert.throws(() => applyEffect({ addVar: { scope: 'global', var: 'flag', delta: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('addVar cannot target non-int variable');
    });
  });

  it('throws EFFECT_RUNTIME when per-player selector resolves to non-scalar cardinality', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'pvar', player: 'all', var: 'hp', value: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('exactly one resolved player');
    });
  });

  it('uses moveParams for chosen selectors and lets bindings override moveParams', () => {
    const ctx = makeCtx({
      moveParams: { $target: asPlayerId(1), value: 3 },
      bindings: { value: 6 },
    });
    const effect: EffectAST = {
      addVar: {
        scope: 'pvar',
        player: { chosen: '$target' },
        var: 'mana',
        delta: { ref: 'binding', name: 'value' },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.perPlayerVars['1']?.mana, 9);
  });

  it('returns original state reference when clamped/updated value is unchanged', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'global', var: 'score', value: 3 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
    assert.deepEqual(result.emittedEvents, []);
  });

  it('emits varChanged event payload on global and per-player setVar changes', () => {
    const ctx = makeCtx();

    const globalResult = applyEffect({ setVar: { scope: 'global', var: 'score', value: 9 } }, ctx);
    assert.deepEqual(globalResult.emittedEvents, [
      { type: 'varChanged', scope: 'global', var: 'score', oldValue: 3, newValue: 9 },
    ]);

    const playerResult = applyEffect({ setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: 11 } }, ctx);
    assert.deepEqual(playerResult.emittedEvents, [
      { type: 'varChanged', scope: 'perPlayer', player: asPlayerId(0), var: 'hp', oldValue: 6, newValue: 11 },
    ]);
  });

  it('emits varChanged event payload on addVar changes and not on no-op clamp writes', () => {
    const ctx = makeCtx();
    const changed = applyEffect({ addVar: { scope: 'global', var: 'score', delta: -2 } }, ctx);
    assert.deepEqual(changed.emittedEvents, [
      { type: 'varChanged', scope: 'global', var: 'score', oldValue: 3, newValue: 1 },
    ]);

    const noOp = applyEffect({ addVar: { scope: 'global', var: 'score', delta: 0 } }, ctx);
    assert.deepEqual(noOp.emittedEvents, []);
  });

  it('throws EffectRuntimeError when pvar scope omits player selector', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { addVar: { scope: 'pvar', var: 'hp', delta: 1 } };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      assert.ok(error instanceof EffectRuntimeError);
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('requires player selector');
    });
  });
});

/**
 * Lattice marker shift mechanism (Spec 25):
 *
 * Support/Opposition markers are stored as integer zone variables indexing
 * into a lattice like ['activeOpposition', 'passiveOpposition', 'neutral',
 * 'passiveSupport', 'activeSupport'] (indices 0–4).
 *
 * "Shift toward Active Support" = addVar delta +1
 * "Shift toward Active Opposition" = addVar delta -1
 *
 * The existing addVar with clamp(currentValue + delta, min, max) handles
 * lattice bounds naturally. No new EffectAST type is needed.
 */
describe('lattice marker shift via addVar', () => {
  const makeLatticeDef = (): GameDef => ({
    metadata: { id: 'lattice-shift-test', players: { min: 1, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'marker', type: 'int', init: 2, min: 0, max: 4 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  });

  const makeLatticeState = (markerValue: number): GameState => ({
    globalVars: { marker: markerValue },
    perPlayerVars: {},
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

  const makeLatticeCtx = (markerValue: number): EffectContext => ({
    def: makeLatticeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state: makeLatticeState(markerValue),
    rng: createRng(17n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  });

  it('shifts +1 from middle state (index 2 → 3)', () => {
    const ctx = makeLatticeCtx(2);
    const effect: EffectAST = { addVar: { scope: 'global', var: 'marker', delta: 1 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.marker, 3);
  });

  it('clamps at max when shifting +1 from top state (index 4 → 4)', () => {
    const ctx = makeLatticeCtx(4);
    const effect: EffectAST = { addVar: { scope: 'global', var: 'marker', delta: 1 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.marker, 4, 'clamped at max');
    assert.equal(result.state, ctx.state, 'no-op returns same state reference');
  });

  it('clamps at min when shifting -1 from bottom state (index 0 → 0)', () => {
    const ctx = makeLatticeCtx(0);
    const effect: EffectAST = { addVar: { scope: 'global', var: 'marker', delta: -1 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.marker, 0, 'clamped at min');
    assert.equal(result.state, ctx.state, 'no-op returns same state reference');
  });

  it('shifts -1 from middle state (index 3 → 2)', () => {
    const ctx = makeLatticeCtx(3);
    const effect: EffectAST = { addVar: { scope: 'global', var: 'marker', delta: -1 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.marker, 2);
  });

  it('clamps double shift +2 correctly (index 3 + 2 → clamped to 4)', () => {
    const ctx = makeLatticeCtx(3);
    const effect: EffectAST = { addVar: { scope: 'global', var: 'marker', delta: 2 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.marker, 4, 'clamped to max on double shift');
  });
});
