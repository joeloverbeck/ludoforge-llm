import { createEvalContext } from './eval-context.js';
import type { ReadContext } from './eval-context.js';
import type { ConditionAST, SpaceMarkerConstraintDef, SpaceMarkerLatticeDef } from './types.js';

export const SPACE_MARKER_CONSTRAINT_ZONE_BINDING = '$space';

export interface SpaceMarkerConstraintViolation {
  readonly constraint: SpaceMarkerConstraintDef;
  readonly constraintIndex: number;
}

export interface SpaceMarkerShiftResolution {
  readonly currentState: string;
  readonly currentIndex: number;
  readonly destinationState: string;
  readonly destinationIndex: number;
  readonly changed: boolean;
  readonly allowed: boolean;
  readonly violation: SpaceMarkerConstraintViolation | null;
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

export const resolveSpaceMarkerShift = (
  lattice: SpaceMarkerLatticeDef,
  spaceId: string,
  delta: number,
  ctx: ReadContext,
  evaluateCondition: (condition: ConditionAST, evalCtx: ReadContext) => boolean,
): SpaceMarkerShiftResolution => {
  const spaceMarkers = ctx.state.markers[spaceId] ?? {};
  const currentState = String(spaceMarkers[lattice.id] ?? lattice.defaultState);
  const currentIndex = lattice.states.indexOf(currentState);

  if (currentIndex < 0) {
    throw new Error(`Current marker state "${currentState}" not found in lattice "${lattice.id}"`);
  }

  const destinationIndex = Math.max(0, Math.min(lattice.states.length - 1, currentIndex + delta));
  const destinationState = lattice.states[destinationIndex]!;
  const changed = destinationState !== currentState;
  const violation = changed
    ? findSpaceMarkerConstraintViolation(lattice, spaceId, destinationState, ctx, evaluateCondition)
    : null;

  return {
    currentState,
    currentIndex,
    destinationState,
    destinationIndex,
    changed,
    allowed: violation === null,
    violation,
  };
};
