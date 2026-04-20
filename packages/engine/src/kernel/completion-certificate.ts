import { completeMoveDecisionSequence } from './move-decision-completion.js';
import type { DecisionKey } from './decision-scope.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { evaluateMoveLegality } from './move-legality-predicate.js';
import { kernelRuntimeError } from './runtime-error.js';
import { stableFingerprintHex } from './stable-fingerprint.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  RuntimeWarning,
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

export interface CompletionCertificateFrontierResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly stochasticDecision?: ReturnType<typeof completeMoveDecisionSequence>['stochasticDecision'];
  readonly warnings: readonly RuntimeWarning[];
}

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
  stableFingerprintHex('completion-certificate-v1', {
    projectedStateHash: input.stateHash.toString(),
    actionId: String(input.actionId),
    baseParams: normalizeMoveParams(input.baseParams),
    assignments: normalizeAssignments(input.assignments),
  });

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

const createCertificateChoose = (
  certificate: CompletionCertificate,
): ((request: ChoicePendingRequest) => MoveParamValue) => {
  let nextAssignmentIndex = 0;
  return (request) => {
    const assignment = consumeCertificateAssignment(request, certificate.assignments, nextAssignmentIndex);
    const matchedIndex = certificate.assignments.indexOf(assignment, nextAssignmentIndex);
    nextAssignmentIndex = matchedIndex + 1;
    return assignment.value;
  };
};

const assertCertificateFingerprint = (
  state: GameState,
  baseMove: Move,
  certificate: CompletionCertificate,
): void => {
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
};

export const materializeCompletionCertificateFrontier = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  certificate: CompletionCertificate,
  runtime?: GameDefRuntime,
): CompletionCertificateFrontierResult => {
  assertCertificateFingerprint(state, baseMove, certificate);

  const result = completeMoveDecisionSequence(
    def,
    state,
    baseMove,
    {
      choose: createCertificateChoose(certificate),
    },
    runtime,
  );

  if (result.illegal !== undefined || result.nextDecision !== undefined) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate underspecified the move decision sequence.',
    );
  }

  if (!result.complete && result.stochasticDecision === undefined) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate failed to reach a complete or stochastic frontier.',
    );
  }

  if (result.complete) {
    const legality = evaluateMoveLegality(def, state, result.move, runtime);
    if (legality.kind !== 'legal') {
      throw kernelRuntimeError(
        'RUNTIME_CONTRACT_INVALID',
        'Completion certificate materialized an illegal move.',
      );
    }
  }

  return result;
};

export const materializeCompletionCertificate = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  certificate: CompletionCertificate,
  runtime?: GameDefRuntime,
): Move => {
  const result = materializeCompletionCertificateFrontier(def, state, baseMove, certificate, runtime);

  if (!result.complete) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'Completion certificate failed to fully materialize the move decision sequence.',
    );
  }

  return result.move;
};
