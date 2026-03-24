import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  buildAdjacencyGraph,
  buildEffectEnvFromCompiledCtx,
  buildRuntimeTableIndex,
  createCollector,
  createEvalRuntimeResources,
  emptyScope,
  type CompiledEffectContext,
  type DecisionAuthorityStrictContext,
  type EffectEnv,
  type GameDef,
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
  decisionScope: emptyScope(),
});

describe('buildEffectEnvFromCompiledCtx', () => {
  it('maps all required EffectEnv fields from CompiledEffectContext + explicit params', () => {
    const ctx = makeCompiledCtx();
    const collector = createCollector();
    const authority: DecisionAuthorityStrictContext = {
      source: 'engineRuntime',
      player: asPlayerId(0),
      ownershipEnforcement: 'strict',
    };

    const env: EffectEnv = buildEffectEnvFromCompiledCtx(ctx, collector, authority, 'execution');

    assert.equal(env.def, ctx.def);
    assert.equal(env.adjacencyGraph, ctx.adjacencyGraph);
    assert.equal(env.resources, ctx.resources);
    assert.equal(env.activePlayer, ctx.activePlayer);
    assert.equal(env.actorPlayer, ctx.actorPlayer);
    assert.deepEqual(env.moveParams, ctx.moveParams);
    assert.equal(env.collector, collector);
    assert.equal(env.decisionAuthority, authority);
    assert.equal(env.mode, 'execution');
  });

  it('includes optional fields from CompiledEffectContext when present', () => {
    const ctx: CompiledEffectContext = {
      ...makeCompiledCtx(),
      traceContext: { eventContext: 'lifecycleEffect', effectPathRoot: 'main/onEnter' },
      maxEffectOps: 500,
      verifyCompiledEffects: true,
    };
    const collector = createCollector();
    const authority: DecisionAuthorityStrictContext = {
      source: 'engineRuntime',
      player: asPlayerId(0),
      ownershipEnforcement: 'strict',
    };

    const env = buildEffectEnvFromCompiledCtx(ctx, collector, authority, 'discovery');

    assert.deepEqual(env.traceContext, { eventContext: 'lifecycleEffect', effectPathRoot: 'main/onEnter' });
    assert.equal(env.maxEffectOps, 500);
    assert.equal(env.verifyCompiledEffects, true);
    assert.equal(env.mode, 'discovery');
  });

  it('omits optional fields when CompiledEffectContext does not carry them', () => {
    const ctx = makeCompiledCtx();
    const collector = createCollector();
    const authority: DecisionAuthorityStrictContext = {
      source: 'engineRuntime',
      player: asPlayerId(0),
      ownershipEnforcement: 'strict',
    };

    const env = buildEffectEnvFromCompiledCtx(ctx, collector, authority, 'execution');

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
    const ctx = makeCompiledCtx();
    const ctxSnapshot = { ...ctx };
    const collector = createCollector();
    const authority: DecisionAuthorityStrictContext = {
      source: 'engineRuntime',
      player: asPlayerId(0),
      ownershipEnforcement: 'strict',
    };

    buildEffectEnvFromCompiledCtx(ctx, collector, authority, 'execution');

    assert.deepEqual(ctx, ctxSnapshot);
  });
});
