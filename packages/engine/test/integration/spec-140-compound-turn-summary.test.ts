// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { synthesizeCompoundTurnSummaries } from '../../src/sim/compound-turns.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const assertCompoundTurnSummary = (trace: ReturnType<typeof runGame>): void => {
  const synthesized = synthesizeCompoundTurnSummaries(trace.decisions, trace.stopReason);
  assert.deepEqual(trace.compoundTurns, synthesized);

  for (const summary of trace.compoundTurns) {
    assert.ok(summary.decisionIndexRange.start < summary.decisionIndexRange.end);
    const slice = trace.decisions.slice(summary.decisionIndexRange.start, summary.decisionIndexRange.end);
    assert.ok(slice.length > 0);
    assert.ok(slice.every((entry) => entry.turnId === summary.turnId));
    assert.equal(slice.at(-1)?.turnRetired, true);
    assert.equal(slice.length, summary.microturnCount);
  }
};

describe('Spec 140 compound-turn summary correctness', () => {
  it('reconstructs FITL compound turn summaries from the authoritative decision log', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }
    const def = assertValidatedGameDef(compiled.gameDef);
    const trace = runGame(
      def,
      1005,
      ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'].map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      ),
      200,
      4,
      { skipDeltas: true },
      createGameDefRuntime(def),
    );
    assertCompoundTurnSummary(trace);
  });

  it('reconstructs Texas compound turn summaries from the authoritative decision log', () => {
    const { parsed, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled Texas gameDef');
    }
    const def = assertValidatedGameDef(compiled.gameDef);
    const trace = runGame(
      def,
      2000,
      Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'summary' })),
      20,
      4,
      { skipDeltas: true },
      createGameDefRuntime(def),
    );
    assertCompoundTurnSummary(trace);
  });
});
