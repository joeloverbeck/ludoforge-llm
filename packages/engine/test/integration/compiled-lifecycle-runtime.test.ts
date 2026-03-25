import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  createEvalRuntimeResources,
  createExecutionEffectContext,
  createGameDefRuntime,
  createPerfProfiler,
  createRng,
  makeCompiledLifecycleEffectKey,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { dispatchLifecycleEvent } from '../../src/kernel/phase-lifecycle.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

const createLifecycleDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'compiled-lifecycle-runtime', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'count', type: 'int', init: 0, min: 0, max: 20 },
  ],
  perPlayerVars: [],
  zoneVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [
      {
        id: asPhaseId('main'),
        onEnter: [
          { setVar: { scope: 'global', var: 'score', value: 1 } },
          { addVar: { scope: 'global', var: 'score', delta: 2 } },
          { setVar: { scope: 'global', var: 'count', value: 1 } },
        ],
      },
    ],
  },
  actions: [],
  triggers: [
    {
      id: asTriggerId('phaseEnterBonus'),
      event: { type: 'phaseEnter', phase: asPhaseId('main') },
      effects: [{ addVar: { scope: 'global', var: 'count', delta: 1 } }],
    },
  ],
  terminal: { conditions: [] },
});

const createState = (): GameState => ({
  globalVars: { score: 0, count: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: createRng(17n).state,
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('compiled lifecycle runtime integration', () => {
  it('keeps production lifecycle coverage aligned with the current Texas/FITL fixtures', () => {
    const texasRuntime = createGameDefRuntime(compileTexasProductionSpec().compiled.gameDef);
    const fitlRuntime = createGameDefRuntime(compileProductionSpec().compiled.gameDef);

    assert.ok(texasRuntime.compiledLifecycleEffects.size > 0);
    for (const compiled of texasRuntime.compiledLifecycleEffects.values()) {
      assert.equal(compiled.coverageRatio, 1);
    }
    assert.equal(fitlRuntime.compiledLifecycleEffects.size, 0);
  });

  it('uses the compiled lifecycle cache when a matching cached runtime is provided', () => {
    const def = createLifecycleDef();
    const runtime = createGameDefRuntime(def);
    const profiler = createPerfProfiler();

    const result = dispatchLifecycleEvent(
      def,
      createState(),
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      createEvalRuntimeResources(),
      'lifecycle',
      runtime,
      profiler,
    );

    assert.equal(result.globalVars.score, 3);
    assert.equal(result.globalVars.count, 2);
    assert.equal(profiler.dynamic.get('lifecycle:applyEffects:compiled')?.count, 1);
    assert.equal(profiler.dynamic.get('lifecycle:applyEffects'), undefined);
  });

  it('falls back to the interpreter lifecycle path when no cached runtime is supplied', () => {
    const def = createLifecycleDef();
    const profiler = createPerfProfiler();

    const result = dispatchLifecycleEvent(
      def,
      createState(),
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      createEvalRuntimeResources(),
      'lifecycle',
      undefined,
      profiler,
    );

    assert.equal(result.globalVars.score, 3);
    assert.equal(result.globalVars.count, 2);
    assert.equal(profiler.dynamic.get('lifecycle:applyEffects')?.count, 1);
    assert.equal(profiler.dynamic.get('lifecycle:applyEffects:compiled'), undefined);
  });

  it('preserves lifecycle dispatch results between compiled and interpreted execution', () => {
    const def = createLifecycleDef();
    const state = createState();
    const runtime = createGameDefRuntime(def);
    const compiled = dispatchLifecycleEvent(
      def,
      state,
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      createEvalRuntimeResources(),
      'lifecycle',
      runtime,
    );
    const interpreted = dispatchLifecycleEvent(
      def,
      state,
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      createEvalRuntimeResources(),
      'lifecycle',
      runtime,
    );

    assert.deepEqual(compiled, interpreted);
  });

  it('enforces the same maxEffectOps boundary for compiled lifecycle execution as the interpreter', () => {
    const def = createLifecycleDef();
    const state = createState();
    const rng = { state: state.rng };
    const runtime = createGameDefRuntime(def);
    const lifecycleEffects = def.turnStructure.phases[0]?.onEnter ?? [];
    const compiled = runtime.compiledLifecycleEffects.get(
      makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onEnter'),
    );
    assert.ok(compiled !== undefined);

    const compiledCtx = {
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      runtimeTableIndex: buildRuntimeTableIndex(def),
      resources: createEvalRuntimeResources(),
      activePlayer: state.activePlayer,
      actorPlayer: state.activePlayer,
      moveParams: {},
      mode: 'execution' as const,
      decisionAuthority: {
        source: 'engineRuntime' as const,
        player: state.activePlayer,
        ownershipEnforcement: 'strict' as const,
      },
      maxEffectOps: 3,
    } as const;

    assert.doesNotThrow(() => compiled.execute(state, rng, {}, compiledCtx));
    assert.throws(
      () => compiled.execute(state, rng, {}, { ...compiledCtx, maxEffectOps: 2 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'EFFECT_BUDGET_EXCEEDED');
        return true;
      },
    );

    assert.doesNotThrow(() =>
      applyEffects(
        lifecycleEffects,
        createExecutionEffectContext({
          def,
          adjacencyGraph: buildAdjacencyGraph(def.zones),
          runtimeTableIndex: buildRuntimeTableIndex(def),
          state,
          rng,
          activePlayer: state.activePlayer,
          actorPlayer: state.activePlayer,
          bindings: {},
          moveParams: {},
          resources: createEvalRuntimeResources(),
          maxEffectOps: 3,
        }),
      ));
    assert.throws(
      () =>
        applyEffects(
          lifecycleEffects,
          createExecutionEffectContext({
            def,
            adjacencyGraph: buildAdjacencyGraph(def.zones),
            runtimeTableIndex: buildRuntimeTableIndex(def),
            state,
            rng,
            activePlayer: state.activePlayer,
            actorPlayer: state.activePlayer,
            bindings: {},
            moveParams: {},
            resources: createEvalRuntimeResources(),
            maxEffectOps: 2,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'EFFECT_BUDGET_EXCEEDED');
        return true;
      },
    );
  });
});
