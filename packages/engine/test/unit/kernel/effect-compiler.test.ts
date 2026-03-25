import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  compileAllLifecycleEffects,
  compileEffectSequence,
  composeFragments,
  computeFullHash,
  createEvalRuntimeResources,
  createExecutionEffectContext,
  createFallbackFragment,
  createRng,
  createZobristTable,
  emptyScope,
  makeCompiledLifecycleEffectKey,
  type CompiledEffectContext,
  type CompiledEffectFragment,
  type DraftTracker,
  type EffectAST,
  type EffectResult,
  type GameDef,
  type GameState,
  type TriggerEvent,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effect-compiler-orchestrator-test', players: { min: 2, max: 3 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'count', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'flag', type: 'boolean', init: false },
    { name: 'bank', type: 'int', init: 0, min: 0, max: 20 },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'coins', type: 'int', init: 0, min: 0, max: 20 },
  ],
  zoneVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [
      {
        id: asPhaseId('main'),
        onEnter: [
          eff({ setVar: { scope: 'global', var: 'score', value: 1 } }),
          eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
        ],
        onExit: [],
      },
      {
        id: asPhaseId('cleanup'),
        onExit: [
          eff({
            rollRandom: {
              bind: '$roll',
              min: 1,
              max: 6,
              in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$roll' } } })],
            },
          }),
        ],
      },
      {
        id: asPhaseId('idle'),
      },
    ],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 3, count: 0, flag: false, bank: 6 },
  perPlayerVars: {
    '0': { hp: 5, coins: 4 },
    '1': { hp: 7, coins: 6 },
    '2': { hp: 9, coins: 8 },
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

const makeTokenDef = (): GameDef => ({
  ...makeDef(),
  zones: [
    { id: asZoneId('deck:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { face: 'string' } }],
});

const makeTokenState = (): GameState => ({
  ...makeState(),
  zones: {
    'deck:none': [
      { id: asTokenId('tok_card_0'), type: 'card', props: { face: 'down' } },
      { id: asTokenId('tok_card_1'), type: 'card', props: { face: 'down' } },
    ],
    'hand:none': [],
  },
  nextTokenOrdinal: 2,
});

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
): void => {
  const zobrist = createZobristTable(def);
  assert.deepEqual(compiled.state, interpreted.state);
  assert.deepEqual(compiled.rng, interpreted.rng);
  assert.deepEqual(compiled.emittedEvents ?? [], interpreted.emittedEvents ?? []);
  assert.deepEqual(compiled.bindings ?? {}, interpreted.bindings ?? {});
  assert.deepEqual(compiled.decisionScope ?? emptyScope(), interpreted.decisionScope ?? emptyScope());
  assert.equal(
    computeFullHash(zobrist, compiled.state),
    computeFullHash(zobrist, interpreted.state),
  );
};

describe('effect-compiler orchestrator', () => {
  it('compiles a fully compilable sequence with full coverage and interpreter parity', () => {
    const def = makeDef();
    const effects: readonly EffectAST[] = [
      eff({ setVar: { scope: 'global', var: 'score', value: 1 } }),
      eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
      eff({
        if: {
          when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 3 },
          then: [eff({ setVar: { scope: 'global', var: 'flag', value: true } })],
          else: [eff({ setVar: { scope: 'global', var: 'flag', value: false } })],
        },
      }),
    ];
    const state = makeState();
    const rng = createRng(23n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.equal(compiled.coverageRatio, 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('treats bindValue, transferVar, and let sequences as fully compilable', () => {
    const def = makeDef();
    const effects: readonly EffectAST[] = [
      eff({ bindValue: { bind: '$bonus', value: { _t: 6, op: '+', left: 1, right: 2 } } }),
      eff({
        let: {
          bind: 'tmp',
          value: { _t: 2, ref: 'binding', name: '$bonus' },
          in: [
            eff({ bindValue: { bind: '$visible', value: { _t: 2, ref: 'binding', name: 'tmp' } } }),
          ],
        },
      }),
      eff({
        transferVar: {
          from: { scope: 'global', var: 'bank' },
          to: { scope: 'pvar', player: 'active', var: 'coins' },
          amount: { _t: 2, ref: 'binding', name: '$visible' },
          actualBind: '$actual',
        },
      }),
    ];
    const state = makeState();
    const rng = createRng(31n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.equal(compiled.coverageRatio, 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('mixes compiled fragments with fallback fragments without changing behavior', () => {
    const def = makeDef();
    const effects: readonly EffectAST[] = [
      eff({ setVar: { scope: 'global', var: 'score', value: 1 } }),
      eff({
        chooseOne: {
          internalDecisionId: 'd1',
          bind: '$choice',
          options: { query: 'players' },
        },
      }),
      eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
    ];
    const state = makeState();
    const rng = createRng(29n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.ok(compiled.coverageRatio > 0 && compiled.coverageRatio < 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('falls back for fully unsupported sequences while preserving coverage accounting', () => {
    const def = makeDef();
    const effects: readonly EffectAST[] = [
      eff({
        chooseOne: {
          internalDecisionId: 'd1',
          bind: '$choice',
          options: { query: 'players' },
        },
      }),
    ];
    const state = makeState();
    const rng = createRng(31n);
    const compiled = compileEffectSequence(asPhaseId('cleanup'), 'onExit', effects);

    assert.equal(compiled.coverageRatio, 0);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('treats token-only lifecycle sequences as fully compilable with interpreter parity', () => {
    const def = makeTokenDef();
    const effects: readonly EffectAST[] = [
      eff({ shuffle: { zone: 'deck:none' } }),
      eff({ draw: { from: 'deck:none', to: 'hand:none', count: 1 } }),
      eff({ createToken: { type: 'card', zone: 'hand:none', props: { face: 'up' } } }),
    ];
    const state = makeTokenState();
    const rng = createRng(37n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.equal(compiled.coverageRatio, 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('treats information-effect lifecycle sequences as fully compilable with interpreter parity', () => {
    const def = makeTokenDef();
    const effects: readonly EffectAST[] = [
      eff({ reveal: { zone: 'hand:none', to: 'all' } }),
      eff({ conceal: { zone: 'hand:none', from: 'all' } }),
    ];
    const state = makeTokenState();
    const rng = createRng(41n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.equal(compiled.coverageRatio, 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('treats iteration/reduction lifecycle sequences as fully compilable with interpreter parity', () => {
    const def = makeTokenDef();
    const effects: readonly EffectAST[] = [
      eff({
        forEach: {
          bind: '$zone',
          over: { query: 'enums', values: [] },
          effects: [],
        },
      }),
      eff({
        reduce: {
          itemBind: '$card',
          accBind: '$sum',
          over: { query: 'tokensInZone', zone: 'deck:none' },
          initial: 0,
          next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$sum' }, right: 1 },
          resultBind: '$counted',
          in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$counted' } } })],
        },
      }),
      eff({
        removeByPriority: {
          budget: 1,
          groups: [
            {
              bind: '$card',
              over: { query: 'tokensInZone', zone: 'deck:none' },
              to: 'hand:none',
              countBind: '$removed',
            },
          ],
          remainingBind: '$remaining',
        },
      }),
    ];
    const state = makeTokenState();
    const rng = createRng(59n);
    const compiled = compileEffectSequence(asPhaseId('main'), 'onEnter', effects);

    assert.equal(compiled.coverageRatio, 1);
    compareResults(
      def,
      compiled.execute(state, rng, {}, makeCompiledContext(def)),
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('composeFragments creates a mutable scope — output state is not identity-equal to input', () => {
    const noopFragment: CompiledEffectFragment = {
      nodeCount: 1,
      execute: (state, rng, bindings) => ({ state, rng, bindings }),
    };
    const composed = composeFragments([noopFragment]);
    const inputState = makeState();
    const result = composed(inputState, createRng(43n), {}, makeCompiledContext(makeDef()));

    // Output must be structurally equal but NOT the same object reference
    assert.deepEqual(result.state, inputState);
    assert.notEqual(result.state, inputState);
  });

  it('composeFragments threads tracker through fragment calls as a DraftTracker', () => {
    let capturedTracker: DraftTracker | undefined;
    const spyFragment: CompiledEffectFragment = {
      nodeCount: 1,
      execute: (state, rng, bindings, ctx) => {
        capturedTracker = ctx.tracker;
        return { state, rng, bindings };
      },
    };
    const composed = composeFragments([spyFragment]);
    composed(makeState(), createRng(47n), {}, makeCompiledContext(makeDef()));

    assert.ok(capturedTracker !== undefined, 'tracker must be provided to fragments');
    assert.ok(capturedTracker!.playerVars instanceof Set, 'tracker.playerVars must be a Set');
    assert.ok(capturedTracker!.zoneVars instanceof Set, 'tracker.zoneVars must be a Set');
    assert.ok(capturedTracker!.zones instanceof Set, 'tracker.zones must be a Set');
    assert.ok(capturedTracker!.markers instanceof Set, 'tracker.markers must be a Set');
  });

  it('composeFragments threads bindings, decision scope, and emitted events in order', () => {
    const markerEvent = { type: 'varChanged', scope: 'global', var: 'score', oldValue: 3, newValue: 4 } as TriggerEvent;
    const composed = composeFragments([
      {
        nodeCount: 1,
        execute: (state, rng, bindings) => ({
          state: { ...state, globalVars: { ...state.globalVars, score: Number(state.globalVars.score) + 1 } },
          rng,
          emittedEvents: [markerEvent],
          bindings: { ...bindings, $a: 'alpha' },
        }),
      },
      {
        nodeCount: 1,
        execute: (state, rng, bindings, ctx) => ({
          state: { ...state, globalVars: { ...state.globalVars, count: state.globalVars.score } },
          rng,
          emittedEvents: [{ ...markerEvent, newValue: state.globalVars.score } as TriggerEvent],
          bindings: { ...bindings, $b: 'beta' },
          decisionScope: ctx.decisionScope,
        }),
      },
    ] as readonly CompiledEffectFragment[]);

    const def = makeDef();
    const state = makeState();
    const result = composed(state, createRng(37n), {}, makeCompiledContext(def));

    assert.equal(result.state.globalVars.score, 4);
    assert.equal(result.state.globalVars.count, 4);
    assert.deepEqual(result.bindings, { $a: 'alpha', $b: 'beta' });
    assert.equal(result.emittedEvents?.length, 2);
    assert.deepEqual(result.decisionScope, emptyScope());
  });

  it('composeFragments short-circuits on pendingChoice and skips later fragments', () => {
    let executedTail = false;
    const composed = composeFragments([
      {
        nodeCount: 1,
        execute: (state, rng, bindings) => ({
          state,
          rng,
          bindings: { ...bindings, $first: true },
          pendingChoice: {
            kind: 'pending',
            type: 'chooseOne',
            decisionKey: '$choice',
            options: [{ value: 'a', legality: 'unknown', illegalReason: null }],
          },
        }),
      },
      {
        nodeCount: 1,
        execute: (state, rng, bindings) => {
          executedTail = true;
          return { state, rng, bindings };
        },
      },
    ] as readonly CompiledEffectFragment[]);

    const result = composed(makeState(), createRng(41n), {}, makeCompiledContext(makeDef()));

    assert.equal(executedTail, false);
    assert.equal(result.pendingChoice?.kind, 'pending');
    assert.deepEqual(result.bindings, { $first: true });
  });

  it('createFallbackFragment uses lightweight env+cursor bridging with interpreter parity', () => {
    const def = makeDef();
    const effects: readonly EffectAST[] = [
      eff({
        rollRandom: {
          bind: '$roll',
          min: 1,
          max: 6,
          in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$roll' } } })],
        },
      }),
    ];
    const state = makeState();
    const rng = createRng(53n);
    const ctx = makeCompiledContext(def);
    const fragment = createFallbackFragment(effects);
    const result = fragment.execute(state, rng, {}, ctx);

    compareResults(
      def,
      result,
      applyEffects(
        effects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: asPlayerId(1),
          actorPlayer: asPlayerId(0),
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
        }),
      ),
    );
  });

  it('compileAllLifecycleEffects compiles non-empty lifecycle entries and skips empty ones', () => {
    const def = makeDef();
    const compiled = compileAllLifecycleEffects(def);

    assert.equal(compiled.size, 2);
    assert.ok(compiled.has(makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onEnter')));
    assert.ok(compiled.has(makeCompiledLifecycleEffectKey(asPhaseId('cleanup'), 'onExit')));
    assert.equal(compiled.has(makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onExit')), false);
    assert.equal(compiled.has(makeCompiledLifecycleEffectKey(asPhaseId('idle'), 'onEnter')), false);
  });
});
