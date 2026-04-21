// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent, RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  publishMicroturn,
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
const ALLOWED_DECISION_KINDS = new Set([
  'actionSelection',
  'chooseOne',
  'chooseNStep',
  'stochasticResolve',
  'outcomeGrantResolve',
  'turnRetirement',
]);

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

const assertTraceConformance = (
  trace: ReturnType<typeof runGame>,
): void => {
  for (const entry of trace.decisions) {
    assert.ok(ALLOWED_DECISION_KINDS.has(entry.decisionContextKind));
    assert.equal(entry.decision.kind, entry.decisionContextKind);
    assert.ok(entry.legalActionCount >= 1);
    if (entry.decision.kind === 'actionSelection') {
      assert.ok(entry.decision.move);
    }
  }

  for (const summary of trace.compoundTurns) {
    assert.ok(summary.microturnCount >= 1);
    assert.ok(summary.decisionIndexRange.start < summary.decisionIndexRange.end);
    const slice = trace.decisions.slice(summary.decisionIndexRange.start, summary.decisionIndexRange.end);
    assert.ok(slice.length > 0);
    assert.ok(slice.every((entry) => entry.turnId === summary.turnId));
    assert.equal(slice.at(-1)?.turnRetired, true);
  }
};

describe('Spec 140 foundations conformance', () => {
  const fitlDef = compileFitlDef();
  const texasDef = compileTexasDef();

  it('publishes only atomic decision kinds on representative initial states', () => {
    const fitlMicroturn = publishMicroturn(fitlDef, initialState(fitlDef, 123, FITL_PLAYER_COUNT).state, createGameDefRuntime(fitlDef));
    const texasMicroturn = publishMicroturn(texasDef, initialState(texasDef, 2000, TEXAS_PLAYER_COUNT).state, createGameDefRuntime(texasDef));

    for (const microturn of [fitlMicroturn, texasMicroturn]) {
      assert.ok(ALLOWED_DECISION_KINDS.has(microturn.kind));
      assert.ok(microturn.legalActions.length > 0);
      assert.ok(microturn.legalActions.every((decision) => decision.kind === microturn.kind));
    }
  });

  for (const profiles of FITL_PROFILE_VARIANTS) {
    for (const seed of FITL_CANARY_SEEDS) {
      it(`FITL profiles=${profiles.join(',')} seed=${seed}: F5/F10/F18/F19 stay on the microturn protocol`, { timeout: 20_000 }, () => {
        const trace = runGame(
          fitlDef,
          seed,
          profiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' })),
          MAX_TURNS,
          FITL_PLAYER_COUNT,
          { skipDeltas: true },
          createGameDefRuntime(fitlDef),
        );

        assert.ok(
          trace.stopReason === 'terminal'
            || trace.stopReason === 'maxTurns'
            || trace.stopReason === 'noLegalMoves',
          `unexpected stopReason=${trace.stopReason}`,
        );
        assertTraceConformance(trace);
      });
    }
  }

  for (const seed of TEXAS_SEEDS) {
    it(`Texas seed=${seed}: F5/F10/F18/F19 stay on the microturn protocol`, () => {
      const trace = runGame(
        texasDef,
        seed,
        Array.from({ length: TEXAS_PLAYER_COUNT }, () => new RandomAgent()),
        MAX_TURNS,
        TEXAS_PLAYER_COUNT,
        { skipDeltas: true },
        createGameDefRuntime(texasDef),
      );

      assert.ok(
        trace.stopReason === 'terminal'
          || trace.stopReason === 'maxTurns'
          || trace.stopReason === 'noLegalMoves',
        `unexpected stopReason=${trace.stopReason}`,
      );
      assertTraceConformance(trace);
    });
  }
});
