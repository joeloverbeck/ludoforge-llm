// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { performance } from 'node:perf_hooks';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
  type GameDefRuntime,
  type GameState,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

interface PolicyPerfCase {
  readonly label: string;
  readonly def: ValidatedGameDef;
  readonly state: GameState;
  readonly runtime: GameDefRuntime;
  readonly seed: bigint;
  readonly expectedCandidateCount: number;
  readonly expectedPreviewCount: number;
  readonly maxDecisionMs: number;
}

describe('policy agent performance regression', () => {
  it('keeps fixed-corpus decision metrics within regression budgets and without fallback', () => {
    const corpus = createPerfCorpus();
    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const samples = corpus.map((entry) => {
      const candidateMoves = enumerateLegalMoves(entry.def, entry.state, undefined, entry.runtime).moves;
      const start = performance.now();
      const result = agent.chooseMove({
        def: entry.def,
        state: entry.state,
        playerId: entry.state.activePlayer,
        legalMoves: candidateMoves,
        rng: createRng(entry.seed),
        runtime: entry.runtime,
      });
      const elapsedMs = performance.now() - start;

      assert.equal(
        result.agentDecision?.kind,
        'policy',
        `${entry.label} should emit policy decision metadata for regression measurement`,
      );
      if (result.agentDecision?.kind !== 'policy') {
        assert.fail(`${entry.label} should emit policy trace metadata`);
      }

      assert.equal(result.agentDecision.emergencyFallback, false, `${entry.label} must not rely on emergency fallback`);
      assert.equal(
        result.agentDecision.initialCandidateCount,
        entry.expectedCandidateCount,
        `${entry.label} candidate-count regression`,
      );
      assert.equal(
        result.agentDecision.previewUsage.refIds.length,
        entry.expectedPreviewCount,
        `${entry.label} preview-count regression`,
      );
      assert.ok(
        elapsedMs < entry.maxDecisionMs,
        `${entry.label} took ${elapsedMs.toFixed(1)}ms, expected < ${entry.maxDecisionMs}ms`,
      );

      return { label: entry.label, elapsedMs };
    });

    const ordered = samples.map((sample) => sample.elapsedMs).sort((left, right) => left - right);
    const percentile = (p: number): number => ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * p) - 1)] ?? 0;
    const p50 = percentile(0.5);
    const p95 = percentile(0.95);

    assert.ok(p50 < 1000, `policy fixed corpus p50 ${p50.toFixed(1)}ms exceeded 1000ms`);
    assert.ok(p95 < 30000, `policy fixed corpus p95 ${p95.toFixed(1)}ms exceeded 30000ms`);
  });
});

function createPerfCorpus(): readonly PolicyPerfCase[] {
  const fitlDef = assertValidatedGameDef(compileProductionSpec().compiled.gameDef);
  const fitlRuntime = createGameDefRuntime(fitlDef);
  const fitlState = initialState(fitlDef, 7, 4).state;

  const texasDef = assertValidatedGameDef(compileTexasProductionSpec().compiled.gameDef);
  const texasRuntime = createGameDefRuntime(texasDef);
  const texasSeeded = initialState(texasDef, 23, 4).state;
  const texasState = advanceToDecisionPoint(texasDef, texasSeeded);

  return [
    {
      label: 'fitl:7',
      def: fitlDef,
      state: fitlState,
      runtime: fitlRuntime,
      seed: 7n,
      expectedCandidateCount: 7,
      expectedPreviewCount: 1,
      maxDecisionMs: 30000,
    },
    {
      label: 'texas:23',
      def: texasDef,
      state: texasState,
      runtime: texasRuntime,
      seed: 23n,
      expectedCandidateCount: 12,
      expectedPreviewCount: 0,
      maxDecisionMs: 250,
    },
  ];
}
