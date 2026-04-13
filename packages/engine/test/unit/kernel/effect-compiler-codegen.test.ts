import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  compilePatternDescriptor,
  computeFullHash,
  createCollector,
  createDiscoveryStrictEffectContext,
  createDraftTracker,
  createExecutionEffectContext,
  createEvalRuntimeResources,
  createMutableState,
  createRng,
  createZobristTable,
  emptyScope,
  freezeState,
  promoteCompiledEffectContext,
  type CompiledEffectContext,
  type CompiledExecutionContext,
  type CompiledEffectFragment,
  type DraftTracker,
  type EffectAST,
  type GameDef,
  type GameState,
  type MutableGameState,
  type MoveParamScalar,
  type MoveParamValue,
  type NormalizedEffectResult,
  type PartialEffectResult,
  type Rng,
  type TriggerEvent,
} from '../../../src/kernel/index.js';
import { classifyEffect } from '../../../src/kernel/effect-compiler-patterns.js';
import type { ChooseNTemplate } from '../../../src/kernel/choose-n-session.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effect-compiler-codegen-test', players: { min: 2, max: 3 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'round', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'flag', type: 'boolean', init: false },
    { name: 'count', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'bank', type: 'int', init: 0, min: 0, max: 20 },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'coins', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'ready', type: 'boolean', init: false },
  ],
  zoneVars: [],
  zones: [
    { id: asZoneId('city:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('province:none') }] },
    { id: asZoneId('province:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('city:none') }] },
    { id: asZoneId('deck:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('discard:none') } },
    { id: asZoneId('hand:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('discard:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [
    { id: 'pawn', props: { face: 'string', faction: 'string' } },
    { id: 'card', props: { face: 'string', rank: 'string' } },
  ],
  markerLattices: [
    {
      id: 'supportOpposition',
      states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
      defaultState: 'neutral',
    },
  ],
  globalMarkerLattices: [
    { id: 'leaderFlipped', states: ['no', 'yes'], defaultState: 'no' },
    { id: 'momentum', states: ['low', 'mid', 'high'], defaultState: 'mid' },
  ],
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
  globalVars: { score: 3, round: 0, flag: false, count: 0, bank: 10 },
  perPlayerVars: {
    '0': { hp: 5, coins: 4, ready: false },
    '1': { hp: 7, coins: 6, ready: false },
    '2': { hp: 9, coins: 8, ready: true },
  },
  zoneVars: {},
  playerCount: 3,
  zones: {
    'city:none': [{ id: asTokenId('tok_pawn_0'), type: 'pawn', props: { face: 'down', faction: 'blue' } }],
    'province:none': [{ id: asTokenId('tok_pawn_1'), type: 'pawn', props: { face: 'down', faction: 'red' } }],
    'deck:none': [
      { id: asTokenId('tok_card_2'), type: 'card', props: { face: 'down', rank: 'A' } },
      { id: asTokenId('tok_card_3'), type: 'card', props: { face: 'down', rank: 'K' } },
      { id: asTokenId('tok_card_4'), type: 'card', props: { face: 'down', rank: 'Q' } },
    ],
    'hand:none': [],
    'discard:none': [{ id: asTokenId('tok_card_5'), type: 'card', props: { face: 'down', rank: 'J' } }],
  },
  nextTokenOrdinal: 6,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: createRng(17n).state,
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {
    'city:none': { supportOpposition: 'neutral' },
    'province:none': { supportOpposition: 'passiveOpposition' },
  },
  globalMarkers: {
    leaderFlipped: 'no',
    momentum: 'mid',
  },
  reveals: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const tokenById = (state: GameState, tokenId: string) =>
  Object.values(state.zones).flat().find((token) => String(token.id) === tokenId);

const compileEffects = (effects: readonly EffectAST[]): CompiledEffectFragment => {
  const compiledFragments = effects.map((effect) => {
    const descriptor = classifyEffect(effect);
    assert.ok(descriptor !== null, 'test helper expects fully compilable effects');
    return compilePatternDescriptor(descriptor, compileEffects);
  });

  return {
    nodeCount: compiledFragments.reduce((sum, fragment) => sum + fragment.nodeCount, 0),
    execute: (state, rng, bindings, ctx) => {
      let currentState = state;
      let currentRng = rng;
      let currentBindings = bindings;
      let currentDecisionScope = ctx.decisionScope;
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

const makeCompiledContext = (
  def: GameDef,
  options?: {
    readonly trace?: boolean;
    readonly moveParams?: Readonly<Record<string, MoveParamValue>>;
    readonly mode?: 'execution' | 'discovery';
    readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
    readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  },
): CompiledEffectContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  runtimeTableIndex: buildRuntimeTableIndex(def),
  resources: createEvalRuntimeResources(options?.trace === true ? { collector: createCollector({ trace: true }) } : undefined),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  moveParams: options?.moveParams ?? {},
  mode: options?.mode ?? 'execution',
  decisionAuthority: {
    source: 'engineRuntime',
    player: asPlayerId(1),
    ownershipEnforcement: 'strict',
  },
  decisionScope: emptyScope(),
  ...(options?.transientDecisionSelections === undefined
    ? {}
    : { transientDecisionSelections: options.transientDecisionSelections }),
  ...(options?.chooseNTemplateCallback === undefined
    ? {}
    : { chooseNTemplateCallback: options.chooseNTemplateCallback }),
});

const compareResults = (
  def: GameDef,
  compiled: PartialEffectResult,
  interpreted: NormalizedEffectResult,
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
  options?: {
    readonly trace?: boolean;
    readonly moveParams?: Readonly<Record<string, MoveParamValue>>;
    readonly mode?: 'execution' | 'discovery';
    readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
    readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  },
): PartialEffectResult => {
  const descriptor = classifyEffect(effect);
  assert.ok(descriptor !== null);

  const fragment = compilePatternDescriptor(descriptor, compileEffects);
  const mutableState = createMutableState(state);
  const result = fragment.execute(
    mutableState as GameState,
    rng,
    bindings,
    promoteCompiledEffectContext(makeCompiledContext(def, options), createDraftTracker()),
  );

  return {
    ...result,
    state: result.state === (mutableState as unknown as GameState)
      ? freezeState(mutableState)
      : result.state,
  };
};

const runInterpreted = (
  def: GameDef,
  state: GameState,
  effect: EffectAST,
  bindings: Readonly<Record<string, unknown>> = {},
  rng: Rng = createRng(17n),
  options?: {
    readonly trace?: boolean;
    readonly moveParams?: Readonly<Record<string, MoveParamValue>>;
    readonly mode?: 'execution' | 'discovery';
    readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
    readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  },
): NormalizedEffectResult => {
  const shared = {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    state,
    rng,
    activePlayer: asPlayerId(1),
    actorPlayer: asPlayerId(0),
    bindings,
    moveParams: options?.moveParams ?? {},
    resources: createEvalRuntimeResources(options?.trace === true ? { collector: createCollector({ trace: true }) } : undefined),
    ...(options?.transientDecisionSelections === undefined
      ? {}
      : { transientDecisionSelections: options.transientDecisionSelections }),
    ...(options?.chooseNTemplateCallback === undefined
      ? {}
      : { chooseNTemplateCallback: options.chooseNTemplateCallback }),
  } as const;

  return applyEffect(
    effect,
    options?.mode === 'discovery'
      ? createDiscoveryStrictEffectContext(shared)
      : createExecutionEffectContext(shared),
  );
};

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

  it('compileSetVar delegate mode matches interpreter for complex value expressions', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      setVar: {
        scope: 'global',
        var: 'score',
        value: { _t: 6, op: '+', left: { _t: 2, ref: 'gvar', var: 'round' }, right: 2 },
      },
    });

    const descriptor = classifyEffect(effect);
    assert.ok(descriptor !== null);
    assert.equal(descriptor.kind, 'setVar');
    assert.equal(descriptor.mode, 'delegate');
    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileAddVar matches interpreter for clamp boundaries', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ addVar: { scope: 'pvar', player: 'active', var: 'hp', delta: { _t: 2, ref: 'binding', name: '$delta' } } });

    compareResults(def, runCompiled(def, state, effect, { $delta: 50 }), runInterpreted(def, state, effect, { $delta: 50 }));
  });

  it('compileAddVar delegate mode matches interpreter for computed deltas', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      addVar: {
        scope: 'global',
        var: 'score',
        delta: { _t: 6, op: '+', left: 1, right: { _t: 2, ref: 'gvar', var: 'round' } },
      },
    });

    const descriptor = classifyEffect(effect);
    assert.ok(descriptor !== null);
    assert.equal(descriptor.kind, 'addVar');
    assert.equal(descriptor.mode, 'delegate');
    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
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

  it('compileForEach matches interpreter for player iteration, limit, and countBind', () => {
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

  it('compileForEach matches interpreter when player query is empty', () => {
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

  it('compileForEach matches interpreter for zone iteration', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      forEach: {
        bind: '$zone',
        over: { query: 'zones' },
        effects: [eff({ bindValue: { bind: '$lastZone', value: { _t: 2, ref: 'binding', name: '$zone' } } })],
        countBind: '$zoneCount',
        in: [eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$zoneCount' } } })],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileForEach matches interpreter for token query iteration', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      forEach: {
        bind: '$token',
        over: { query: 'tokensInZone', zone: 'deck:none' },
        limit: 2,
        effects: [
          eff({
            setTokenProp: {
              token: '$token',
              prop: 'face',
              value: 'up',
            },
          }),
        ],
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

  it('compileSetActivePlayer matches interpreter for active player updates', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ setActivePlayer: { player: { id: asPlayerId(2) } } });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileAdvancePhase matches interpreter lifecycle semantics', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ advancePhase: {} });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compilePopInterruptPhase matches interpreter resume semantics', () => {
    const def = makeDef();
    const state: GameState = {
      ...makeState(),
      currentPhase: asPhaseId('cleanup'),
      interruptPhaseStack: [{ phase: asPhaseId('cleanup'), resumePhase: asPhaseId('main') }],
    };
    const effect: EffectAST = eff({ popInterruptPhase: {} });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compilePopInterruptPhase throws the same runtime error as interpreter on an empty stack', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({ popInterruptPhase: {} });

    assert.throws(
      () => runCompiled(def, state, effect),
      (error: unknown) => {
        assert.throws(() => runInterpreted(def, state, effect), (interpretedError: unknown) => {
          assert.equal(
            interpretedError instanceof Error ? interpretedError.name : undefined,
            error instanceof Error ? error.name : undefined,
          );
          return true;
        });
        return true;
      },
    );
  });

  it('compilePushInterruptPhase matches interpreter for nested interrupt stacks', () => {
    const def = makeDef();
    const state: GameState = {
      ...makeState(),
      currentPhase: asPhaseId('cleanup'),
      interruptPhaseStack: [{ phase: asPhaseId('cleanup'), resumePhase: asPhaseId('main') }],
    };
    const effect: EffectAST = eff({ pushInterruptPhase: { phase: 'main', resumePhase: 'cleanup' } });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileRollRandom matches interpreter for deterministic execution and fixed bindings', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      rollRandom: {
        bind: '$die',
        min: 1,
        max: 6,
        in: [
          eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$die' } } }),
        ],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
    compareResults(def, runCompiled(def, state, effect, { $die: 4 }), runInterpreted(def, state, effect, { $die: 4 }));
  });

  it('compileEvaluateSubset matches interpreter for repeated subset scoring and best-subset export', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      evaluateSubset: {
        source: { query: 'players' },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [
          eff({
            bindValue: {
              bind: '$bonus',
              value: {
                _t: 5,
                aggregate: {
                  op: 'sum',
                  query: { query: 'binding', name: '$subset' },
                  bind: '$seat',
                  valueExpr: { _t: 2, ref: 'pvar', player: { chosen: '$seat' }, var: 'coins' },
                },
              },
            },
          }),
        ],
        scoreExpr: { _t: 2, ref: 'binding', name: '$bonus' },
        resultBind: '$bestScore',
        bestSubsetBind: '$bestSubset',
        in: [
          eff({ bindValue: { bind: '$winnerCount', value: { _t: 5, aggregate: { op: 'count', query: { query: 'binding', name: '$bestSubset' } } } } }),
          eff({ setVar: { scope: 'global', var: 'bank', value: { _t: 2, ref: 'binding', name: '$bestScore' } } }),
          eff({ setVar: { scope: 'global', var: 'count', value: { _t: 2, ref: 'binding', name: '$winnerCount' } } }),
        ],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileBindValue matches interpreter for non-simple value expressions', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      bindValue: {
        bind: '$sum',
        value: { _t: 6, op: '+', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 2 },
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileTransferVar matches interpreter for actualBind and min/max clamping', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      transferVar: {
        from: { scope: 'global', var: 'bank' },
        to: { scope: 'pvar', player: 'active', var: 'coins' },
        amount: { _t: 6, op: '+', left: 1, right: 4 },
        min: 2,
        max: 3,
        actualBind: '$actual',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileTransferVar matches interpreter for same-cell no-op behavior', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      transferVar: {
        from: { scope: 'global', var: 'bank' },
        to: { scope: 'global', var: 'bank' },
        amount: 5,
        actualBind: '$actual',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileLet matches interpreter for nested binding export semantics with complex values', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      let: {
        bind: 'tmp',
        value: { _t: 6, op: '+', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 2 },
        in: [
          eff({ bindValue: { bind: '$visible', value: { _t: 2, ref: 'binding', name: 'tmp' } } }),
          eff({ bindValue: { bind: 'hidden', value: 99 } }),
          eff({
            let: {
              bind: '$shadow',
              value: { _t: 6, op: '+', left: 1, right: 1 },
              in: [
                eff({ bindValue: { bind: '$nested', value: { _t: 2, ref: 'binding', name: '$shadow' } } }),
              ],
            },
          }),
        ],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileReduce matches interpreter for accumulation and exported binding filtering', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      reduce: {
        itemBind: '$seat',
        accBind: '$sum',
        over: { query: 'players' },
        initial: 0,
        next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$sum' }, right: 1 },
        resultBind: '$result',
        in: [
          eff({ bindValue: { bind: '$visible', value: { _t: 2, ref: 'binding', name: '$result' } } }),
          eff({ bindValue: { bind: 'hidden', value: 99 } }),
        ],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileReduce matches interpreter for empty collections', () => {
    const def = makeDef();
    const state = { ...makeState(), playerCount: 0, perPlayerVars: {} };
    const effect: EffectAST = eff({
      reduce: {
        itemBind: '$seat',
        accBind: '$sum',
        over: { query: 'players' },
        initial: 7,
        next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$sum' }, right: 1 },
        resultBind: '$result',
        in: [eff({ bindValue: { bind: '$visible', value: { _t: 2, ref: 'binding', name: '$result' } } })],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileRemoveByPriority matches interpreter for multi-group budgets and exported counts', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      removeByPriority: {
        budget: 2,
        groups: [
          {
            bind: '$card',
            over: { query: 'tokensInZone', zone: 'deck:none' },
            to: 'discard:none',
            countBind: '$cardsRemoved',
          },
          {
            bind: '$pawn',
            over: { query: 'tokensInZone', zone: 'city:none' },
            to: 'province:none',
            countBind: '$pawnsRemoved',
          },
        ],
        remainingBind: '$remaining',
        in: [
          eff({ bindValue: { bind: '$cardsSeen', value: { _t: 2, ref: 'binding', name: '$cardsRemoved' } } }),
        ],
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileRemoveByPriority matches interpreter with zero budget', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      removeByPriority: {
        budget: 0,
        groups: [
          {
            bind: '$card',
            over: { query: 'tokensInZone', zone: 'deck:none' },
            to: 'discard:none',
            countBind: '$cardsRemoved',
          },
        ],
        remainingBind: '$remaining',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileForEach and compileReduce emit the same control-flow trace entries as the interpreter', () => {
    const def = makeDef();
    const state = makeState();
    const forEachEffect: EffectAST = eff({
      forEach: {
        bind: '$zone',
        over: { query: 'zones' },
        effects: [],
      },
    });
    const reduceEffect: EffectAST = eff({
      reduce: {
        itemBind: '$seat',
        accBind: '$sum',
        over: { query: 'players' },
        initial: 0,
        next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$sum' }, right: 1 },
        resultBind: '$result',
        in: [],
      },
    });

    compareResults(def, runCompiled(def, state, forEachEffect, {}, createRng(17n), { trace: true }), runInterpreted(def, state, forEachEffect, {}, createRng(17n), { trace: true }));
    compareResults(def, runCompiled(def, state, reduceEffect, {}, createRng(17n), { trace: true }), runInterpreted(def, state, reduceEffect, {}, createRng(17n), { trace: true }));
  });

  it('compileSetMarker matches interpreter for zone marker writes', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      setMarker: {
        space: 'city:none',
        marker: 'supportOpposition',
        state: 'activeSupport',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileShiftMarker matches interpreter for lattice shifts', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      shiftMarker: {
        space: 'province:none',
        marker: 'supportOpposition',
        delta: 2,
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileSetGlobalMarker matches interpreter for global marker writes', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      setGlobalMarker: {
        marker: 'leaderFlipped',
        state: 'yes',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileFlipGlobalMarker matches interpreter for dynamic binding-driven marker flips', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      flipGlobalMarker: {
        marker: { _t: 2, ref: 'binding', name: '$marker' },
        stateA: { _t: 2, ref: 'binding', name: '$stateA' },
        stateB: { _t: 2, ref: 'binding', name: '$stateB' },
      },
    });

    const bindings = { $marker: 'leaderFlipped', $stateA: 'no', $stateB: 'yes' };
    compareResults(def, runCompiled(def, state, effect, bindings), runInterpreted(def, state, effect, bindings));
  });

  it('compileShiftGlobalMarker matches interpreter for global lattice shifts', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      shiftGlobalMarker: {
        marker: 'momentum',
        delta: -1,
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileMoveToken matches interpreter for token relocation with random insertion', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      moveToken: {
        token: '$token',
        from: 'city:none',
        to: 'province:none',
        position: 'random',
      },
    });

    const bindings = { $token: tokenById(state, 'tok_pawn_0') };
    compareResults(def, runCompiled(def, state, effect, bindings), runInterpreted(def, state, effect, bindings));
  });

  it('compileMoveAll matches interpreter for filtered moves', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      moveAll: {
        from: 'deck:none',
        to: 'discard:none',
        filter: {
          op: '==',
          left: { _t: 2, ref: 'tokenProp', token: '$token', prop: 'rank' },
          right: 'A',
        },
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileMoveTokenAdjacent matches interpreter for adjacency-driven token moves', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      moveTokenAdjacent: {
        token: '$token',
        from: 'city:none',
        direction: '$to',
      },
    });

    const bindings = { $token: tokenById(state, 'tok_pawn_0'), $to: asZoneId('province:none') };
    compareResults(def, runCompiled(def, state, effect, bindings), runInterpreted(def, state, effect, bindings));
  });

  it('compileDraw matches interpreter for deck draws with reshuffle support', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      draw: {
        from: 'deck:none',
        to: 'hand:none',
        count: 4,
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileShuffle matches interpreter for RNG-driven zone order changes', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      shuffle: {
        zone: 'deck:none',
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileCreateToken matches interpreter for token creation with props', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      createToken: {
        type: 'card',
        zone: 'hand:none',
        props: { face: 'up', rank: '10' },
      },
    });

    compareResults(def, runCompiled(def, state, effect), runInterpreted(def, state, effect));
  });

  it('compileDestroyToken matches interpreter for token removal', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      destroyToken: {
        token: '$token',
      },
    });

    const bindings = { $token: tokenById(state, 'tok_card_5') };
    compareResults(def, runCompiled(def, state, effect, bindings), runInterpreted(def, state, effect, bindings));
  });

  it('compileSetTokenProp matches interpreter for scalar property updates', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      setTokenProp: {
        token: '$token',
        prop: 'face',
        value: 'up',
      },
    });

    const bindings = { $token: tokenById(state, 'tok_card_2') };
    compareResults(def, runCompiled(def, state, effect, bindings), runInterpreted(def, state, effect, bindings));
  });

  it('compileReveal matches interpreter for filtered zone grants and trace emission', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      reveal: {
        zone: 'hand:none',
        to: { id: asPlayerId(2) },
        filter: { op: 'and', args: [{ prop: 'rank', op: 'eq', value: 'J' }] },
      },
    });

    compareResults(
      def,
      runCompiled(def, state, effect, {}, createRng(17n), { trace: true }),
      runInterpreted(def, state, effect, {}, createRng(17n), { trace: true }),
    );
  });

  it('compileReveal matches interpreter for duplicate-grant no-op behavior', () => {
    const def = makeDef();
    const state: GameState = {
      ...makeState(),
      reveals: {
        'hand:none': [{ observers: [asPlayerId(2)] }],
      },
    };
    const effect: EffectAST = eff({
      reveal: {
        zone: 'hand:none',
        to: { id: asPlayerId(2) },
      },
    });

    compareResults(
      def,
      runCompiled(def, state, effect, {}, createRng(17n), { trace: true }),
      runInterpreted(def, state, effect, {}, createRng(17n), { trace: true }),
    );
  });

  it('compileConceal matches interpreter for filter-key canonicalization and removal', () => {
    const def = makeDef();
    const state: GameState = {
      ...makeState(),
      reveals: {
        'hand:none': [{
          observers: [asPlayerId(1)],
          filter: { op: 'and', args: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 'A' },
          ] },
        }],
      },
    };
    const effect: EffectAST = eff({
      conceal: {
        zone: 'hand:none',
        from: { id: asPlayerId(1) },
        filter: { op: 'and', args: [
          { prop: 'rank', op: 'eq', value: 'A' },
          { prop: 'faction', op: 'eq', value: 'US' },
        ] },
      },
    });

    compareResults(
      def,
      runCompiled(def, state, effect, {}, createRng(17n), { trace: true }),
      runInterpreted(def, state, effect, {}, createRng(17n), { trace: true }),
    );
  });

  it('compileConceal matches interpreter for no-op removals without trace emission', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      conceal: {
        zone: 'hand:none',
        from: 'all',
      },
    });

    compareResults(
      def,
      runCompiled(def, state, effect, {}, createRng(17n), { trace: true }),
      runInterpreted(def, state, effect, {}, createRng(17n), { trace: true }),
    );
  });

  it('compilePatternDescriptor dispatches all delegate-backed compiled descriptors', () => {
    const effects: readonly EffectAST[] = [
      eff({ setVar: { scope: 'global', var: 'score', value: { _t: 6, op: '+', left: 1, right: 2 } } }),
      eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 6, op: '+', left: 1, right: 2 } } }),
      eff({ gotoPhaseExact: { phase: 'cleanup' } }),
      eff({ setActivePlayer: { player: 'active' } }),
      eff({ advancePhase: {} }),
      eff({ pushInterruptPhase: { phase: 'cleanup', resumePhase: 'main' } }),
      eff({ popInterruptPhase: {} }),
      eff({ transferVar: { from: { scope: 'global', var: 'bank' }, to: { scope: 'global', var: 'count' }, amount: 1 } }),
      eff({ setMarker: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' } }),
      eff({ shiftMarker: { space: 'city:none', marker: 'supportOpposition', delta: 1 } }),
      eff({ setGlobalMarker: { marker: 'leaderFlipped', state: 'yes' } }),
      eff({ flipGlobalMarker: { marker: 'leaderFlipped', stateA: 'no', stateB: 'yes' } }),
      eff({ shiftGlobalMarker: { marker: 'momentum', delta: 1 } }),
      eff({ moveToken: { token: '$token', from: 'city:none', to: 'province:none' } }),
      eff({ moveAll: { from: 'deck:none', to: 'discard:none' } }),
      eff({ moveTokenAdjacent: { token: '$token', from: 'city:none', direction: 'province:none' } }),
      eff({ draw: { from: 'deck:none', to: 'hand:none', count: 1 } }),
      eff({ shuffle: { zone: 'deck:none' } }),
      eff({ createToken: { type: 'card', zone: 'hand:none' } }),
      eff({ destroyToken: { token: '$token' } }),
      eff({ setTokenProp: { token: '$token', prop: 'face', value: 'up' } }),
      eff({ reveal: { zone: 'hand:none', to: 'all' } }),
      eff({ conceal: { zone: 'hand:none' } }),
      eff({ chooseOne: { internalDecisionId: 'd1', bind: '$choice', options: { query: 'players' } } }),
      eff({ chooseN: { internalDecisionId: 'decision:$choices', bind: '$choices', n: 1, options: { query: 'players' } } }),
    ] as const;

    const expectedKinds = new Set([
      'setVar',
      'addVar',
      'gotoPhaseExact',
      'setActivePlayer',
      'advancePhase',
      'pushInterruptPhase',
      'popInterruptPhase',
      'transferVar',
      'setMarker',
      'shiftMarker',
      'setGlobalMarker',
      'flipGlobalMarker',
      'shiftGlobalMarker',
      'moveToken',
      'moveAll',
      'moveTokenAdjacent',
      'draw',
      'shuffle',
      'createToken',
      'destroyToken',
      'setTokenProp',
      'reveal',
      'conceal',
      'chooseOne',
      'chooseN',
    ]);

    for (const effect of effects) {
      const descriptor = classifyEffect(effect);
      assert.ok(descriptor !== null);
      assert.ok(expectedKinds.has(descriptor.kind));
      if ('setVar' in effect || 'addVar' in effect) {
        assert.equal('mode' in descriptor ? descriptor.mode : undefined, 'delegate');
      }
      assert.ok(compilePatternDescriptor(descriptor, compileEffects));
    }
  });

  // --- Draft-aware codegen tests (79COMEFFPATRED-005) ---

