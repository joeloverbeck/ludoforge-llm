import { perfStart, perfDynEnd, type PerfProfiler } from '../kernel/perf-profiler.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
import { materializeCompletionCertificate } from '../kernel/completion-certificate.js';
import type { DrawDeadEndOptionalChooseN } from '../kernel/move-completion.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { fork } from '../kernel/prng.js';
import { createTrustedExecutableMove } from '../kernel/trusted-move.js';
import type {
  Agent,
  ChoicePendingRequest,
  Move,
  MoveParamValue,
  PolicyCompletionStatistics,
  PolicyMovePreparationTrace,
  Rng,
  RuntimeWarning,
  TrustedExecutableMove,
} from '../kernel/types.js';

/**
 * Maximum additional attempts granted when every template completion so far
 * returned `notViable` (bad random target draw) but the template is
 * structurally completable.  Keeps the total attempt count bounded while
 * giving the RNG enough draws to find a viable completion.
 */
export const NOT_VIABLE_RETRY_CAP = 7;

export interface PreparePlayableMovesOptions {
  readonly pendingTemplateCompletions?: number;
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly actionIdFilter?: Move['actionId'];
  readonly disableGuidedChooser?: boolean;
}

export interface PreparedPlayableMoves {
  readonly completedMoves: readonly TrustedExecutableMove[];
  readonly stochasticMoves: readonly TrustedExecutableMove[];
  readonly rng: Rng;
  readonly statistics: PolicyCompletionStatistics;
  readonly movePreparations: readonly PolicyMovePreparationTrace[];
}

interface TemplateCompletionTrace {
  readonly finalClassification: PolicyMovePreparationTrace['finalClassification'];
  readonly enteredTrustedMoveIndex: boolean;
  readonly skippedAsDuplicate?: boolean;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionOutcome: NonNullable<PolicyMovePreparationTrace['templateCompletionOutcome']>;
  readonly rejection?: PolicyMovePreparationTrace['rejection'];
  readonly warnings?: readonly RuntimeWarning[];
}

const sameRngState = (left: Rng, right: Rng): boolean =>
  left.state.algorithm === right.state.algorithm
  && left.state.version === right.state.version
  && left.state.state.length === right.state.state.length
  && left.state.state.every((entry, index) => entry === right.state.state[index]);

