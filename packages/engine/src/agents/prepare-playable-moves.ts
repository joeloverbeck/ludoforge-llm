import { perfStart, perfDynEnd, type PerfProfiler } from '../kernel/perf-profiler.js';
import { createSeatResolutionContext } from '../kernel/identity.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
import { resolveLegalCompletedFreeOperationMoveInCurrentState } from '../kernel/free-operation-viability.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { createTrustedExecutableMove } from '../kernel/trusted-move.js';
import type {
  Agent,
  ChoicePendingRequest,
  ClassifiedMove,
  Move,
  MoveParamValue,
  PolicyCompletionStatistics,
  PolicyMovePreparationTrace,
  Rng,
  TrustedExecutableMove,
} from '../kernel/types.js';

/**
 * Detect non-viable results that stem from premature zone-filter evaluation on
 * incomplete template moves.  `probeMoveViability` evaluates free-operation zone
 * filters eagerly, but template moves have no target-zone selections yet — so
 * the filter evaluation fails with `zoneFilterMismatch` even though the move
 * may become viable once zones are selected during template completion.
 *
 * These moves should fall through to `evaluatePlayableMoveCandidate` instead of
 * being discarded.
 */
const isZoneFilterMismatchOnFreeOpTemplate = (
  classified: ClassifiedMove,
): boolean => {
  const { move, viability } = classified;
  if (viability.viable || move.freeOperation !== true) {
    return false;
  }
  if (viability.code !== 'ILLEGAL_MOVE') {
    return false;
  }
  const ctx = viability.context;
  return (
    ctx.reason === 'freeOperationNotGranted'
    && 'freeOperationDenial' in ctx
    && (ctx as { readonly freeOperationDenial: { readonly cause: string } })
      .freeOperationDenial.cause === 'zoneFilterMismatch'
  );
};

export interface PreparePlayableMovesOptions {
  readonly pendingTemplateCompletions?: number;
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
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
}

export function preparePlayableMoves(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'rng' | 'runtime' | 'profiler'>,
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
  let templateCompletionUnsatisfiable = 0;
  let duplicatesRemoved = 0;
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
      // Zone-filter mismatches on free-operation templates are not definitive
      // rejections — the zone filter cannot be evaluated until target zones are
      // selected during template completion.  Fall through to the completion
      // path so evaluatePlayableMoveCandidate can resolve zones and re-check.
      if (isZoneFilterMismatchOnFreeOpTemplate(classified)) {
        const completion = attemptTemplateCompletion(
          input,
          move,
          rng,
          pendingTemplateCompletions,
          options.choose,
          recordPlayableMove,
          profiler,
        );
        rng = completion.rng;
        stochasticCount += completion.stochasticCount;
        templateCompletionAttempts += completion.templateCompletionAttempts;
        templateCompletionSuccesses += completion.templateCompletionSuccesses;
        templateCompletionUnsatisfiable += completion.templateCompletionUnsatisfiable;
        movePreparations.push({
          actionId: String(move.actionId),
          stableMoveKey,
          initialClassification: 'rejected',
          finalClassification: completion.trace.finalClassification,
          enteredTrustedMoveIndex: completion.trace.enteredTrustedMoveIndex,
          ...(completion.trace.skippedAsDuplicate === true ? { skippedAsDuplicate: true } : {}),
          templateCompletionAttempts: completion.trace.templateCompletionAttempts,
          templateCompletionOutcome: completion.trace.templateCompletionOutcome,
          ...(completion.trace.rejection === undefined ? {} : { rejection: completion.trace.rejection }),
          fellThroughFromZoneFilterMismatch: true,
        });
      } else {
        rejectedNotViable += 1;
        movePreparations.push({
          actionId: String(move.actionId),
          stableMoveKey,
          initialClassification: 'rejected',
          finalClassification: 'rejected',
          enteredTrustedMoveIndex: false,
          rejection: 'notViable',
        });
      }
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
    );
    rng = completion.rng;
    stochasticCount += completion.stochasticCount;
    templateCompletionAttempts += completion.templateCompletionAttempts;
    templateCompletionSuccesses += completion.templateCompletionSuccesses;
    templateCompletionUnsatisfiable += completion.templateCompletionUnsatisfiable;
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
      templateCompletionUnsatisfiable,
      duplicatesRemoved,
    },
  };
}

