// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAdversarialAlternativeAvoided,
  assertOutcomeDeltas,
  assertPlanTraceChain,
  assertPreviewStatuses,
  assertReplayIdentity,
  canonicalStateChanged,
  runToCompetenceDecision,
  type CompetenceRunResult,
  type OutcomeDeltaAssertion,
  type PreviewCandidateExpectation,
} from '../helpers/competence/index.js';
import { PolicyAgent } from '../../src/agents/index.js';
import { createGameDefRuntime, initialState } from '../../src/kernel/index.js';
import { createFitlCompetenceReference } from '../helpers/competence/__reference__/fitl-reference.js';
import { createGenericControlCompetenceReference } from '../helpers/competence/__reference__/generic-control-reference.js';

describe('competence harness reference fixture', () => {
  it('exercises every helper on FITL and proves replay identity', () => {
    const reference = createFitlCompetenceReference();
    const actionRun = reference.actionRun();
    const previewRun = reference.previewRun();

    assert.equal(actionRun.targetMicroturn.kind, 'actionSelection');
    assert.equal(previewRun.targetMicroturn.kind, 'chooseOne');
    assert.ok(canonicalStateChanged(actionRun.preState, actionRun.postState));
    assert.ok(canonicalStateChanged(previewRun.preState, previewRun.postState));

    assertPlanTraceChain({
      def: reference.def,
      result: actionRun,
      expected: reference.planExpectation,
    });
    assertAdversarialAlternativeAvoided({
      def: reference.def,
      result: actionRun,
      trapStableMoveKeys: reference.actionTrapStableMoveKeys,
    });
    assertFamilyAgnosticOutcomeAndPreview({
      label: 'FITL ARVN preview microturn',
      def: reference.def,
      result: previewRun,
      outcomeDeltaAssertions: reference.previewDeltaAssertions,
      previewCandidates: reference.previewCandidates,
    });
    assertPreviewStatuses({
      result: previewRun,
      decisiveRefs: reference.previewRefs,
      candidates: reference.previewCandidates,
    });

    assertReplayIdentity({
      def: reference.def,
      runFixture: reference.actionRun,
    });
    assertReplayIdentity({
      def: reference.def,
      runFixture: reference.previewRun,
      outcomeDeltaAssertions: reference.previewDeltaAssertions,
    });
  });

  it('runs the same family-agnostic helpers against generic-control', () => {
    const reference = createGenericControlCompetenceReference();
    const result = reference.run();

    assert.equal(result.targetMicroturn.kind, 'actionSelection');
    assertFamilyAgnosticOutcomeAndPreview({
      label: 'generic-control action-selection turn',
      def: reference.def,
      result,
      outcomeDeltaAssertions: reference.outcomeDeltaAssertions,
      previewCandidates: reference.previewCandidates,
    });
    assertAdversarialAlternativeAvoided({
      def: reference.def,
      result,
      trapStableMoveKeys: reference.trapStableMoveKeys,
    });
    assertReplayIdentity({
      def: reference.def,
      runFixture: reference.run,
      outcomeDeltaAssertions: reference.outcomeDeltaAssertions,
    });
  });

  it('runs from a caller-provided bootstrap state', () => {
    const reference = createGenericControlCompetenceReference();
    const runtime = createGameDefRuntime(reference.def);
    const bootstrapState = initialState(reference.def, 209, 2, undefined, runtime).state;
    const result = runToCompetenceDecision({
      def: reference.def,
      seed: 209,
      agents: [new PolicyAgent({ traceLevel: 'verbose' }), new PolicyAgent({ traceLevel: 'verbose' })],
      playerCount: 2,
      runtime,
      bootstrapState,
      maxTurns: 3,
      microturnBound: 20,
      advanceUntil: ({ microturn }) =>
        microturn.kind === 'actionSelection' && microturn.legalActions.length > 1,
    });

    assertFamilyAgnosticOutcomeAndPreview({
      label: 'generic-control bootstrapped action-selection turn',
      def: reference.def,
      result,
      outcomeDeltaAssertions: reference.outcomeDeltaAssertions,
      previewCandidates: reference.previewCandidates,
    });
    assertAdversarialAlternativeAvoided({
      def: reference.def,
      result,
      trapStableMoveKeys: reference.trapStableMoveKeys,
    });
  });
});

const assertFamilyAgnosticOutcomeAndPreview = (input: {
  readonly label: string;
  readonly def: Parameters<typeof assertOutcomeDeltas>[0]['def'];
  readonly result: CompetenceRunResult;
  readonly outcomeDeltaAssertions: readonly OutcomeDeltaAssertion[];
  readonly previewCandidates: readonly PreviewCandidateExpectation[];
}): void => {
  assert.ok(
    canonicalStateChanged(input.result.preState, input.result.postState),
    `${input.label} must change canonical state`,
  );
  assertOutcomeDeltas({
    def: input.def,
    before: input.result.preState,
    after: input.result.postState,
    assertions: input.outcomeDeltaAssertions,
  });
  assertPreviewStatuses({
    result: input.result,
    candidates: input.previewCandidates,
  });
};
