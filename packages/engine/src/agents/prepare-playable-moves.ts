import { perfStart, perfDynEnd, type PerfProfiler } from '../kernel/perf-profiler.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
import type { Agent, ClassifiedMove, Move, PolicyCompletionStatisticsTrace, Rng, TrustedExecutableMove } from '../kernel/types.js';

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
}

export interface PreparedPlayableMoves {
  readonly completedMoves: readonly TrustedExecutableMove[];
  readonly stochasticMoves: readonly TrustedExecutableMove[];
  readonly rng: Rng;
  readonly statistics: PolicyCompletionStatisticsTrace;
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
  let rng = input.rng;
  const pendingTemplateCompletions = options.pendingTemplateCompletions ?? 1;

  for (const classified of input.legalMoves) {
    const { move, viability } = classified;
    if (!viability.viable) {
      // Zone-filter mismatches on free-operation templates are not definitive
      // rejections — the zone filter cannot be evaluated until target zones are
      // selected during template completion.  Fall through to the completion
      // path so evaluatePlayableMoveCandidate can resolve zones and re-check.
      if (isZoneFilterMismatchOnFreeOpTemplate(classified)) {
        const completion = attemptTemplateCompletion(input, move, rng, pendingTemplateCompletions, completedMoves, stochasticMoves, profiler);
        rng = completion.rng;
        stochasticCount += completion.stochasticCount;
        templateCompletionAttempts += completion.templateCompletionAttempts;
        templateCompletionSuccesses += completion.templateCompletionSuccesses;
        templateCompletionUnsatisfiable += completion.templateCompletionUnsatisfiable;
      } else {
        rejectedNotViable += 1;
      }
      continue;
    }
    if (viability.complete) {
      if (classified.trustedMove === undefined) {
        throw new Error(`complete classified move ${String(move.actionId)} is missing trusted execution metadata`);
      }
      completedMoves.push(classified.trustedMove);
      completedCount += 1;
      continue;
    }
    if (viability.stochasticDecision !== undefined) {
      if (classified.trustedMove === undefined) {
        throw new Error(`stochastic classified move ${String(move.actionId)} is missing trusted execution metadata`);
      }
      stochasticMoves.push(classified.trustedMove);
      stochasticCount += 1;
      continue;
    }

    // Pending decisions: fall back to the template completion path
    const completion = attemptTemplateCompletion(input, move, rng, pendingTemplateCompletions, completedMoves, stochasticMoves, profiler);
    rng = completion.rng;
    stochasticCount += completion.stochasticCount;
    templateCompletionAttempts += completion.templateCompletionAttempts;
    templateCompletionSuccesses += completion.templateCompletionSuccesses;
    templateCompletionUnsatisfiable += completion.templateCompletionUnsatisfiable;
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
    statistics: {
      totalClassifiedMoves: input.legalMoves.length,
      completedCount,
      stochasticCount,
      rejectedNotViable,
      templateCompletionAttempts,
      templateCompletionSuccesses,
      templateCompletionUnsatisfiable,
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
  completedMoves: TrustedExecutableMove[],
  stochasticMoves: TrustedExecutableMove[],
  profiler: PerfProfiler | undefined,
): {
  readonly rng: Rng;
  readonly stochasticCount: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
} {
  let currentRng = initialRng;
  let stochasticCount = 0;
  let templateCompletionAttempts = 0;
  let templateCompletionSuccesses = 0;
  let templateCompletionUnsatisfiable = 0;
  for (let attempt = 0; attempt < pendingTemplateCompletions; attempt += 1) {
    templateCompletionAttempts += 1;
    const t0_epc = perfStart(profiler);
    const result = evaluatePlayableMoveCandidate(input.def, input.state, move, currentRng, input.runtime);
    perfDynEnd(profiler, 'agent:evaluatePlayableCandidate', t0_epc);
    currentRng = result.rng;
    if (result.kind === 'playableComplete') {
      completedMoves.push(result.move);
      templateCompletionSuccesses += 1;
      continue;
    }
    if (result.kind === 'playableStochastic') {
      stochasticMoves.push(result.move);
      stochasticCount += 1;
      break;
    }
    if (result.rejection === 'completionUnsatisfiable') {
      templateCompletionUnsatisfiable += 1;
      break;
    }
  }
  return {
    rng: currentRng,
    stochasticCount,
    templateCompletionAttempts,
    templateCompletionSuccesses,
    templateCompletionUnsatisfiable,
  };
}