export function preparePlayableMoves(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'certificateIndex' | 'rng' | 'runtime' | 'profiler'>,
  options: PreparePlayableMovesOptions = {},
): PreparedPlayableMoves {
  const profiler: PerfProfiler | undefined = (input as { profiler?: PerfProfiler }).profiler;
  const completedMoves: TrustedExecutableMove[] = [];
  const stochasticMoves: TrustedExecutableMove[] = [];
  let completedCount = 0;
  let stochasticCount = 0;
  let rejectedNotViable = 0;
  let templateCompletionAttempts = 0;
  let templateCompletionSuccesses = 0;
  let templateCompletionStructuralFailures = 0;
  let duplicatesRemoved = 0;
  const completionsByActionId = new Map<string, number>();
  const movePreparations: PolicyMovePreparationTrace[] = [];
  const seenMoveKeys = new Set<string>();
  const emittedPlayableMoveKeys = new Set<string>();
  let rng = input.rng;
  const pendingTemplateCompletions = options.pendingTemplateCompletions ?? 1;
  const recordPlayableMove = (
    trustedMove: TrustedExecutableMove,
    classification: 'complete' | 'stochastic',
  ): boolean => {
    const emittedStableMoveKey = toMoveIdentityKey(input.def, trustedMove.move);
    if (emittedPlayableMoveKeys.has(emittedStableMoveKey)) {
      duplicatesRemoved += 1;
      return false;
    }
    emittedPlayableMoveKeys.add(emittedStableMoveKey);
    if (classification === 'complete') {
      completedMoves.push(trustedMove);
    } else {
      stochasticMoves.push(trustedMove);
    }
    return true;
  };

  for (const classified of input.legalMoves) {
    const { move, viability } = classified;
    if (options.actionIdFilter !== undefined && move.actionId !== options.actionIdFilter) {
      continue;
    }
    const stableMoveKey = toMoveIdentityKey(input.def, move);
    if (seenMoveKeys.has(stableMoveKey)) {
      duplicatesRemoved += 1;
      movePreparations.push({
        actionId: String(move.actionId),
        stableMoveKey,
        initialClassification: 'rejected',
        finalClassification: 'rejected',
        enteredTrustedMoveIndex: false,
        skippedAsDuplicate: true,
      });
      continue;
    }
    seenMoveKeys.add(stableMoveKey);
    if (!viability.viable) {
      rejectedNotViable += 1;
      movePreparations.push({
        actionId: String(move.actionId),
        stableMoveKey,
        initialClassification: 'rejected',
        finalClassification: 'rejected',
        enteredTrustedMoveIndex: false,
        rejection: 'notViable',
      });
      continue;
    }
    if (viability.complete) {
      if (classified.trustedMove === undefined) {
        throw new Error(`complete classified move ${String(move.actionId)} is missing trusted execution metadata`);
      }
      const enteredTrustedMoveIndex = recordPlayableMove(classified.trustedMove, 'complete');
      if (enteredTrustedMoveIndex) {
        completedCount += 1;
      }
      movePreparations.push({
        actionId: String(move.actionId),
        stableMoveKey,
        initialClassification: 'complete',
        finalClassification: enteredTrustedMoveIndex ? 'complete' : 'rejected',
        enteredTrustedMoveIndex,
        ...(enteredTrustedMoveIndex ? {} : { skippedAsDuplicate: true }),
      });
      continue;
    }
    if (viability.stochasticDecision !== undefined) {
      if (classified.trustedMove === undefined) {
        throw new Error(`stochastic classified move ${String(move.actionId)} is missing trusted execution metadata`);
      }
      const enteredTrustedMoveIndex = recordPlayableMove(classified.trustedMove, 'stochastic');
      if (enteredTrustedMoveIndex) {
        stochasticCount += 1;
      }
      movePreparations.push({
        actionId: String(move.actionId),
        stableMoveKey,
        initialClassification: 'stochastic',
        finalClassification: enteredTrustedMoveIndex ? 'stochastic' : 'rejected',
        enteredTrustedMoveIndex,
        ...(enteredTrustedMoveIndex ? {} : { skippedAsDuplicate: true }),
      });
      continue;
    }

    // Pending decisions: fall back to the template completion path
    const completion = attemptTemplateCompletion(
      input,
      move,
      rng,
      pendingTemplateCompletions,
      options.choose,
      recordPlayableMove,
      profiler,
      completionsByActionId,
    );
    rng = completion.rng;
    stochasticCount += completion.stochasticCount;
    templateCompletionAttempts += completion.templateCompletionAttempts;
    templateCompletionSuccesses += completion.templateCompletionSuccesses;
    templateCompletionStructuralFailures += completion.templateCompletionStructuralFailures;
    movePreparations.push({
      actionId: String(move.actionId),
      stableMoveKey,
      initialClassification: 'pending',
      finalClassification: completion.trace.finalClassification,
      enteredTrustedMoveIndex: completion.trace.enteredTrustedMoveIndex,
      ...(completion.trace.skippedAsDuplicate === true ? { skippedAsDuplicate: true } : {}),
      templateCompletionAttempts: completion.trace.templateCompletionAttempts,
      templateCompletionOutcome: completion.trace.templateCompletionOutcome,
      ...(completion.trace.rejection === undefined ? {} : { rejection: completion.trace.rejection }),
      ...(completion.trace.warnings === undefined ? {} : { warnings: completion.trace.warnings }),
    });
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
    movePreparations,
    statistics: {
      totalClassifiedMoves: input.legalMoves.length,
      completedCount,
      stochasticCount,
      rejectedNotViable,
      templateCompletionAttempts,
      templateCompletionSuccesses,
      templateCompletionStructuralFailures,
      duplicatesRemoved,
      ...(completionsByActionId.size === 0
        ? {}
        : { completionsByActionId: Object.fromEntries(completionsByActionId) }),
    },
  };
}

