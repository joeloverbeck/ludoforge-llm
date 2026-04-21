// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent, RandomAgent } from '../../src/agents/index.js';
import {
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
  type Agent,
  type ClassifiedMove,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_CANARY_SEEDS = [1002, 1005, 1010, 1013] as const;
const FITL_PROFILE_VARIANTS = [
  ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
  ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
] as const;
const TEXAS_SEEDS = process.env.RUN_SLOW_E2E === '1'
  ? Array.from({ length: 20 }, (_unused, index) => 2000 + index)
  : Array.from({ length: 10 }, (_unused, index) => 2000 + index);
const FITL_PLAYER_COUNT = 4;
const TEXAS_PLAYER_COUNT = 6;
const MAX_TURNS = 200;

type ConformanceCounters = {
  totalIncomplete: number;
  pendingWithoutTrustedMove: number;
  explicitStochasticWithTrustedMove: number;
};

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const assertFoundation18Conformance = (
  legalMoves: readonly ClassifiedMove[],
  counters: ConformanceCounters,
): void => {
  for (const classified of legalMoves) {
    if (classified.viability.complete) {
      continue;
    }
    counters.totalIncomplete += 1;
    if (classified.viability.stochasticDecision !== undefined) {
      counters.explicitStochasticWithTrustedMove += classified.trustedMove === undefined ? 0 : 1;
      assert.ok(classified.trustedMove, `explicit stochastic move ${String(classified.move.actionId)} should expose its stochastic frontier`);
      continue;
    }

    counters.pendingWithoutTrustedMove += classified.trustedMove === undefined ? 1 : 0;
    assert.equal(
      classified.trustedMove,
      undefined,
      `pending incomplete move ${String(classified.move.actionId)} must remain unmaterialized`,
    );
  }
};

const wrapAgentWithConformanceAudit = (
  def: ValidatedGameDef,
  inner: Agent,
  counters: ConformanceCounters,
): Agent => ({
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    const enumerated = enumerateLegalMoves(def, input.state, undefined, input.runtime);
    assertFoundation18Conformance(enumerated.moves, counters);
    return inner.chooseDecision(input);
  },
} as Agent);

const createFitlAgents = (
  def: ValidatedGameDef,
  profileIds: readonly string[],
  counters: ConformanceCounters,
): readonly Agent[] =>
  profileIds.map((profileId) =>
    wrapAgentWithConformanceAudit(def, new PolicyAgent({ profileId, traceLevel: 'summary' }), counters));

const createTexasAgents = (
  def: ValidatedGameDef,
  counters: ConformanceCounters,
): readonly Agent[] =>
  Array.from({ length: TEXAS_PLAYER_COUNT }, () =>
    wrapAgentWithConformanceAudit(def, new RandomAgent(), counters));

const runFoundation18Audit = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  playerCount: number,
) => runGame(def, seed, agents, MAX_TURNS, playerCount, { skipDeltas: true }, createGameDefRuntime(def));

describe('Spec 139 Foundation #18 conformance', () => {
  const fitlDef = compileFitlDef();
  const texasDef = compileTexasDef();

  for (const profiles of FITL_PROFILE_VARIANTS) {
    for (const seed of FITL_CANARY_SEEDS) {
      it(`FITL profiles=${profiles.join(',')} seed=${seed}: incomplete moves stay on the published microturn boundary`, { timeout: 20_000 }, () => {
        const counters: ConformanceCounters = {
          totalIncomplete: 0,
          pendingWithoutTrustedMove: 0,
          explicitStochasticWithTrustedMove: 0,
        };
        const trace = runFoundation18Audit(
          fitlDef,
          seed,
          createFitlAgents(fitlDef, profiles, counters),
          FITL_PLAYER_COUNT,
        );

        assert.ok(
          trace.stopReason === 'terminal'
            || trace.stopReason === 'maxTurns'
            || trace.stopReason === 'noLegalMoves',
          `unexpected stopReason=${trace.stopReason}`,
        );
        assert.ok(counters.totalIncomplete > 0, 'expected FITL canary run to exercise incomplete admitted moves');
        assert.equal(counters.totalIncomplete, counters.pendingWithoutTrustedMove + counters.explicitStochasticWithTrustedMove);
      });
    }
  }

  for (const seed of TEXAS_SEEDS) {
    it(`Texas seed=${seed}: incomplete moves stay on the published microturn boundary`, () => {
      const counters: ConformanceCounters = {
        totalIncomplete: 0,
        pendingWithoutTrustedMove: 0,
        explicitStochasticWithTrustedMove: 0,
      };
      const trace = runFoundation18Audit(
        texasDef,
        seed,
        createTexasAgents(texasDef, counters),
        TEXAS_PLAYER_COUNT,
      );

      assert.ok(
        trace.stopReason === 'terminal'
          || trace.stopReason === 'maxTurns'
          || trace.stopReason === 'noLegalMoves',
        `unexpected stopReason=${trace.stopReason}`,
      );
    });
  }
});
