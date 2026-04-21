// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent, RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  serializeGameState,
  serializeTrace,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const FITL_PASSING_CANARY_SEEDS = [1005, 1013] as const;
const FITL_MAX_TURNS = 200;
const FITL_PLAYER_COUNT = 4;

const TEXAS_DETERMINISM_SEEDS = Array.from({ length: 10 }, (_, index) => 2000 + index);
const TEXAS_RANDOM_MAX_TURNS = 200;
const TEXAS_RANDOM_PLAYER_COUNT = 6;
const FITL_FALLBACK_INERT_REPRESENTATIVE_SEED = 1005;
const TEXAS_POLICY_REPRESENTATIVE_SEED = 2000;
const TEXAS_POLICY_MAX_TURNS = 12;
const TEXAS_POLICY_PLAYER_COUNT = 4;

const serializeFinalState = (state: Parameters<typeof serializeGameState>[0]): string =>
  JSON.stringify(serializeGameState(state));

const hasMicroturnOnlyDiagnostics = (decision: { readonly kind?: string } | undefined): boolean =>
  decision?.kind === 'policy'
  && !('completionStatistics' in decision)
  && !('movePreparations' in decision);

describe('Spec 140 replay identity', () => {
  const fitlCompiled = compileProductionSpec();
  assertNoErrors(fitlCompiled.parsed);
  assertNoErrors(fitlCompiled.compiled);
  if (fitlCompiled.compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const fitlDef = assertValidatedGameDef(fitlCompiled.compiled.gameDef);
  const fitlRuntime = createGameDefRuntime(fitlDef);

  const texasCompiled = compileTexasProductionSpec();
  assertNoErrors(texasCompiled.parsed);
  assertNoErrors(texasCompiled.compiled);
  if (texasCompiled.compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef');
  }
  const texasDef = assertValidatedGameDef(texasCompiled.compiled.gameDef);
  const texasRuntime = createGameDefRuntime(texasDef);

  const runFitlPolicy = (seed: number) =>
    runGame(
      fitlDef,
      seed,
      FITL_POLICY_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      ),
      FITL_MAX_TURNS,
      FITL_PLAYER_COUNT,
      { skipDeltas: true },
      fitlRuntime,
    );

  const runFitlPolicyRepresentative = (seed: number) =>
    runGame(
      fitlDef,
      seed,
      FITL_POLICY_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }),
      ),
      FITL_MAX_TURNS,
      FITL_PLAYER_COUNT,
      { skipDeltas: true },
      fitlRuntime,
    );

  const runTexasRandom = (seed: number) =>
    runGame(
      texasDef,
      seed,
      Array.from({ length: TEXAS_RANDOM_PLAYER_COUNT }, () => new RandomAgent()),
      TEXAS_RANDOM_MAX_TURNS,
      TEXAS_RANDOM_PLAYER_COUNT,
      { skipDeltas: true },
      texasRuntime,
    );

  const runTexasPolicyRepresentative = (seed: number) =>
    runGame(
      texasDef,
      seed,
      Array.from({ length: TEXAS_POLICY_PLAYER_COUNT }, () => new PolicyAgent({ traceLevel: 'verbose' })),
      TEXAS_POLICY_MAX_TURNS,
      TEXAS_POLICY_PLAYER_COUNT,
      { skipDeltas: true },
      texasRuntime,
    );

  it('keeps the FITL passing canary corpus byte-identical under the current contract', () => {
    for (const seed of FITL_PASSING_CANARY_SEEDS) {
      const left = runFitlPolicy(seed);
      const right = runFitlPolicy(seed);
      assert.equal(left.traceProtocolVersion, 'spec-140');
      assert.deepEqual(left.decisions, right.decisions);
      assert.deepEqual(left.compoundTurns, right.compoundTurns);
      assert.equal(
        serializeFinalState(left.finalState),
        serializeFinalState(right.finalState),
        `FITL seed ${seed}: canonical serialized final state diverged`,
      );
    }
  });

  it('keeps the Texas determinism corpus byte-identical under the current contract', () => {
    for (const seed of TEXAS_DETERMINISM_SEEDS) {
      const left = runTexasRandom(seed);
      const right = runTexasRandom(seed);
      assert.equal(left.traceProtocolVersion, 'spec-140');
      assert.deepEqual(left.decisions, right.decisions);
      assert.deepEqual(left.compoundTurns, right.compoundTurns);
      assert.equal(
        serializeFinalState(left.finalState),
        serializeFinalState(right.finalState),
        `Texas seed ${seed}: canonical serialized final state diverged`,
      );
    }
  });

  it('keeps the representative FITL policy trace deterministic without legacy preparation diagnostics', () => {
    const trace = runFitlPolicyRepresentative(FITL_FALLBACK_INERT_REPRESENTATIVE_SEED);
    const rerun = runFitlPolicyRepresentative(FITL_FALLBACK_INERT_REPRESENTATIVE_SEED);

    assert.deepEqual(serializeTrace(trace), serializeTrace(rerun));
    assert.equal(
      serializeFinalState(trace.finalState),
      serializeFinalState(rerun.finalState),
      `FITL seed ${FITL_FALLBACK_INERT_REPRESENTATIVE_SEED}: representative verbose rerun diverged`,
    );
    assert.equal(trace.decisions.some((entry) => hasMicroturnOnlyDiagnostics(entry.agentDecision)), true);
  });

  it('keeps a representative Texas policy run deterministic without legacy preparation diagnostics', () => {
    const trace = runTexasPolicyRepresentative(TEXAS_POLICY_REPRESENTATIVE_SEED);
    const rerun = runTexasPolicyRepresentative(TEXAS_POLICY_REPRESENTATIVE_SEED);

    assert.equal(trace.decisions.length > 0, true, 'expected Texas representative run to emit moves');
    assert.equal(
      serializeFinalState(trace.finalState),
      serializeFinalState(rerun.finalState),
      'expected Texas representative run to remain byte-identical on rerun',
    );
    assert.equal(trace.decisions.some((entry) => hasMicroturnOnlyDiagnostics(entry.agentDecision)), true);
  });
});
