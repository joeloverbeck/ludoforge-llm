import { asActionId } from '../branded.js';
import { getActionPipelinesForAction } from '../action-pipeline-lookup.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { legalChoicesDiscover } from '../legal-choices.js';
import { classifyDecisionContinuationForLegalMove } from './continuation.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from '../missing-binding-policy.js';
import type { SeatId } from '../branded.js';
import type { CompiledPlanRoot, GameDef, GameState, Move } from '../types-core.js';
import type { ActionPipelineDef } from '../types-operations.js';
import type { Decision } from './types.js';

export type CompoundAvailability =
  | { readonly kind: 'ready' }
  | { readonly kind: 'provisional'; readonly reason: 'depth-capped' | 'partial-grant' }
  | { readonly kind: 'unavailable'; readonly reason: 'no-continuation' | 'no-grant-predicate' };

type RootActionSelectionDecision = Extract<Decision, { readonly kind: 'actionSelection' }>;

const actionMatchesSpecialTags = (
  action: GameDef['actions'][number],
  specialTags: readonly string[],
): boolean => {
  const tags = new Set(action.tags ?? []);
  return specialTags.every((tag) => String(action.id) === tag || tags.has(tag));
};

const operationAllowsSpecialActivity = (
  operationActionId: Move['actionId'],
  accompanyingOps: ActionPipelineDef['accompanyingOps'],
): boolean => {
  if (accompanyingOps === undefined || accompanyingOps === 'any') {
    return true;
  }
  return accompanyingOps.includes(String(operationActionId));
};

const findGrantableSpecialActionIds = (
  def: GameDef,
  operationActionId: Move['actionId'],
  compound: NonNullable<CompiledPlanRoot['compound']>,
): readonly Move['actionId'][] => {
  const specialActionIds = def.actions
    .filter((action) => actionMatchesSpecialTags(action, compound.specialTags))
    .map((action) => action.id);
  if (specialActionIds.length === 0) {
    return [];
  }

  return specialActionIds.filter((specialActionId) =>
    getActionPipelinesForAction(def, specialActionId)
      .some((pipeline) => operationAllowsSpecialActivity(operationActionId, pipeline.accompanyingOps)));
};

const materializeCompoundMove = (
  rootMove: Move,
  specialActionId: Move['actionId'],
  compound: NonNullable<CompiledPlanRoot['compound']>,
): Move => ({
  ...rootMove,
  compound: {
    specialActivity: {
      actionId: specialActionId,
      params: {},
    },
    timing: compound.timing,
    ...(compound.interruptAfterStage === undefined ? {} : { insertAfterStage: compound.interruptAfterStage }),
  },
});

const availabilityFromClassification = (
  classification: ReturnType<typeof classifyDecisionContinuationForLegalMove>['classification'],
): CompoundAvailability => {
  switch (classification) {
    case 'satisfiable':
      return { kind: 'ready' };
    case 'explicitStochastic':
      return { kind: 'provisional', reason: 'depth-capped' };
    case 'unknown':
      return { kind: 'provisional', reason: 'partial-grant' };
    case 'unsatisfiable':
      return { kind: 'unavailable', reason: 'no-continuation' };
  }
};

export function probeCompoundAvailability(
  def: GameDef,
  state: GameState,
  seatId: SeatId,
  rootDecision: RootActionSelectionDecision,
  compound: NonNullable<CompiledPlanRoot['compound']>,
  runtime?: GameDefRuntime,
): CompoundAvailability {
  void seatId;
  const rootMove = rootDecision.move;
  if (rootMove === undefined) {
    return { kind: 'unavailable', reason: 'no-continuation' };
  }

  const grantableSpecialActionIds = findGrantableSpecialActionIds(def, rootDecision.actionId, compound);
  if (grantableSpecialActionIds.length === 0) {
    return { kind: 'unavailable', reason: 'no-grant-predicate' };
  }

  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  let sawProvisional: CompoundAvailability | undefined;
  for (const specialActionId of grantableSpecialActionIds) {
    const candidateMove = materializeCompoundMove(rootMove, asActionId(String(specialActionId)), compound);
    const availability = availabilityFromClassification(
      classifyDecisionContinuationForLegalMove(
        def,
        state,
        candidateMove,
        MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
        {
          discoverer: (move, discoverOptions) => legalChoicesDiscover(
            def,
            state,
            move,
            {
              chainCompoundSA: true,
              ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
                ? {}
                : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
            },
            resolvedRuntime,
          ),
        },
        resolvedRuntime,
      ).classification,
    );
    if (availability.kind === 'ready') {
      return availability;
    }
    if (availability.kind === 'provisional') {
      sawProvisional = availability;
    }
  }

  return sawProvisional ?? { kind: 'unavailable', reason: 'no-continuation' };
}
