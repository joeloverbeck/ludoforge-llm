import { legalChoicesEvaluate } from '../kernel/legal-choices.js';
import { perfStart, perfDynEnd, type PerfProfiler } from '../kernel/perf-profiler.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
import { probeMoveViability } from '../kernel/apply-move.js';
import type { Agent, Move, Rng } from '../kernel/types.js';

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

  for (const move of input.legalMoves) {
    // Fast path: probe viability directly. For complete moves (common case),
    // this avoids the redundant legalChoicesEvaluate → evaluatePlayableMoveCandidate
    // double-validation that costs ~10s across 120K calls.
    const t0_probe = perfStart(profiler);
    const viability = probeMoveViability(input.def, input.state, move, input.runtime);
    perfDynEnd(profiler, 'agent:probeMoveViability', t0_probe);

    if (!viability.viable) {
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
    for (let attempt = 0; attempt < pendingTemplateCompletions; attempt += 1) {
      const t0_epc = perfStart(profiler);
      const result = evaluatePlayableMoveCandidate(input.def, input.state, move, rng, input.runtime);
      perfDynEnd(profiler, 'agent:evaluatePlayableCandidate', t0_epc);
      rng = result.rng;
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
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
  };
}
