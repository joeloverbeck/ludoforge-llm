import { createEvalContext } from './eval-context.js';
import type { ReadContext } from './eval-context.js';
import type { ConditionAST, SpaceMarkerConstraintDef, SpaceMarkerLatticeDef } from './types.js';

export const SPACE_MARKER_CONSTRAINT_ZONE_BINDING = '$space';

export interface SpaceMarkerConstraintViolation {
  readonly constraint: SpaceMarkerConstraintDef;
  readonly constraintIndex: number;
}

const withConstraintZoneBinding = (
  ctx: ReadContext,
  spaceId: string,
): ReadContext => createEvalContext({
  ...ctx,
  bindings: {
    ...ctx.bindings,
    [SPACE_MARKER_CONSTRAINT_ZONE_BINDING]: spaceId,
  },
});

export const findSpaceMarkerConstraintViolation = (
  lattice: SpaceMarkerLatticeDef,
  spaceId: string,
  candidateState: string,
  ctx: ReadContext,
  evaluateCondition: (condition: ConditionAST, evalCtx: ReadContext) => boolean,
): SpaceMarkerConstraintViolation | null => {
  const evalCtx = withConstraintZoneBinding(ctx, spaceId);
  for (const [constraintIndex, constraint] of (lattice.constraints ?? []).entries()) {
    if (!evaluateCondition(constraint.when, evalCtx)) {
      continue;
    }
    if (constraint.allowedStates.includes(candidateState)) {
      continue;
    }
    return { constraint, constraintIndex };
  }
  return null;
};

export const isSpaceMarkerStateAllowed = (
  lattice: SpaceMarkerLatticeDef,
  spaceId: string,
  candidateState: string,
  ctx: ReadContext,
  evaluateCondition: (condition: ConditionAST, evalCtx: ReadContext) => boolean,
): boolean => findSpaceMarkerConstraintViolation(lattice, spaceId, candidateState, ctx, evaluateCondition) === null;
