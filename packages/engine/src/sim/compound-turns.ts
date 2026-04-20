import type { CompoundTurnSummary, SimulationStopReason } from '../kernel/types.js';
import type { DecisionLog } from '../kernel/microturn/types.js';

export const synthesizeCompoundTurnSummaries = (
  decisions: readonly DecisionLog[],
  stopReason?: SimulationStopReason,
): readonly CompoundTurnSummary[] => {
  const summaries: CompoundTurnSummary[] = [];
  let index = 0;

  while (index < decisions.length) {
    const first = decisions[index];
    if (first === undefined) {
      break;
    }
    let end = index + 1;
    while (end < decisions.length && decisions[end]?.turnId === first.turnId) {
      end += 1;
    }
    const isLastSummary = end === decisions.length;
    const turnStopReason: CompoundTurnSummary['turnStopReason'] =
      isLastSummary && stopReason === 'terminal'
        ? 'terminal'
        : isLastSummary && stopReason === 'maxTurns'
          ? 'maxTurns'
          : 'retired';

    summaries.push({
      turnId: first.turnId,
      seatId: first.seatId,
      decisionIndexRange: { start: index, end },
      microturnCount: end - index,
      turnStopReason,
    });
    index = end;
  }

  return summaries;
};
