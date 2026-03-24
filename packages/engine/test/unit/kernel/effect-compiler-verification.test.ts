import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompiledEffectVerificationError,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  createCollector,
  createEvalRuntimeResources,
  createGameDefRuntime,
  createRng,
  makeCompiledLifecycleEffectKey,
  toMoveExecutionPolicy,
  type CompiledEffectSequence,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../../src/kernel/index.js';
import { dispatchLifecycleEvent } from '../../../src/kernel/phase-lifecycle.js';

const createLifecycleDef = (): GameDef => ({
  metadata: { id: 'effect-compiler-verification', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
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
}) as unknown as GameDef;

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

const createTamperedRuntime = (def: GameDef): GameDefRuntime => {
  const runtime = createGameDefRuntime(def);
  const key = makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onEnter');
  const original = runtime.compiledLifecycleEffects.get(key);
  assert.ok(original !== undefined);
  const tampered: CompiledEffectSequence = {
    ...original,
    execute: (state, rng, bindings, ctx) => {
      const result = original.execute(state, rng, bindings, ctx);
      return {
        ...result,
        state: {
          ...result.state,
          globalVars: {
            ...result.state.globalVars,
            score: 9,
          },
        },
      };
    },
  };
  return {
    ...runtime,
    compiledLifecycleEffects: new Map([[key, tampered]]),
  };
};

describe('effect-compiler verification', () => {
  it('preserves active collector output when verification is enabled', () => {
    const def = createLifecycleDef();
    const runtime = createGameDefRuntime(def);
    const baseState = createState();
    const withoutVerifyResources = createEvalRuntimeResources({
      collector: createCollector({ trace: true }),
    });
    const withVerifyResources = createEvalRuntimeResources({
      collector: createCollector({ trace: true }),
    });

    const withoutVerify = dispatchLifecycleEvent(
      def,
      baseState,
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      withoutVerifyResources,
      'lifecycle',
      runtime,
    );
    const withVerify = dispatchLifecycleEvent(
      def,
      baseState,
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      toMoveExecutionPolicy({ verifyCompiledEffects: true }, undefined),
      withVerifyResources,
      'lifecycle',
      runtime,
    );

    assert.deepEqual(withVerify, withoutVerify);
    assert.deepEqual(withVerifyResources.collector.warnings, withoutVerifyResources.collector.warnings);
    assert.deepEqual(withVerifyResources.collector.trace, withoutVerifyResources.collector.trace);
    assert.ok((withVerifyResources.collector.trace?.length ?? 0) > 0);
  });

  it('throws verification diagnostics when the compiled lifecycle result diverges', () => {
    const def = createLifecycleDef();
    const runtime = createTamperedRuntime(def);

    assert.throws(
      () =>
        dispatchLifecycleEvent(
          def,
          createState(),
          { type: 'phaseEnter', phase: asPhaseId('main') },
          undefined,
          toMoveExecutionPolicy({ verifyCompiledEffects: true }, undefined),
          createEvalRuntimeResources(),
          'lifecycle',
          runtime,
        ),
      (error: unknown) => {
        assert.ok(error instanceof CompiledEffectVerificationError);
        assert.equal(error.phaseId, asPhaseId('main'));
        assert.equal(error.lifecycle, 'onEnter');
        assert.equal(error.mismatchKind, 'stateHash');
        assert.equal(error.coverageRatio, 1);
        return true;
      },
    );
  });

  it('does not run verification when verifyCompiledEffects is disabled', () => {
    const def = createLifecycleDef();
    const runtime = createTamperedRuntime(def);

    const result = dispatchLifecycleEvent(
      def,
      createState(),
      { type: 'phaseEnter', phase: asPhaseId('main') },
      undefined,
      undefined,
      createEvalRuntimeResources(),
      'lifecycle',
      runtime,
    );

    assert.equal(result.globalVars.score, 9);
  });
});
