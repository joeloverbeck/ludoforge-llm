import { asSeatId } from '../kernel/branded.js';
import {
  probeCompoundAvailability,
  type CompoundAvailability,
} from '../kernel/microturn/compound-availability-probe.js';
import type { ActiveDeciderSeatId, Decision } from '../kernel/microturn/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type { CompiledPlanRoot, CompiledPlanTemplate, GameDef, GameState } from '../kernel/types.js';

export const PLAN_CAP_CLASS_BUDGETS = {
  standard256: 256,
  deep1024: 1024,
} as const;

type PlanCapClass = keyof typeof PLAN_CAP_CLASS_BUDGETS;

export function capLimitFor(template: CompiledPlanTemplate): number {
  return PLAN_CAP_CLASS_BUDGETS[template.caps.capClass as PlanCapClass] ?? PLAN_CAP_CLASS_BUDGETS.standard256;
}

export function availabilityForPlanRoot(
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly seatId: ActiveDeciderSeatId | string;
    readonly runtime?: GameDefRuntime;
  },
  rootDecision: Extract<Decision, { readonly kind: 'actionSelection' }>,
  compound: NonNullable<CompiledPlanRoot['compound']>,
): CompoundAvailability {
  return probeCompoundAvailability(
    input.def,
    input.state,
    asSeatId(String(input.seatId)),
    rootDecision,
    compound,
    input.runtime,
  );
}

export function compareCompoundAvailability(
  left: CompoundAvailability | undefined,
  right: CompoundAvailability | undefined,
): number {
  return compoundAvailabilityRank(left) - compoundAvailabilityRank(right);
}

function compoundAvailabilityRank(availability: CompoundAvailability | undefined): number {
  switch (availability?.kind) {
    case 'ready':
      return 0;
    case 'provisional':
      return 1;
    case 'unavailable':
      return 2;
    case undefined:
      return 3;
  }
}
