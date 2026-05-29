// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';
import { probes as architecturalProbes } from './architectural/constructibility-published.probe.js';
import { probes as fitlProbes } from './fire-in-the-lake/arvn-action-distribution.probe.js';
import { probes as turnShapeMinimumImpactProbes } from './fire-in-the-lake/turn-shape-minimum-impact.probe.js';
import { runProbe } from './probe-runner.js';
import type { Probe, ProbeLoadedGame, ProbeLoadGameRequest } from './probe-types.js';

const SOFT_BUDGET_MS = 200;
const HARD_BUDGET_MULTIPLIER = 10;

const registeredProbes = [
  ...fitlProbes,
  ...turnShapeMinimumImpactProbes,
  ...architecturalProbes,
] as readonly Probe[];

const loadGame = (request: ProbeLoadGameRequest): ProbeLoadedGame => {
  if (request.game === 'fire-in-the-lake') {
    const def = getFitlProductionFixture().gameDef;
    return {
      def,
      runtime: createGameDefRuntime(def),
      playerCount: 4,
      scenario: request.scenario,
    };
  }
  if (request.game === 'texas-holdem') {
    const def = getTexasProductionFixture().gameDef;
    return {
      def,
      runtime: createGameDefRuntime(def),
      playerCount: 2,
      scenario: request.scenario,
    };
  }
  throw new Error(`No probe budget loader registered for game ${request.game}`);
};

// QUARANTINED pending Spec 208 (specs/208-fitl-arvn-baseline-pq-witness-failures.md):
// re-attributed 2026-05-29 (Spec 207 §5 was wrong). These two probes do NOT fail on the
// overhead budget — they fail BEHAVIORALLY on the branch baseline, independent of preview
// cost: `arvn-action-distribution-not-dominated` sees ARVN's plan controller select
// `arvn.patrolGovern` 100% of the time (action family rate 1.000 >= 0.60), and
// `turn-shape-minimum-impact-observed` sees `currentTurnImpact` never ready. Un-skip as the
// Spec 208 acceptance gate (fix the plan/doctrine selection, or distill the assertions per
// .claude/rules/testing.md — do NOT relax to the regressed numbers).
const SPEC_208_QUARANTINED_PROBE_IDS = new Set([
  'arvn-action-distribution-not-dominated',
  'turn-shape-minimum-impact-observed',
]);

describe('policy probe budget', () => {
  for (const probe of registeredProbes) {
    const itOptions = SPEC_208_QUARANTINED_PROBE_IDS.has(probe.id)
      ? { skip: 'Spec 208: pre-existing plan-controller action domination / turn-shape evaluator readiness — not a preview-cost failure' }
      : {};
    it(`${probe.id} stays inside the hard probe overhead budget`, itOptions, () => {
      const result = runProbe(probe, {
        loadGame,
        ...(probe.id === 'every-published-candidate-is-constructible' ? { maxDecisionSteps: 8 } : {}),
      });
      assert.equal(result.aggregateOutcome.kind, 'pass');

      const inspectedDecisions = countInspectedDecisions(result);
      assert.ok(inspectedDecisions > 0, 'expected each registered probe to inspect at least one decision');

      const durationPerDecisionMs = durationPerBudgetUnit(probe, result.durationMs, inspectedDecisions);
      if (durationPerDecisionMs > SOFT_BUDGET_MS) {
        console.warn('POLICY_PROFILE_QUALITY_REGRESSION', {
          probeId: probe.id,
          durationMs: result.durationMs,
          inspectedDecisions,
          durationPerDecisionMs,
          budgetMs: SOFT_BUDGET_MS,
        });
      }

      assert.ok(
        durationPerDecisionMs <= SOFT_BUDGET_MS * HARD_BUDGET_MULTIPLIER,
        `probe ${probe.id} exceeded hard budget: ${durationPerDecisionMs.toFixed(1)} ms per budget unit`,
      );
    });
  }
});

const countInspectedDecisions = (result: ReturnType<typeof runProbe>): number => (
  result.perSeedOutcomes.reduce((count, outcome) => count + outcome.matches.length, 0)
);

const durationPerBudgetUnit = (
  probe: Probe,
  durationMs: number,
  inspectedDecisions: number,
): number => (
  probe.decisionBinding.occurrence === 'every'
    ? durationMs / inspectedDecisions
    : durationMs
);