/**
 * Try to complete a template move by randomly resolving pending decisions.
 * Shared by the normal pending-decision path and the zone-filter-mismatch
 * fallthrough path.
 */
function attemptTemplateCompletion(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'certificateIndex' | 'rng' | 'runtime' | 'profiler'>,
  move: Move,
  initialRng: Rng,
  pendingTemplateCompletions: number,
  choose: ((request: ChoicePendingRequest) => MoveParamValue | undefined) | undefined,
  recordPlayableMove: (trustedMove: TrustedExecutableMove, classification: 'complete' | 'stochastic') => boolean,
  profiler: PerfProfiler | undefined,
  completionsByActionId: Map<string, number>,
): {
  readonly rng: Rng;
  readonly stochasticCount: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionStructuralFailures: number;
  readonly trace: TemplateCompletionTrace;
} {
  let currentRng = initialRng;
  let stochasticCount = 0;
  let templateCompletionAttempts = 0;
  let templateCompletionSuccesses = 0;
  let templateCompletionStructuralFailures = 0;
  let sawCompletedMove = false;
  let duplicateOutputOutcome: TemplateCompletionTrace['templateCompletionOutcome'] | undefined;
  let rejection: PolicyMovePreparationTrace['rejection'] | undefined;
  const warnings: RuntimeWarning[] = [];
  // When every attempt so far returned `notViable` (bad random target draw,
  // not a structural impossibility), grant extra attempts so the RNG can find
  // a viable completion.  `notViableRetries` counts the granted extensions;
  // the hard cap keeps total attempts bounded.
  let notViableRetries = 0;
  let priorDeadEndOptionalChooseN: DrawDeadEndOptionalChooseN | null = null;
  for (let attempt = 0; attempt < pendingTemplateCompletions + notViableRetries; attempt += 1) {
    templateCompletionAttempts += 1;
    const shouldBias = priorDeadEndOptionalChooseN !== null && priorDeadEndOptionalChooseN.sampledCount === 0;
    // Derive an isolated child stream per attempt so retries do not replay the
    // same dead-end completion path from an unchanged parent RNG state.
    const [attemptRng, retryRng] = fork(currentRng);
    const t0_epc = perfStart(profiler);
    const retryBiasNonEmpty = shouldBias;
    const result = evaluatePlayableMoveCandidate(
      input.def,
      input.state,
      move,
      attemptRng,
      input.runtime,
      {
        ...(choose === undefined ? {} : { choose }),
        ...(retryBiasNonEmpty ? { retryBiasNonEmpty: true } : {}),
      },
    );
    if (retryBiasNonEmpty) {
      const priorDiagnostic = priorDeadEndOptionalChooseN;
      warnings.push({
        code: 'MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY',
        message: 'Retrying template completion with non-empty bias after an optional chooseN empty draw dead-end.',
        context: {
          attemptIndex: attempt,
          decisionKey: String(priorDiagnostic!.decisionKey),
          declaredMin: priorDiagnostic!.declaredMin,
          declaredMax: priorDiagnostic!.declaredMax,
          sampledCount: priorDiagnostic!.sampledCount,
          reason: 'optional-chooseN-empty-draw-dead-end',
        },
      });
    }
    perfDynEnd(profiler, 'agent:evaluatePlayableCandidate', t0_epc);
    currentRng = result.kind === 'rejected'
      ? (sameRngState(result.rng, attemptRng) ? retryRng : result.rng)
      : result.rng;
    if (result.kind === 'playableComplete') {
      priorDeadEndOptionalChooseN = null;
      templateCompletionSuccesses += 1;
      completionsByActionId.set(
        String(move.actionId),
        (completionsByActionId.get(String(move.actionId)) ?? 0) + 1,
      );
      if (recordPlayableMove(result.move, 'complete')) {
        sawCompletedMove = true;
      } else {
        duplicateOutputOutcome = 'complete';
      }
      continue;
    }
    if (result.kind === 'playableStochastic') {
      if (recordPlayableMove(result.move, 'stochastic')) {
        stochasticCount += 1;
      } else {
        duplicateOutputOutcome = 'stochastic';
      }
      rejection = undefined;
      break;
    }
    rejection = result.rejection;
    if (result.rejection === 'structurallyUnsatisfiable') {
      templateCompletionStructuralFailures += 1;
      break;
    }
    if (result.rejection === 'drawDeadEnd') {
      const diagnostic = result.drawDeadEndOptionalChooseN;
      if (diagnostic !== null && diagnostic !== undefined && diagnostic.sampledCount === 0) {
        priorDeadEndOptionalChooseN = diagnostic;
      } else {
        priorDeadEndOptionalChooseN = null;
      }
    } else {
      priorDeadEndOptionalChooseN = null;
    }
    // `notViable` and `drawDeadEnd` mean the current random path failed, but a
    // different draw may still complete the same template. Extend the budget
    // while we have not yet found any viable completion and the cap remains.
    if (
      (result.rejection === 'notViable' || result.rejection === 'drawDeadEnd')
      && !sawCompletedMove
      && stochasticCount === 0
      && notViableRetries < NOT_VIABLE_RETRY_CAP
    ) {
      notViableRetries += 1;
    }
  }
  if (!sawCompletedMove && stochasticCount === 0 && duplicateOutputOutcome === undefined) {
    const certificate = input.certificateIndex?.get(toMoveIdentityKey(input.def, move));
    if (certificate !== undefined) {
      const certifiedMove = createTrustedExecutableMove(
        materializeCompletionCertificate(input.def, input.state, move, certificate, input.runtime),
        input.state.stateHash,
        'templateCompletion',
      );
      if (recordPlayableMove(certifiedMove, 'complete')) {
        sawCompletedMove = true;
      } else {
        duplicateOutputOutcome = 'complete';
      }
    } else {
      warnings.push({
        code: 'CONSTRUCTIBILITY_INVARIANT_VIOLATION',
        message: 'Admitted incomplete legal move had no certificate at agent fallback time.',
        context: {
          actionId: String(move.actionId),
          stateHash: input.state.stateHash,
        },
      });
    }
  }
  const trace: TemplateCompletionTrace = stochasticCount > 0
    ? {
        finalClassification: 'stochastic',
        enteredTrustedMoveIndex: true,
        templateCompletionAttempts,
        templateCompletionOutcome: 'stochastic',
        ...(warnings.length === 0 ? {} : { warnings }),
      }
    : sawCompletedMove
      ? {
          finalClassification: 'complete',
        enteredTrustedMoveIndex: true,
        templateCompletionAttempts,
        templateCompletionOutcome: 'complete',
        ...(warnings.length === 0 ? {} : { warnings }),
      }
      : duplicateOutputOutcome !== undefined
        ? {
            finalClassification: 'rejected',
            enteredTrustedMoveIndex: false,
            skippedAsDuplicate: true,
            templateCompletionAttempts,
            templateCompletionOutcome: duplicateOutputOutcome,
            ...(warnings.length === 0 ? {} : { warnings }),
          }
      : {
          finalClassification: 'rejected',
          enteredTrustedMoveIndex: false,
          templateCompletionAttempts,
          templateCompletionOutcome: 'failed',
          ...(rejection === undefined ? {} : { rejection }),
          ...(warnings.length === 0 ? {} : { warnings }),
        };
  return {
    rng: currentRng,
    stochasticCount,
    templateCompletionAttempts,
    templateCompletionSuccesses,
    templateCompletionStructuralFailures,
    trace,
  };
}
