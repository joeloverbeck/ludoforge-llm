import * as assert from 'node:assert/strict';

import type {
  PolicyAgentDecisionTrace,
  PolicyCandidateDecisionTrace,
  PolicyCandidateSelectionReasonTrace,
  PolicyPreviewSeatMatrixStatusTrace,
  PolicyPreviewUnknownRefTrace,
  PolicyTurnShapeEvaluatorEntry,
} from '../../../src/kernel/index.js';
import type { CompetenceRunResult } from './live-frontier-runner.js';

export type PreviewRefStatus = 'ready' | PolicyPreviewUnknownRefTrace['reason'];
export type PreviewCandidateStatus = NonNullable<PolicyCandidateDecisionTrace['previewOutcome']>;
export type PreviewTurnShapeStatus = PolicyTurnShapeEvaluatorEntry['previewStatus'];

export interface ExpectedPreviewFallback {
  readonly termId?: string;
  readonly kind?: NonNullable<PolicyCandidateDecisionTrace['previewFallbackFired']>['kind'];
}

export interface PreviewRefExpectation {
  readonly refId: string;
  readonly stableMoveKey?: string;
  readonly status?: PreviewRefStatus;
  readonly fallback?: ExpectedPreviewFallback;
}

export interface PreviewCandidateExpectation {
  readonly stableMoveKey?: string;
  readonly previewOutcome?: PreviewCandidateStatus;
  readonly selectionReason?: PolicyCandidateSelectionReasonTrace;
}

export interface PreviewSeatMatrixExpectation {
  readonly stableMoveKey?: string;
  readonly refId: string;
  readonly seat: string;
  readonly status?: PolicyPreviewSeatMatrixStatusTrace;
}

export interface PreviewTurnShapeExpectation {
  readonly evaluatorId: string;
  readonly previewStatus?: PreviewTurnShapeStatus;
}

export interface AssertPreviewStatusesInput {
  readonly result: Pick<CompetenceRunResult, 'agentDecision'>;
  readonly decisiveRefs?: readonly PreviewRefExpectation[];
  readonly candidates?: readonly PreviewCandidateExpectation[];
  readonly seatMatrix?: readonly PreviewSeatMatrixExpectation[];
  readonly turnShape?: readonly PreviewTurnShapeExpectation[];
}

export function assertPreviewStatuses(
  result: Pick<CompetenceRunResult, 'agentDecision'>,
  decisiveRefs: readonly PreviewRefExpectation[],
): void;
export function assertPreviewStatuses(input: AssertPreviewStatusesInput): void;
export function assertPreviewStatuses(
  inputOrResult: AssertPreviewStatusesInput | Pick<CompetenceRunResult, 'agentDecision'>,
  decisiveRefs?: readonly PreviewRefExpectation[],
): void {
  const input = decisiveRefs === undefined
    ? inputOrResult as AssertPreviewStatusesInput
    : { result: inputOrResult as Pick<CompetenceRunResult, 'agentDecision'>, decisiveRefs };
  const trace = requirePolicyTrace(input.result.agentDecision);

  for (const expected of input.decisiveRefs ?? []) {
    assertPreviewRef(trace, expected);
  }
  for (const expected of input.candidates ?? []) {
    assertCandidate(trace, expected);
  }
  for (const expected of input.seatMatrix ?? []) {
    assertSeatMatrix(trace, expected);
  }
  for (const expected of input.turnShape ?? []) {
    assertTurnShape(trace, expected);
  }
}

const requirePolicyTrace = (trace: PolicyAgentDecisionTrace | undefined): PolicyAgentDecisionTrace => {
  assert.ok(trace, 'expected policy decision trace');
  assert.equal(trace.kind, 'policy');
  return trace;
};