/**
 * Try to complete a template move by randomly resolving pending decisions.
 * Shared by the normal pending-decision path and the zone-filter-mismatch
 * fallthrough path.
 */
function attemptTemplateCompletion(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'rng' | 'runtime' | 'profiler'>,
  move: Move,
  initialRng: Rng,
  pendingTemplateCompletions: number,
  choose: ((request: ChoicePendingRequest) => MoveParamValue | undefined) | undefined,
  recordPlayableMove: (trustedMove: TrustedExecutableMove, classification: 'complete' | 'stochastic') => boolean,
  profiler: PerfProfiler | undefined,
): {
  readonly rng: Rng;
  readonly stochasticCount: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
  readonly trace: TemplateCompletionTrace;
} {
  if (move.freeOperation === true) {
    const seatResolution = createSeatResolutionContext(input.def, input.state.playerCount);
    const completedMove = resolveLegalCompletedFreeOperationMoveInCurrentState(
      input.def,
      input.state,
      move,
      seatResolution,
    );
    if (completedMove !== null) {
      const trustedMove = createTrustedExecutableMove(
        completedMove,
        input.state.stateHash,
        'templateCompletion',
      );
      const enteredTrustedMoveIndex = recordPlayableMove(trustedMove, 'complete');
      return {
        rng: initialRng,
        stochasticCount: 0,
        templateCompletionAttempts: 1,
        templateCompletionSuccesses: enteredTrustedMoveIndex ? 1 : 0,
        templateCompletionUnsatisfiable: 0,
        trace: enteredTrustedMoveIndex
          ? {
              finalClassification: 'complete',
              enteredTrustedMoveIndex: true,
              templateCompletionAttempts: 1,
              templateCompletionOutcome: 'complete',
            }
          : {
              finalClassification: 'rejected',
              enteredTrustedMoveIndex: false,
              skippedAsDuplicate: true,
              templateCompletionAttempts: 1,
              templateCompletionOutcome: 'complete',
            },
      };
    }
  }
  let currentRng = initialRng;
  let stochasticCount = 0;
  let templateCompletionAttempts = 0;
  let templateCompletionSuccesses = 0;
  let templateCompletionUnsatisfiable = 0;
  let sawCompletedMove = false;
  let duplicateOutputOutcome: TemplateCompletionTrace['templateCompletionOutcome'] | undefined;
  let rejection: PolicyMovePreparationTrace['rejection'] | undefined;
  for (let attempt = 0; attempt < pendingTemplateCompletions; attempt += 1) {
    templateCompletionAttempts += 1;
    const t0_epc = perfStart(profiler);
    const result = evaluatePlayableMoveCandidate(
      input.def,
      input.state,
      move,
      currentRng,
      input.runtime,
      choose === undefined ? undefined : { choose },
    );
    perfDynEnd(profiler, 'agent:evaluatePlayableCandidate', t0_epc);
    currentRng = result.rng;
    if (result.kind === 'playableComplete') {
      templateCompletionSuccesses += 1;
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
    if (result.rejection === 'completionUnsatisfiable') {
      templateCompletionUnsatisfiable += 1;
      break;
    }
  }
  const trace: TemplateCompletionTrace = stochasticCount > 0
    ? {
        finalClassification: 'stochastic',
        enteredTrustedMoveIndex: true,
        templateCompletionAttempts,
        templateCompletionOutcome: 'stochastic',
      }
    : sawCompletedMove
      ? {
          finalClassification: 'complete',
        enteredTrustedMoveIndex: true,
        templateCompletionAttempts,
        templateCompletionOutcome: 'complete',
      }
      : duplicateOutputOutcome !== undefined
        ? {
            finalClassification: 'rejected',
            enteredTrustedMoveIndex: false,
            skippedAsDuplicate: true,
            templateCompletionAttempts,
            templateCompletionOutcome: duplicateOutputOutcome,
          }
      : {
          finalClassification: 'rejected',
          enteredTrustedMoveIndex: false,
          templateCompletionAttempts,
          templateCompletionOutcome: 'failed',
          ...(rejection === undefined ? {} : { rejection }),
        };
  return {
    rng: currentRng,
    stochasticCount,
    templateCompletionAttempts,
    templateCompletionSuccesses,
    templateCompletionUnsatisfiable,
    trace,
  };
}
