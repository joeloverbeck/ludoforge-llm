import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  compilePatternDescriptor,
  computeFullHash,
  createDraftTracker,
  createExecutionEffectContext,
  createEvalRuntimeResources,
  createMutableState,
  createRng,
  createZobristTable,
  emptyScope,
  freezeState,
  type CompiledEffectContext,
  type CompiledEffectFragment,
  type DraftTracker,
  type EffectAST,
  type EffectResult,
  type GameDef,
  type GameState,
  type MutableGameState,
  type Rng,
  type TriggerEvent,
} from '../../../src/kernel/index.js';
import { classifyEffect } from '../../../src/kernel/effect-compiler-patterns.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effect-compiler-codegen-test', players: { min: 2, max: 3 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'round', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'flag', type: 'boolean', init: false },
    { name: 'count', type: 'int', init: 0, min: 0, max: 10 },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'ready', type: 'boolean', init: false },
  ],
  zoneVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [
      {
        id: asPhaseId('main'),
        onExit: [eff({ addVar: { scope: 'global', var: 'round', delta: 1 } })],
      },
      {
        id: asPhaseId('cleanup'),
        onEnter: [eff({ setVar: { scope: 'global', var: 'flag', value: true } })],
      },
    ],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 3, round: 0, flag: false, count: 0 },
  perPlayerVars: {
    '0': { hp: 5, ready: false },
    '1': { hp: 7, ready: false },
    '2': { hp: 9, ready: true },
  },
  zoneVars: {},
  playerCount: 3,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: createRng(17n).state,
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const compileEffects = (effects: readonly EffectAST[]): CompiledEffectFragment | null => {
  const fragments = effects.map((effect) => {
    const descriptor = classifyEffect(effect);
    return descriptor === null ? null : compilePatternDescriptor(descriptor, compileEffects);
  });

  if (fragments.some((entry) => entry === null)) {
    return null;
  }

  const compiledFragments = fragments as readonly CompiledEffectFragment[];
  return {
    nodeCount: compiledFragments.reduce((sum, fragment) => sum + fragment.nodeCount, 0),
    execute: (state, rng, bindings, ctx) => {
      let currentState = state;
      let currentRng = rng;
      let currentBindings = bindings;
      let currentDecisionScope = ctx.decisionScope ?? emptyScope();
      const emittedEvents: TriggerEvent[] = [];

      for (const fragment of compiledFragments) {
        const result = fragment.execute(currentState, currentRng, currentBindings, {
          ...ctx,
          decisionScope: currentDecisionScope,
        });
        currentState = result.state;
        currentRng = result.rng;
        currentBindings = result.bindings ?? currentBindings;
        currentDecisionScope = result.decisionScope ?? currentDecisionScope;
        for (const event of result.emittedEvents ?? []) {
          emittedEvents.push(event);
        }
        if (result.pendingChoice !== undefined) {
          return {
            state: currentState,
            rng: currentRng,
            emittedEvents,
            bindings: currentBindings,
            decisionScope: currentDecisionScope,
            pendingChoice: result.pendingChoice,
          };
        }
      }

      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings: currentBindings,
        decisionScope: currentDecisionScope,
      };
    },
  };
};

const makeCompiledContext = (def: GameDef): CompiledEffectContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  runtimeTableIndex: buildRuntimeTableIndex(def),
  resources: createEvalRuntimeResources(),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  moveParams: {},
  decisionScope: emptyScope(),
});

const compareResults = (
  def: GameDef,
  compiled: EffectResult,
  interpreted: EffectResult,
) => {
  const table = createZobristTable(def);

  assert.deepEqual(compiled.state, interpreted.state);
  assert.deepEqual(compiled.rng, interpreted.rng);
  assert.deepEqual(compiled.emittedEvents ?? [], interpreted.emittedEvents ?? []);
  if (compiled.bindings !== undefined || interpreted.bindings !== undefined) {
    assert.deepEqual(compiled.bindings ?? {}, interpreted.bindings ?? {});
  }
  if (compiled.decisionScope !== undefined && interpreted.decisionScope !== undefined) {
    assert.deepEqual(compiled.decisionScope, interpreted.decisionScope);
  }
  assert.equal(computeFullHash(table, compiled.state), computeFullHash(table, interpreted.state));
};