const makeDraftCompiledContext = (
    def: GameDef,
    tracker: DraftTracker,
): CompiledExecutionContext => promoteCompiledEffectContext(makeCompiledContext(def), tracker);

const runCompiledWithTracker = (
    def: GameDef,
    mutableState: MutableGameState,
    effect: EffectAST,
    tracker: DraftTracker,
    bindings: Readonly<Record<string, unknown>> = {},
    rng: Rng = createRng(17n),
): PartialEffectResult => {
    const descriptor = classifyEffect(effect);
    assert.ok(descriptor !== null);
    const fragment = compilePatternDescriptor(descriptor, compileEffects);
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
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileAddVar with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({ addVar: { scope: 'global', var: 'score', delta: 2 } });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileTransferVar with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({
      transferVar: {
        from: { scope: 'global', var: 'bank' },
        to: { scope: 'pvar', player: 'active', var: 'coins' },
        amount: 2,
        actualBind: '$actual',
      },
    });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileMoveToken with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      moveToken: {
        token: '$token',
        from: 'city:none',
        to: 'province:none',
      },
    });
    const bindings = { $token: tokenById(state, 'tok_pawn_0') };

    const mutableState = createMutableState(state);
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker, bindings);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect, bindings);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileCreateToken with tracker preserves mutable-state execution parity', () => {
    const def = makeDef();
    const effect: EffectAST = eff({
      createToken: {
        type: 'card',
        zone: 'hand:none',
        props: { face: 'up', rank: '9' },
      },
    });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileSetMarker with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({
      setMarker: {
        space: 'city:none',
        marker: 'supportOpposition',
        state: 'activeSupport',
      },
    });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileShiftMarker with tracker produces bit-identical result to interpreter', () => {
    const def = makeDef();
    const effect: EffectAST = eff({
      shiftMarker: {
        space: 'province:none',
        marker: 'supportOpposition',
        delta: 2,
      },
    });

    const mutableState = createMutableState(makeState());
    const tracker = createDraftTracker();
    const compiledResult = runCompiledWithTracker(def, mutableState, effect, tracker);
    const frozenResult: PartialEffectResult = { ...compiledResult, state: freezeState(mutableState) };

    const interpretedResult = runInterpreted(def, makeState(), effect);
    compareResults(def, frozenResult, interpretedResult);
  });

  it('compileChooseOne matches interpreted execution semantics', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'players' },
      },
    });
    const options = { moveParams: { '$choice': asPlayerId(2) } } as const;

    const compiledResult = runCompiled(def, state, effect, {}, createRng(23n), options);
    const interpretedResult = runInterpreted(def, state, effect, {}, createRng(23n), options);

    compareResults(def, compiledResult, interpretedResult);
    assert.deepEqual(compiledResult.bindings, interpretedResult.bindings);
  });

  it('compileChooseOne matches interpreted discovery pending-choice semantics', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      chooseOne: {
        internalDecisionId: 'decision:$choice',
        bind: '$choice',
        options: { query: 'players' },
      },
    });
    const options = { mode: 'discovery' as const };

    const compiledResult = runCompiled(def, state, effect, {}, createRng(23n), options);
    const interpretedResult = runInterpreted(def, state, effect, {}, createRng(23n), options);

    assert.deepEqual(compiledResult.pendingChoice, interpretedResult.pendingChoice);
    assert.deepEqual(compiledResult.bindings, interpretedResult.bindings);
  });

  it('compileChooseN matches interpreted execution semantics for prioritized tiers', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: {
          query: 'prioritized',
          qualifierKey: 'faction',
          tiers: [
            { query: 'tokensInZone', zone: 'city:none' },
            { query: 'tokensInZone', zone: 'province:none' },
          ],
        },
        n: 2,
      },
    });
    const options = {
      moveParams: { '$picks': [asTokenId('tok_pawn_0'), asTokenId('tok_pawn_1')] },
    } as const;

    const compiledResult = runCompiled(def, state, effect, {}, createRng(29n), options);
    const interpretedResult = runInterpreted(def, state, effect, {}, createRng(29n), options);

    compareResults(def, compiledResult, interpretedResult);
    assert.deepEqual(compiledResult.bindings, interpretedResult.bindings);
  });

  it('compileChooseN matches interpreted discovery semantics and emits chooseN templates', () => {
    const def = makeDef();
    const state = makeState();
    const effect: EffectAST = eff({
      chooseN: {
        internalDecisionId: 'decision:$picks',
        bind: '$picks',
        options: {
          query: 'prioritized',
          qualifierKey: 'faction',
          tiers: [
            { query: 'tokensInZone', zone: 'city:none' },
            { query: 'tokensInZone', zone: 'province:none' },
          ],
        },
        min: 0,
        max: 2,
      },
    });
    const compiledTemplates: unknown[] = [];
    const interpretedTemplates: unknown[] = [];
    const options = {
      mode: 'discovery' as const,
      chooseNTemplateCallback: (template: unknown) => {
        compiledTemplates.push(template);
      },
    };
    const interpretedOptions = {
      mode: 'discovery' as const,
      chooseNTemplateCallback: (template: unknown) => {
        interpretedTemplates.push(template);
      },
    };

    const compiledResult = runCompiled(def, state, effect, {}, createRng(31n), options);
    const interpretedResult = runInterpreted(def, state, effect, {}, createRng(31n), interpretedOptions);

    assert.deepEqual(compiledResult.pendingChoice, interpretedResult.pendingChoice);
    assert.deepEqual(compiledResult.bindings, interpretedResult.bindings);
    assert.deepEqual(compiledTemplates, interpretedTemplates);
  });

  it('compiled if execution preserves interpreter parity without nullable body fallback', () => {
    const def = makeDef();
    const state = makeState();

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
