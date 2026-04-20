// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
  assertValidatedGameDef,
  createGameDefRuntime,
  createPerfProfiler,
  type Agent,
  type GameDefRuntime,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const firstLegalAgent = {
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    const decision = input.microturn.legalActions[0];
    if (decision === undefined) {
      throw new Error('firstLegalAgent requires at least one legal action');
    }
    return { decision, rng: input.rng };
  },
} as Agent;

const TEXAS_DEF = assertValidatedGameDef(compileTexasProductionSpec().compiled.gameDef) as ValidatedGameDef;

const createInterpreterOnlyRuntime = (runtime: GameDefRuntime): GameDefRuntime => ({
  ...runtime,
  compiledLifecycleEffects: new Map(),
});

describe('compiled Texas production parity', () => {
  it('matches interpreter-only lifecycle execution for deterministic short simulations', () => {
    const compiledRuntime = createGameDefRuntime(TEXAS_DEF);
    const interpreterRuntime = createInterpreterOnlyRuntime(compiledRuntime);
    const seeds = [41, 123] as const;

    for (const seed of seeds) {
      const compiledProfiler = createPerfProfiler();
      const interpretedProfiler = createPerfProfiler();

      const compiledTrace = runGame(
        TEXAS_DEF,
        seed,
        [firstLegalAgent, firstLegalAgent],
        12,
        2,
        { profiler: compiledProfiler },
        compiledRuntime,
      );
      const interpretedTrace = runGame(
        TEXAS_DEF,
        seed,
        [firstLegalAgent, firstLegalAgent],
        12,
        2,
        { profiler: interpretedProfiler },
        interpreterRuntime,
      );

      assert.equal(
        compiledTrace.finalState.stateHash,
        interpretedTrace.finalState.stateHash,
        `compiled/interpreted Texas parity should hold for seed ${seed}`,
      );
      assert.equal(
        compiledTrace.decisions.length,
        interpretedTrace.decisions.length,
        `compiled/interpreted Texas move counts should match for seed ${seed}`,
      );
      assert.ok(
        (compiledProfiler.dynamic.get('lifecycle:applyEffects:compiled')?.count ?? 0) > 0,
        `compiled runtime should exercise lifecycle:applyEffects:compiled for seed ${seed}`,
      );
      assert.equal(
        compiledProfiler.dynamic.get('lifecycle:applyEffects'),
        undefined,
        `compiled runtime should not fall back to interpreter lifecycle timing for seed ${seed}`,
      );
      assert.ok(
        (interpretedProfiler.dynamic.get('lifecycle:applyEffects')?.count ?? 0) > 0,
        `interpreter runtime should exercise lifecycle:applyEffects for seed ${seed}`,
      );
      assert.equal(
        interpretedProfiler.dynamic.get('lifecycle:applyEffects:compiled'),
        undefined,
        `interpreter runtime should not report compiled lifecycle timing for seed ${seed}`,
      );
    }
  });

  it('keeps a stable golden state hash for the compiled Texas production regression seed', () => {
    const compiledTrace = runGame(
      TEXAS_DEF,
      41,
      [firstLegalAgent, firstLegalAgent],
      12,
      2,
      undefined,
      createGameDefRuntime(TEXAS_DEF),
    );

    assert.equal(compiledTrace.finalState.stateHash, 5325836457645012576n);
  });
});
