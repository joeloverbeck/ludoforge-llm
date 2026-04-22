// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_BUDGET = {
  // Recorded from the current deterministic FITL witness corpus after the
  // exact-cardinality chooseN repair, coup-card replay suppression, and
  // chooseNStep dead-end admission fix. Keep modest slack so the witness
  // still catches real frontier inflation without pinning to exact totals.
  totalDecisions: 1750,
  totalCompoundTurns: 600,
  maxMicroturnsPerTurn: 28,
} as const;
const TEXAS_BUDGET = {
  // Texas remains the small control corpus; keep a narrow ceiling, but align
  // it to the live recorded witness instead of the stale pre-Spec-140 count.
  totalDecisions: 80,
  totalCompoundTurns: 80,
  maxMicroturnsPerTurn: 2,
} as const;

describe('Spec 140 compound-turn overhead', () => {
  it('stays within the recorded FITL deterministic probe-step budget', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }

    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const corpus = [
      runGame(def, 123, createSeededChoiceAgents(4), 200, 4, { skipDeltas: true }, runtime),
      runGame(
        def,
        1005,
        ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'].map(
          (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
        ),
        200,
        4,
        { skipDeltas: true },
        runtime,
      ),
      runGame(
        def,
        1010,
        ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'].map(
          (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
        ),
        200,
        4,
        { skipDeltas: true },
        runtime,
      ),
    ];

    const totalDecisions = corpus.reduce((sum, trace) => sum + trace.decisions.length, 0);
    const totalCompoundTurns = corpus.reduce((sum, trace) => sum + trace.compoundTurns.length, 0);
    const maxMicroturnsPerTurn = Math.max(...corpus.flatMap((trace) => trace.compoundTurns.map((summary) => summary.microturnCount)));

    assert.ok(totalDecisions <= FITL_BUDGET.totalDecisions, `FITL totalDecisions=${totalDecisions}`);
    assert.ok(totalCompoundTurns <= FITL_BUDGET.totalCompoundTurns, `FITL totalCompoundTurns=${totalCompoundTurns}`);
    assert.ok(maxMicroturnsPerTurn <= FITL_BUDGET.maxMicroturnsPerTurn, `FITL maxMicroturnsPerTurn=${maxMicroturnsPerTurn}`);
  });

  it('stays within the recorded Texas deterministic probe-step budget', () => {
    const { parsed, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled Texas gameDef');
    }

    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const corpus = [2000, 2001].map((seed) =>
      runGame(
        def,
        seed,
        Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'summary' })),
        20,
        4,
        { skipDeltas: true },
        runtime,
      ));

    const totalDecisions = corpus.reduce((sum, trace) => sum + trace.decisions.length, 0);
    const totalCompoundTurns = corpus.reduce((sum, trace) => sum + trace.compoundTurns.length, 0);
    const maxMicroturnsPerTurn = Math.max(...corpus.flatMap((trace) => trace.compoundTurns.map((summary) => summary.microturnCount)));

    assert.ok(totalDecisions <= TEXAS_BUDGET.totalDecisions, `Texas totalDecisions=${totalDecisions}`);
    assert.ok(totalCompoundTurns <= TEXAS_BUDGET.totalCompoundTurns, `Texas totalCompoundTurns=${totalCompoundTurns}`);
    assert.ok(maxMicroturnsPerTurn <= TEXAS_BUDGET.maxMicroturnsPerTurn, `Texas maxMicroturnsPerTurn=${maxMicroturnsPerTurn}`);
  });
});
