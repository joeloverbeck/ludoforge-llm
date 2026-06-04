import * as assert from 'node:assert/strict';

import type { GameDef, GameState, PolicyPlanTrace } from '../../src/kernel/index.js';
import {
  assertOutcomeDeltas,
  assertPlanTraceChain,
  assertPreviewStatuses,
  assertReplayIdentity,
  canonicalStateChanged,
  type CompetenceRunResult,
  type OutcomeDeltaAssertion,
} from '../helpers/competence/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  decisionStableKey,
  loadFitlProductionDef,
  runFitlCompetenceCase,
  type FitlProfileId,
} from './shared-competence-helpers.js';

interface ExpectedFilteredTemplate {
  readonly templateId: string;
  readonly gatedBy: readonly string[];
  readonly reason: string;
}

interface ExpectedPostureContribution {
  readonly id: string;
  readonly maxContribution?: number;
  readonly minContribution?: number;
}

interface ExpectedAllyFlip {
  readonly contributionId: string;
  readonly seat: string;
  readonly fired: boolean;
}

export interface FitlAllyRivalLiveCase {
  readonly testFile: string;
  readonly profileId: FitlProfileId;
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly prepareState: (def: GameDef, state: GameState) => GameState;
  readonly expectedRootStableMoveKey: string;
  readonly expectedTemplateId?: string;
  readonly activeDoctrines?: readonly string[];
  readonly inactiveDoctrines?: readonly string[];
  readonly filteredTemplates?: readonly ExpectedFilteredTemplate[];
  readonly unfilteredTemplates?: readonly string[];
  readonly outcomeAssertions?: readonly OutcomeDeltaAssertion[];
  readonly postureContributions?: readonly ExpectedPostureContribution[];
  readonly allyFlips?: readonly ExpectedAllyFlip[];
}

export function assertFitlAllyRivalLiveCase(input: FitlAllyRivalLiveCase): void {
  const def = loadFitlProductionDef();
  const run = () => runFitlCompetenceCase(def, input);
  const result = run();

  if (input.outcomeAssertions !== undefined) {
    assertOutcomeDeltas({
      def,
      before: result.preState,
      after: result.postState,
      assertions: input.outcomeAssertions,
    });
  }

  emitPolicyProfileQualityRecord({
    file: input.testFile,
    variantId: input.profileId,
    seed: input.seed,
    passed: canonicalStateChanged(result.preState, result.postState),
    stopReason: result.stopReason,
    decisions: result.decisions.length,
  });

  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected selected live turn to change state');
  assert.equal(result.stopReason, 'turnCompleted');
  assert.equal(decisionStableKey(def, result.selectedDecision), input.expectedRootStableMoveKey);
  assertExecutedFactionTurn(input, result);
  assertPlanTraceChain({
    def,
    result,
    expected: {
      ...(input.expectedTemplateId === undefined ? {} : { eligibleTemplate: input.expectedTemplateId }),
      selectedRootStableMoveKey: input.expectedRootStableMoveKey,
    },
  });
  assertPlanDoctrines(input, result.agentDecision?.plan?.activeDoctrines ?? []);
  assertFilteredTemplates(input, result.agentDecision?.plan?.filteredOutTemplates ?? []);
  assertPostureExpectations(input, result.agentDecision?.plan?.posture);
  assertPreviewStatuses({ result });
  assertReplayIdentity({
    def,
    runFixture: run,
    ...(input.outcomeAssertions === undefined ? {} : { outcomeDeltaAssertions: input.outcomeAssertions }),
  });
}

function assertExecutedFactionTurn(
  input: Pick<FitlAllyRivalLiveCase, 'seatId'>,
  result: CompetenceRunResult,
): void {
  assert.equal(result.preState.turnOrderState?.type, 'cardDriven');
  assert.equal(result.postState.turnOrderState?.type, 'cardDriven');
  const preCard = result.preState.turnOrderState.runtime.currentCard;
  const postCard = result.postState.turnOrderState.runtime.currentCard;
  assert.ok(postCard.actedSeats.includes(input.seatId), `expected ${input.seatId} to have acted`);
  assert.ok(
    postCard.nonPassCount > preCard.nonPassCount,
    `expected ${input.seatId} selected root to count as a non-pass action`,
  );
}

function assertPlanDoctrines(input: FitlAllyRivalLiveCase, activeDoctrines: readonly string[]): void {
  for (const doctrineId of input.activeDoctrines ?? []) {
    assert.ok(
      activeDoctrines.includes(doctrineId),
      `expected active doctrine ${doctrineId}; got ${JSON.stringify(activeDoctrines)}`,
    );
  }
  for (const doctrineId of input.inactiveDoctrines ?? []) {
    assert.equal(
      activeDoctrines.includes(doctrineId),
      false,
      `expected inactive doctrine ${doctrineId}; got ${JSON.stringify(activeDoctrines)}`,
    );
  }
}

function assertFilteredTemplates(
  input: FitlAllyRivalLiveCase,
  actual: readonly { readonly templateId: string; readonly gatedBy: readonly string[]; readonly reason: string }[],
): void {
  for (const expected of input.filteredTemplates ?? []) {
    const match = actual.find((entry) => entry.templateId === expected.templateId);
    assert.ok(match, `expected filtered template ${expected.templateId}; got ${JSON.stringify(actual)}`);
    assert.equal(match.reason, expected.reason);
    for (const doctrineId of expected.gatedBy) {
      assert.ok(
        match.gatedBy.includes(doctrineId),
        `expected ${expected.templateId} gated by ${doctrineId}; got ${JSON.stringify(match.gatedBy)}`,
      );
    }
  }
  for (const templateId of input.unfilteredTemplates ?? []) {
    assert.equal(
      actual.some((entry) => entry.templateId === templateId),
      false,
      `expected template ${templateId} to remain eligible; got ${JSON.stringify(actual)}`,
    );
  }
}

function assertPostureExpectations(
  input: FitlAllyRivalLiveCase,
  posture: PolicyPlanTrace['posture'] | undefined,
): void {
  if ((input.postureContributions ?? []).length === 0 && (input.allyFlips ?? []).length === 0) {
    return;
  }
  assert.ok(posture, 'expected selected plan posture trace');
  for (const expected of input.postureContributions ?? []) {
    const actual: PolicyPlanTrace['posture']['preferContributions'][number] | undefined =
      posture.preferContributions.find((entry) => entry.id === expected.id);
    assert.ok(actual, `expected posture contribution ${expected.id}`);
    assert.equal(actual.status, 'ready');
    if (expected.maxContribution !== undefined) {
      assert.ok(
        actual.contribution <= expected.maxContribution,
        `expected ${expected.id} contribution <= ${expected.maxContribution}, got ${actual.contribution}`,
      );
    }
    if (expected.minContribution !== undefined) {
      assert.ok(
        actual.contribution >= expected.minContribution,
        `expected ${expected.id} contribution >= ${expected.minContribution}, got ${actual.contribution}`,
      );
    }
  }
  for (const expected of input.allyFlips ?? []) {
    const actual: NonNullable<PolicyPlanTrace['posture']['allyWeightContext']>['flips'][number] | undefined =
      posture.allyWeightContext?.flips.find((entry) =>
        entry.contributionId === expected.contributionId && entry.seat === expected.seat);
    assert.ok(actual, `expected ally/rival flip ${expected.contributionId} for ${expected.seat}`);
    assert.equal(actual.fired, expected.fired);
  }
}
