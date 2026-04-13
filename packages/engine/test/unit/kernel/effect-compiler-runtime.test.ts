import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  buildAdjacencyGraph,
  buildEffectEnvFromCompiledCtx,
  buildRuntimeTableIndex,
  createCollector,
  createDraftTracker,
  createEvalRuntimeResources,
  createExecutionContextFromCompiled,
  createRng,
  emptyScope,
  promoteCompiledEffectContext,
  type CompiledEffectContext,
  type CompiledExecutionContext,
  type EffectEnv,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';


const minimalDef: GameDef = {
  metadata: { id: 'env-test', players: { min: 2, max: 2 }, maxTriggerDepth: 5 },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zoneVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  triggers: [],
  actions: [],
  terminal: { conditions: [] },
};

const makeCompiledCtx = (): CompiledEffectContext => ({
  def: minimalDef,
  adjacencyGraph: buildAdjacencyGraph(minimalDef.zones),
  runtimeTableIndex: buildRuntimeTableIndex(minimalDef),
  resources: createEvalRuntimeResources(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(1),
  moveParams: { foo: 'bar' },
  mode: 'execution',
  decisionAuthority: {
    source: 'engineRuntime',
    player: asPlayerId(0),
    ownershipEnforcement: 'strict',
  },
  decisionScope: emptyScope(),
});

const makeExecutionCtx = (ctx: CompiledEffectContext = makeCompiledCtx()): CompiledExecutionContext =>
  promoteCompiledEffectContext(ctx, createDraftTracker());

const minimalState: GameState = {
  globalVars: {},
  perPlayerVars: { '0': {}, '1': {} },
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: 'main' as never,
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: createRng(1n).state,
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
};

describe('buildEffectEnvFromCompiledCtx', () => {
  it('maps all required EffectEnv fields from promoted compiled execution context', () => {
    const ctx = makeExecutionCtx();
    const collector = createCollector();
    const env: EffectEnv = buildEffectEnvFromCompiledCtx(ctx, collector);

    assert.equal(env.def, ctx.def);
    assert.equal(env.adjacencyGraph, ctx.adjacencyGraph);
    assert.equal(env.resources, ctx.resources);
    assert.equal(env.activePlayer, ctx.activePlayer);
    assert.equal(env.actorPlayer, ctx.actorPlayer);
    assert.deepEqual(env.moveParams, ctx.moveParams);
    assert.equal(env.collector, collector);
    assert.equal(env.decisionAuthority, ctx.decisionAuthority);
    assert.equal(env.mode, 'execution');
  });

  it('includes optional fields from promoted compiled execution context when present', () => {
    const ctx = makeExecutionCtx({
      ...makeCompiledCtx(),
      traceContext: { eventContext: 'lifecycleEffect', effectPathRoot: 'main/onEnter' },
      maxEffectOps: 500,
      verifyCompiledEffects: true,
    });
    const collector = createCollector();
    const env = buildEffectEnvFromCompiledCtx({ ...ctx, mode: 'discovery' }, collector);

    assert.deepEqual(env.traceContext, { eventContext: 'lifecycleEffect', effectPathRoot: 'main/onEnter' });
    assert.equal(env.maxEffectOps, 500);
    assert.equal(env.verifyCompiledEffects, true);
    assert.equal(env.mode, 'discovery');
  });

  it('omits optional fields when the promoted context does not carry them', () => {
    const ctx = makeExecutionCtx();
    const collector = createCollector();
    const env = buildEffectEnvFromCompiledCtx(ctx, collector);

    assert.equal('traceContext' in env, false);
    assert.equal('maxEffectOps' in env, false);
    assert.equal('verifyCompiledEffects' in env, false);
    assert.equal('phaseTransitionBudget' in env, false);
    assert.equal('profiler' in env, false);
    assert.equal('cachedRuntime' in env, false);
    // runtimeTableIndex IS present because makeCompiledCtx provides it
    assert.ok('runtimeTableIndex' in env);
  });

  it('is a pure function — does not mutate the input context', () => {
    const ctx = makeExecutionCtx();
    const ctxSnapshot = { ...ctx };
    const collector = createCollector();
    buildEffectEnvFromCompiledCtx(ctx, collector);

    assert.deepEqual(ctx, ctxSnapshot);
  });
});

describe('promoteCompiledEffectContext', () => {
  it('fills required execution invariants once from a loose boundary context', () => {
    const tracker = createDraftTracker();
    const promoted = promoteCompiledEffectContext(
      (({ decisionScope: _ignored, ...rest }) => rest)(makeCompiledCtx()),
      tracker,
    );

    assert.deepEqual(promoted.decisionScope, emptyScope());
    assert.equal(promoted.tracker, tracker);
    assert.equal(promoted.mode, 'execution');
    assert.equal(promoted.decisionAuthority.player, asPlayerId(0));
    assert.equal(promoted.effectBudget.remaining, promoted.effectBudget.max);
  });
});

describe('createExecutionContextFromCompiled', () => {
  it('reuses required execution invariants without re-normalizing them locally', () => {
    const compiledCtx = makeExecutionCtx({
      ...makeCompiledCtx(),
      mode: 'discovery',
    });

    const execCtx = createExecutionContextFromCompiled(
      minimalState,
      createRng(2n),
      { answer: 42 },
      compiledCtx,
    );

    assert.equal(execCtx.mode, 'execution');
    assert.deepEqual(execCtx.decisionScope, compiledCtx.decisionScope);
    assert.equal(execCtx.decisionAuthority.player, compiledCtx.activePlayer);
    assert.deepEqual(execCtx.bindings, { answer: 42 });
  });
});
