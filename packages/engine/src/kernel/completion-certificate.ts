import { createHash } from 'node:crypto';

import { completeMoveDecisionSequence } from './move-decision-completion.js';
import type { DecisionKey } from './decision-scope.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { evaluateMoveLegality } from './move-legality-predicate.js';
import { kernelRuntimeError } from './runtime-error.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
} from './types.js';

export interface CompletionCertificateAssignment {
  readonly decisionKey: DecisionKey;
  readonly value: MoveParamValue;
  readonly requestType: 'chooseOne' | 'chooseN';
}

export interface CompletionCertificateDiagnostics {
  readonly probeStepsConsumed: number;
  readonly paramExpansionsConsumed: number;
  readonly memoHits: number;
  readonly nogoodsRecorded: number;
}

export interface CompletionCertificate {
  readonly assignments: readonly CompletionCertificateAssignment[];
  readonly fingerprint: string;
  readonly diagnostics?: CompletionCertificateDiagnostics;
}

interface CompletionCertificateFingerprintInput {
  readonly stateHash: GameState['stateHash'];
  readonly actionId: Move['actionId'];
  readonly baseParams: Move['params'];
  readonly assignments: readonly CompletionCertificateAssignment[];
}

const canonicalizeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeValue(entryValue)}`);
  return `{${entries.join(',')}}`;
};

const normalizeMoveParams = (params: Move['params']): Readonly<Record<string, MoveParamValue>> =>
  Object.fromEntries(
    Object.entries(params).sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, MoveParamValue>>;

const normalizeAssignments = (
  assignments: readonly CompletionCertificateAssignment[],
): readonly Readonly<Record<string, unknown>>[] =>
  assignments.map((assignment) => ({
    decisionKey: assignment.decisionKey,
    requestType: assignment.requestType,
    value: assignment.value,
  }));

export const deriveCompletionCertificateFingerprint = (
  input: CompletionCertificateFingerprintInput,
): string =>
  createHash('sha256')
    .update('completion-certificate-v1')
    .update('\0')
    .update(canonicalizeValue({
      projectedStateHash: input.stateHash.toString(),
      actionId: String(input.actionId),
      baseParams: normalizeMoveParams(input.baseParams),
      assignments: normalizeAssignments(input.assignments),
    }))
    .digest('hex');

const consumeCertificateAssignment = (
  request: ChoicePendingRequest,
  assignments: readonly CompletionCertificateAssignment[],
  startIndex: number,
): CompletionCertificateAssignment => {
  for (let index = startIndex; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    if (
      assignment !== undefined
      && assignment.decisionKey === request.decisionKey
      && assignment.requestType === request.type
    ) {
      return assignment;
    }
  }

  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    'Completion certificate underspecified the move decision sequence.',
  );
};

export const materializeCompletionCertificate = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  certificate: CompletionCertificate,
  runtime?: GameDefRuntime,
): Move => {
  const expectedFingerprint = deriveCompletionCertificateFingerprint({
    stateHash: state.stateHash,
    actionId: baseMove.actionId,
    baseParams: baseMove.params,
    assignments: certificate.assignments,
  });
  if (certificate.fingerprint !== expectedFingerprint) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate fingerprint does not match the materialization inputs.',
    );
  }

  let nextAssignmentIndex = 0;
  const result = completeMoveDecisionSequence(
    def,
    state,
    baseMove,
    {
      choose: (request) => {
        const assignment = consumeCertificateAssignment(request, certificate.assignments, nextAssignmentIndex);
        const matchedIndex = certificate.assignments.indexOf(assignment, nextAssignmentIndex);
        nextAssignmentIndex = matchedIndex + 1;
        return assignment.value;
      },
    },
    runtime,
  );

  if (!result.complete) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate failed to fully materialize the move decision sequence.',
    );
  }

  const legality = evaluateMoveLegality(def, state, result.move, runtime);
  if (legality.kind !== 'legal') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate materialized an illegal move.',
    );
  }

  return result.move;
};
