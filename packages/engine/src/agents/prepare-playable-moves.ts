import { perfStart, perfDynEnd, type PerfProfiler } from '../kernel/perf-profiler.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
import type { Agent, ClassifiedMove, Move, Rng } from '../kernel/types.js';

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
  readonly completedMoves: readonly Move[];
  readonly stochasticMoves: readonly Move[];
  readonly rng: Rng;
}

export function preparePlayableMoves(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'rng' | 'runtime' | 'profiler'>,
  options: PreparePlayableMovesOptions = {},
): PreparedPlayableMoves {
  const profiler: PerfProfiler | undefined = (input as { profiler?: PerfProfiler }).profiler;
  const completedMoves: Move[] = [];
  const stochasticMoves: Move[] = [];
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
        rng = attemptTemplateCompletion(input, move, rng, pendingTemplateCompletions, completedMoves, stochasticMoves, profiler);
      }
      continue;
    }
    if (viability.complete) {
      completedMoves.push(viability.move);
      continue;
    }
    if (viability.stochasticDecision !== undefined) {
      stochasticMoves.push(viability.move);
      continue;
    }

    // Pending decisions: fall back to the template completion path
    rng = attemptTemplateCompletion(input, move, rng, pendingTemplateCompletions, completedMoves, stochasticMoves, profiler);
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
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
  completedMoves: Move[],
  stochasticMoves: Move[],
  profiler: PerfProfiler | undefined,
): Rng {
  let currentRng = initialRng;
  for (let attempt = 0; attempt < pendingTemplateCompletions; attempt += 1) {
    const t0_epc = perfStart(profiler);
    const result = evaluatePlayableMoveCandidate(input.def, input.state, move, currentRng, input.runtime);
    perfDynEnd(profiler, 'agent:evaluatePlayableCandidate', t0_epc);
    currentRng = result.rng;
    if (result.kind === 'playableComplete') {
      completedMoves.push(result.move);
      continue;
    }
    if (result.kind === 'playableStochastic') {
      stochasticMoves.push(result.move);
      break;
    }
    if (result.rejection === 'completionUnsatisfiable') {
      break;
    }
  }
  return currentRng;
}