const runCompiled = (
  def: GameDef,
  state: GameState,
  effect: EffectAST,
  bindings: Readonly<Record<string, unknown>> = {},
  rng: Rng = createRng(17n),
): EffectResult => {
  const descriptor = classifyEffect(effect);
  assert.ok(descriptor !== null);

  const fragment = compilePatternDescriptor(descriptor, compileEffects);
  assert.ok(fragment !== null);

  return fragment.execute(state, rng, bindings, makeCompiledContext(def));
};

const runInterpreted = (
  def: GameDef,
  state: GameState,
  effect: EffectAST,
  bindings: Readonly<Record<string, unknown>> = {},
  rng: Rng = createRng(17n),
): EffectResult => applyEffect(effect, createExecutionEffectContext({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  runtimeTableIndex: buildRuntimeTableIndex(def),
  state,
  rng,
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  bindings,
  moveParams: {},
  resources: createEvalRuntimeResources(),
}));

describe('effect-compiler-codegen', () => {
  it('compileSetVar matches interpreter for global ref writes and emitted events', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: { _t: 2, ref: 'gvar', var: 'round' } } });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileSetVar matches interpreter for pvar boolean writes from bindings', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ setVar: { scope: 'pvar', player: 'actor', var: 'ready', value: { _t: 2, ref: 'binding', name: '$ready' } } });

    compareResults(def, runCompiled(def, state, effect, { $ready: true }), runInterpreted(def, state, effect, { $ready: true }));
  });

  it('compileAddVar matches interpreter for clamp boundaries', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ addVar: { scope: 'pvar', player: 'active', var: 'hp', delta: { _t: 2, ref: 'binding', name: '$delta' } } });

    compareResults(def, runCompiled(def, state, effect, { $delta: 50 }), runInterpreted(def, state, effect, { $delta: 50 }));
  });

  it('compileIf matches interpreter for logical conditions and branch execution', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      if: {
        when: {
          op: 'and',
          args: [
            { op: '==', left: { _t: 2, ref: 'gvar', var: 'flag' }, right: false },
            { op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', var: 'hp' }, right: 7 },
          ],
        },
        then: [eff({ addVar: { scope: 'global', var: 'score', delta: 2 } })],
        else: [eff({ setVar: { scope: 'global', var: 'score', value: 0 } })],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileForEachPlayers matches interpreter for player iteration, limit, and countBind', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      forEach: {
        bind: '$seat',
        over: { query: 'players' },
        limit: 2,
        effects: [eff({ addVar: { scope: 'pvar', player: { chosen: '$seat' }, var: 'hp', delta: 1 } })],
        countBind: '$counted',
        in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$counted' } } })],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileForEachPlayers matches interpreter when player query is empty', () => {
    const def = makeDef();
    const state = { ...makeState(), playerCount: 0, perPlayerVars: {} };
    const effect: EffectAST = eff({
      forEach: {
        bind: '$seat',
        over: { query: 'players' },
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        countBind: '$counted',
        in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$counted' } } })],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileGotoPhaseExact matches interpreter lifecycle semantics', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'cleanup' } });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compilePatternDescriptor dispatches all supported Phase 1 descriptors', () => {
    const effects: readonly EffectAST[] = [
      eff({ setVar: { scope: 'global', var: 'score', value: 1 } }),
      eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
      eff({ if: { when: { op: '==', left: 1, right: 1 }, then: [] } }),
      eff({ forEach: { bind: '$seat', over: { query: 'players' }, effects: [] } }),
      eff({ gotoPhaseExact: { phase: 'cleanup' } }),
    ];

    for (const effect of effects) {
      const descriptor = classifyEffect(effect);
      assert.ok(descriptor !== null);
      assert.ok(compilePatternDescriptor(descriptor, compileEffects) !== null);
    }
  });

  // --- Draft-aware codegen tests (79COMEFFPATRED-005) ---

  const makeDraftCompiledContext = (
    def: GameDef,
    tracker: DraftTracker,
  ): CompiledEffectContext => ({
    ...makeCompiledContext(def),
    tracker,
  });

  const runCompiledWithTracker = (
    def: GameDef,
    mutableState: MutableGameState,
    effect: EffectAST,
    tracker: DraftTracker,
    bindings: Readonly<Record<string, unknown>> = {},
    rng: Rng = createRng(17n),
  ): EffectResult => {
    const descriptor = classifyEffect(effect);
    assert.ok(descriptor !== null);
    const fragment = compilePatternDescriptor(descriptor, compileEffects);
    assert.ok(fragment !== null);
    return fragment.execute(mutableState as GameState, rng, bindings, makeDraftCompiledContext(def, tracker));
  };

  it('compileSetVar with ctx.tracker returns same state reference (mutable path)', () => {
    const def = makeDef();
    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 7 } });

    const result = runCompiledWithTracker(def, mutableState, effect, tracker);

    // Mutable path: state reference is the same object (mutated in-place)
    assert.equal(result.state, mutableState as unknown as GameState);
    // Value was actually written
    assert.equal((result.state as GameState).globalVars.score, 7);
  });

  it('compileSetVar without ctx.tracker returns new state reference (immutable path)', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 7 } });

    const result = runCompiled(def, state, effect);

    // Immutable path: state reference is a different object
    assert.notEqual(result.state, state);
    assert.equal(result.state.globalVars.score, 7);
    // Original state unchanged
    assert.equal(state.globalVars.score, 3);
  });

  it('compileAddVar with ctx.tracker returns same state reference (mutable path)', () => {
    const def = makeDef();
    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const effect: EffectAST = eff({ addVar: { scope: 'global', var: 'score', delta: 2 } });

    const result = runCompiledWithTracker(def, mutableState, effect, tracker);

    assert.equal(result.state, mutableState as unknown as GameState);
    assert.equal((result.state as GameState).globalVars.score, 5); // 3 + 2
  });

  it('compileAddVar without ctx.tracker returns new state reference (immutable path)', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ addVar: { scope: 'global', var: 'score', delta: 2 } });

    const result = runCompiled(def, state, effect);

    assert.notEqual(result.state, state);
    assert.equal(result.state.globalVars.score, 5);
    assert.equal(state.globalVars.score, 3);
  });

  it('compileSetVar with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 7 } });

    // Run with tracker, freeze, and compare to interpreter
    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: EffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileAddVar with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({ addVar: { scope: 'global', var: 'score', delta: 2 } });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: EffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('executeEffectList fallback produces correct EffectResult via applyEffectsWithBudgetState', () => {
    // Force the fallback path by wrapping a non-compilable effect inside an if.
    // The if is compilable, but its then-branch body compiler returns null when
    // it encounters the non-compilable effect, so executeEffectList falls through
    // to the new buildEffectEnvFromCompiledCtx + applyEffectsWithBudgetState path.
    const def = makeDef();
    const state = makeState();

    // Use an if whose then-branch contains an effect that classifyEffect returns
    // null for — this makes compileBody return null for the then fragment,
    // triggering the fallback in executeEffectList.
    // setActivePlayer is a valid EffectAST but not compilable by the pattern compiler.
    const effect: EffectAST = eff({
      if: {
        when: { op: '==', left: 1, right: 1 },
        then: [eff({ setActivePlayer: { player: 'active' } })],
      },
    });

    const compiledResult = runCompiled(def, state, effect);
    const interpretedResult = runInterpreted(def, state, effect);
    compareResults(def, compiledResult, interpretedResult);
  });
});
