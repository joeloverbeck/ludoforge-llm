import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { applyEffects } from './effects.js';
import type { EffectContext } from './effect-context.js';
import type { EvalContext } from './eval-context.js';
import { resolveEventEffectList } from './event-execution.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import {
  decideDiscoveryLegalChoicesPipelineViability,
  evaluateDiscoveryPipelinePredicateStatus,
} from './pipeline-viability-policy.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { toChoiceIllegalReason } from './legality-outcome.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { resolveFreeOperationExecutionPlayer, resolveFreeOperationZoneFilter } from './turn-flow-eligibility.js';
import { isCardEventActionId } from './action-capabilities.js';
import type {
  ActionDef,
  ChoiceRequest,
  EffectAST,
  GameDef,
  GameState,
  Move,
} from './types.js';

const COMPLETE: ChoiceRequest = { kind: 'complete', complete: true };

export interface LegalChoicesOptions {
  readonly onDeferredPredicatesEvaluated?: (count: number) => void;
}

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const executeDiscoveryEffects = (
  effects: readonly EffectAST[],
  evalCtx: EvalContext,
  move: Move,
): ChoiceRequest => {
  const effectCtx: EffectContext = {
    def: evalCtx.def,
    adjacencyGraph: evalCtx.adjacencyGraph,
    state: evalCtx.state,
    rng: { state: evalCtx.state.rng },
    activePlayer: evalCtx.activePlayer,
    actorPlayer: evalCtx.actorPlayer,
    bindings: evalCtx.bindings,
    moveParams: move.params,
    collector: evalCtx.collector,
    traceContext: { eventContext: 'actionEffect', actionId: String(move.actionId), effectPathRoot: 'legalChoices.effects' },
    effectPath: '',
    mode: 'discovery',
    ...(evalCtx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: evalCtx.runtimeTableIndex }),
    ...(evalCtx.mapSpaces === undefined ? {} : { mapSpaces: evalCtx.mapSpaces }),
    ...(evalCtx.freeOperationZoneFilter === undefined ? {} : { freeOperationZoneFilter: evalCtx.freeOperationZoneFilter }),
    ...(evalCtx.freeOperationZoneFilterDiagnostics === undefined
      ? {}
      : { freeOperationZoneFilterDiagnostics: evalCtx.freeOperationZoneFilterDiagnostics }),
    ...(evalCtx.maxQueryResults === undefined ? {} : { maxQueryResults: evalCtx.maxQueryResults }),
  };
  const result = applyEffects(effects, effectCtx);
  return result.pendingChoice ?? COMPLETE;
};

export function legalChoices(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesOptions,
): ChoiceRequest {
  const action = findAction(def, partialMove.actionId);
  if (action === undefined) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_UNKNOWN_ACTION',
      `legalChoices: unknown action id: ${String(partialMove.actionId)}`,
      { actionId: partialMove.actionId },
    );
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const baseBindings: Record<string, unknown> = {
    ...buildMoveRuntimeBindings(partialMove),
  };
  const freeOperationZoneFilter = partialMove.freeOperation === true
    ? resolveFreeOperationZoneFilter(def, state, partialMove)
    : undefined;
  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: baseBindings,
    runtimeTableIndex,
    ...(partialMove.freeOperation === true
      ? { executionPlayerOverride: resolveFreeOperationExecutionPlayer(def, state, partialMove) }
      : {}),
    ...(freeOperationZoneFilter === undefined
      ? {}
      : {
          freeOperationZoneFilter,
          freeOperationZoneFilterDiagnostics: {
            source: 'legalChoices',
            actionId: String(partialMove.actionId),
            moveParams: partialMove.params,
          },
        }),
  });
  if (preflight.kind === 'notApplicable') {
    return { kind: 'illegal', complete: false, reason: toChoiceIllegalReason(preflight.reason) };
  }
  if (preflight.kind === 'invalidSpec') {
    throw selectorInvalidSpecError(
      'legalChoices',
      preflight.selector,
      action,
      preflight.error,
      preflight.selectorContractViolations,
    );
  }
  const evalCtx = preflight.evalCtx;
  const pipelineDispatch = preflight.pipelineDispatch;
  const eventEffects = isCardEventActionId(def, action.id)
    ? resolveEventEffectList(def, state, partialMove)
    : [];

  if (pipelineDispatch.kind === 'matched') {
    const pipeline = pipelineDispatch.profile;
    const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, evalCtx, {
      includeCostValidation: partialMove.freeOperation !== true,
    });
    const deferredCount = (status.legality === 'deferred' ? 1 : 0) + (status.costValidation === 'deferred' ? 1 : 0);
    if (deferredCount > 0) {
      options?.onDeferredPredicatesEvaluated?.(deferredCount);
    }
    const viabilityDecision = decideDiscoveryLegalChoicesPipelineViability(status);
    if (viabilityDecision.kind === 'illegalChoice') {
      return { kind: 'illegal', complete: false, reason: toChoiceIllegalReason(viabilityDecision.outcome) };
    }
    const resolutionEffects: readonly EffectAST[] =
      pipeline.stages.length > 0
        ? pipeline.stages.flatMap((stage) => stage.effects)
        : action.effects;
    return executeDiscoveryEffects([...resolutionEffects, ...eventEffects], evalCtx, partialMove);
  }

  return executeDiscoveryEffects([...action.effects, ...eventEffects], evalCtx, partialMove);
}
