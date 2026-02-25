import type { PlayerId, ZoneId } from './branded.js';
import type { EvalErrorDeferClass } from './eval-error-defer-class.js';
import type {
  SelectorCardinalityPlayerCountEvalErrorContext,
  SelectorCardinalityPlayerResolvedEvalErrorContext,
  SelectorCardinalityZoneEvalErrorContext,
} from './eval-error.js';
import type { PlayerSel, ZoneSel } from './types.js';

export function selectorCardinalityPlayerCountContext(
  selector: PlayerSel,
  playerCount: number,
): SelectorCardinalityPlayerCountEvalErrorContext {
  return {
    selectorKind: 'player',
    selector,
    playerCount,
  };
}

export function selectorCardinalityPlayerResolvedContext(
  selector: PlayerSel,
  resolvedPlayers: readonly PlayerId[],
): SelectorCardinalityPlayerResolvedEvalErrorContext {
  return {
    selectorKind: 'player',
    selector,
    resolvedCount: resolvedPlayers.length,
    resolvedPlayers,
  };
}

export function selectorCardinalityZoneResolvedContext(
  selector: ZoneSel,
  resolvedZones: readonly ZoneId[],
  deferClass?: EvalErrorDeferClass,
): SelectorCardinalityZoneEvalErrorContext {
  return {
    selectorKind: 'zone',
    selector,
    resolvedCount: resolvedZones.length,
    resolvedZones,
    ...(deferClass === undefined ? {} : { deferClass }),
  };
}