const assertPreviewRef = (
  trace: PolicyAgentDecisionTrace,
  expected: PreviewRefExpectation,
): void => {
  const candidate = candidateFor(trace, expected.stableMoveKey);
  const status = previewRefStatus(candidate, expected.refId);
  assert.ok(status !== undefined, `expected preview ref ${expected.refId} on candidate ${candidate.stableMoveKey}`);
  if (expected.status !== undefined) {
    assert.equal(status, expected.status, `preview ref ${expected.refId} status mismatch`);
  }
  if (status !== 'ready') {
    assert.ok(
      candidate.unknownPreviewRefs.some((entry) => entry.refId === expected.refId && entry.reason === status),
      `expected non-ready preview ref ${expected.refId} to be explicitly traced; got ${format(candidate.unknownPreviewRefs)}`,
    );
    assertPreviewFallback(candidate, expected);
  }
};

const previewRefStatus = (
  candidate: PolicyCandidateDecisionTrace,
  refId: string,
): PreviewRefStatus | undefined => {
  const unknown = candidate.unknownPreviewRefs.find((entry) => entry.refId === refId);
  if (unknown !== undefined) {
    return unknown.reason;
  }
  return candidate.previewRefIds.includes(refId) ? 'ready' : undefined;
};

const assertPreviewFallback = (
  candidate: PolicyCandidateDecisionTrace,
  expected: PreviewRefExpectation,
): void => {
  assert.ok(
    candidate.previewFallbackFired,
    `expected non-ready preview ref ${expected.refId} to have trace-visible preview fallback`,
  );
  if (expected.fallback?.termId !== undefined) {
    assert.equal(candidate.previewFallbackFired.termId, expected.fallback.termId);
  }
  if (expected.fallback?.kind !== undefined) {
    assert.equal(candidate.previewFallbackFired.kind, expected.fallback.kind);
  }
};

const assertCandidate = (
  trace: PolicyAgentDecisionTrace,
  expected: PreviewCandidateExpectation,
): void => {
  const candidate = candidateFor(trace, expected.stableMoveKey);
  if (expected.previewOutcome !== undefined) {
    assert.equal(candidate.previewOutcome, expected.previewOutcome);
  }
  if (expected.selectionReason !== undefined) {
    assert.equal(candidate.selectionReason, expected.selectionReason);
  }
};

const assertSeatMatrix = (
  trace: PolicyAgentDecisionTrace,
  expected: PreviewSeatMatrixExpectation,
): void => {
  const candidate = candidateFor(trace, expected.stableMoveKey);
  const ref = trace.previewUsage.seatMatrix?.byCandidate[candidate.stableMoveKey]?.perSeatRefs[expected.refId];
  assert.ok(ref, `expected seat-matrix ref ${expected.refId} for candidate ${candidate.stableMoveKey}`);
  const cell = ref[expected.seat];
  assert.ok(cell, `expected seat-matrix ref ${expected.refId} for seat ${expected.seat}`);
  if (expected.status !== undefined) {
    assert.equal(cell.status, expected.status);
  }
};

const assertTurnShape = (
  trace: PolicyAgentDecisionTrace,
  expected: PreviewTurnShapeExpectation,
): void => {
  const entry = trace.turnShape?.evaluators.find((candidate) => candidate.id === expected.evaluatorId);
  assert.ok(entry, `expected turn-shape evaluator ${expected.evaluatorId}`);
  if (expected.previewStatus !== undefined) {
    assert.equal(entry.previewStatus, expected.previewStatus);
  }
};

const candidateFor = (
  trace: PolicyAgentDecisionTrace,
  stableMoveKey: string | undefined,
): PolicyCandidateDecisionTrace => {
  assert.ok(trace.candidates, 'expected verbose/debug policy candidate trace');
  const targetKey = stableMoveKey ?? trace.selectedStableMoveKey;
  assert.ok(targetKey, 'expected stable move key for preview-status assertion');
  const candidate = trace.candidates.find((entry) => entry.stableMoveKey === targetKey);
  assert.ok(
    candidate,
    `expected candidate ${targetKey}; got ${format(trace.candidates.map((entry) => entry.stableMoveKey))}`,
  );
  return candidate;
};

const format = (value: unknown): string => JSON.stringify(value);
