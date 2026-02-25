import { evalCondition } from './eval-condition.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { resolveDeclaredActionParamDomainOptions } from './declared-action-param-domain.js';
import type { EvalContext } from './eval-context.js';
import { isMoveDecisionSequenceSatisfiable } from './move-decision-sequence.js';
import {
  applyPendingFreeOperationVariants,
  applyTurnFlowWindowFilters,
  isMoveAllowedByTurnFlowOptionMatrix,
  resolveConstrainedSecondEligibleActionClasses,
} from './legal-moves-turn-order.js';
import { resolveTurnFlowActionClass } from './turn-flow-eligibility.js';
import { shouldEnumerateLegalMoveForOutcome } from './legality-outcome.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { decideLegalMovesPipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import { shouldDeferMissingBinding } from './missing-binding-policy.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { isActiveSeatEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { createCollector } from './execution-collector.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import { isCardEventAction } from './action-capabilities.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { kernelRuntimeError } from './runtime-error.js';
import { validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import type { ActionDef, GameDef, GameState, Move, MoveParamValue, RuntimeWarning } from './types.js';

export interface LegalMoveEnumerationOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
}

export interface LegalMoveEnumerationResult {
  readonly moves: readonly Move[];
  readonly warnings: readonly RuntimeWarning[];
}

interface MoveEnumerationState {
  readonly budgets: MoveEnumerationBudgets;
  readonly warnings: RuntimeWarning[];
  readonly moves: Move[];
  paramExpansions: number;
  templateBudgetExceeded: boolean;
  paramExpansionBudgetExceeded: boolean;
}

const emitEnumerationWarning = (state: MoveEnumerationState, warning: RuntimeWarning): void => {
  state.warnings.push(warning);
};

const tryPushTemplateMove = (state: MoveEnumerationState, move: Move, actionId: ActionDef['id']): boolean => {
  if (state.moves.length >= state.budgets.maxTemplates) {
    if (!state.templateBudgetExceeded) {
      state.templateBudgetExceeded = true;
      emitEnumerationWarning(state, {
        code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED',
        message: 'Legal move template budget reached; remaining templates were truncated deterministically.',
        context: {
          actionId: String(actionId),
          maxTemplates: state.budgets.maxTemplates,
        },
      });
    }
    return false;
  }
  state.moves.push(move);
  return true;
};

const tryPushOptionMatrixFilteredMove = (
  enumeration: MoveEnumerationState,
  def: GameDef,
  state: GameState,
  move: Move,
  action: ActionDef,
): boolean => {
  const constrainedClasses = resolveConstrainedSecondEligibleActionClasses(def, state);
  const variants: Move[] = [];
  const baseClass = resolveTurnFlowActionClass(def, move);
  if (constrainedClasses !== null && String(action.id) !== 'pass' && !isCardEventAction(action) && baseClass === null) {
    for (const actionClass of constrainedClasses) {
      if (actionClass === 'event' || actionClass === 'pass') {
        continue;
      }
      variants.push({
        ...move,
        actionClass,
      });
    }
  } else {
    variants.push(
      baseClass !== null && move.actionClass === undefined
        ? {
            ...move,
            actionClass: baseClass,
          }
        : move,
    );
  }

  for (const variant of variants) {
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, variant)) {
      continue;
    }
    if (!tryPushTemplateMove(enumeration, variant, action.id)) {
      return false;
    }
  }
  return true;
};

const consumeParamExpansionBudget = (state: MoveEnumerationState, actionId: ActionDef['id']): boolean => {
  state.paramExpansions += 1;
  if (state.paramExpansions <= state.budgets.maxParamExpansions) {
    return true;
  }
  if (!state.paramExpansionBudgetExceeded) {
    state.paramExpansionBudgetExceeded = true;
    emitEnumerationWarning(state, {
      code: 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED',
      message: 'Legal move parameter expansion budget reached; remaining expansions were truncated deterministically.',
      context: {
        actionId: String(actionId),
        maxParamExpansions: state.budgets.maxParamExpansions,
      },
    });
  }
  return false;
};

function makeEvalContext(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
  executionPlayer: GameState['activePlayer'],
  bindings: Readonly<Record<string, unknown>>,
): EvalContext {
  return {
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    runtimeTableIndex,
    collector: createCollector(),
  };
}

function enumerateParams(
  action: ActionDef,
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
  paramIndex: number,
  bindings: Readonly<Record<string, unknown>>,
  enumeration: MoveEnumerationState,
): void {
  if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
    return;
  }

  const resolveExecutionPlayerForBindings = (allowPendingBinding: boolean): GameState['activePlayer'] | null => {
    const resolution = resolveActionExecutor({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer: state.activePlayer,
      bindings,
      runtimeTableIndex,
    });
    if (resolution.kind === 'notApplicable') {
      return null;
    }
    if (resolution.kind === 'invalidSpec') {
      if (allowPendingBinding && shouldDeferMissingBinding(resolution.error, 'legalMoves.executorDuringParamEnumeration')) {
        return state.activePlayer;
      }
      throw selectorInvalidSpecError('legalMoves', 'executor', action, resolution.error);
    }
    return resolution.executionPlayer;
  };

  if (paramIndex >= action.params.length) {
    const executionPlayer = resolveExecutionPlayerForBindings(false);
    if (executionPlayer === null) {
      return;
    }
    const ctx = makeEvalContext(def, adjacencyGraph, runtimeTableIndex, state, executionPlayer, bindings);
    if (action.pre !== null && !evalCondition(action.pre, ctx)) {
      return;
    }

    const params = Object.fromEntries(
      action.params.map((param) => [param.name, bindings[param.name] as MoveParamValue]),
    );
    const move: Move = {
      actionId: action.id,
      params,
    };
    tryPushOptionMatrixFilteredMove(enumeration, def, state, move, action);
    return;
  }

  const param = action.params[paramIndex];
  if (param === undefined) {
    return;
  }

  const executionPlayer = resolveExecutionPlayerForBindings(true);
  if (executionPlayer === null) {
    return;
  }
  const ctx = makeEvalContext(def, adjacencyGraph, runtimeTableIndex, state, executionPlayer, bindings);
  const resolution = resolveDeclaredActionParamDomainOptions(param, ctx);
  if (resolution.invalidOption !== undefined) {
    throw kernelRuntimeError(
      'LEGAL_MOVES_VALIDATION_FAILED',
      `legalMoves: action param "${param.name}" domain option is not move-param encodable`,
      {
        actionId: action.id,
        param: param.name,
        value: resolution.invalidOption,
      },
    );
  }
  for (const value of resolution.options) {
    if (!consumeParamExpansionBudget(enumeration, action.id)) {
      return;
    }
    enumerateParams(
      action,
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state,
      paramIndex + 1,
      { ...bindings, [param.name]: value },
      enumeration,
    );
    if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
      return;
    }
  }
}

function enumerateCurrentEventMoves(
  action: ActionDef,
  def: GameDef,
  state: GameState,
  enumeration: MoveEnumerationState,
  runtime?: GameDefRuntime,
): void {
  if (enumeration.templateBudgetExceeded) {
    return;
  }
  if (!isCardEventAction(action)) {
    return;
  }

  const current = resolveCurrentEventCardState(def, state);
  if (current === null) {
    return;
  }

  const sides: Array<{ readonly side: 'unshaded' | 'shaded'; readonly branches: readonly { readonly id: string }[] | undefined }> = [];
  if (current.card.unshaded !== undefined) {
    sides.push({ side: 'unshaded', branches: current.card.unshaded.branches });
  }
  if (current.card.shaded !== undefined) {
    sides.push({ side: 'shaded', branches: current.card.shaded.branches });
  }

  const baseMoves: Move[] = [];
  for (const side of sides) {
    if (side.branches === undefined || side.branches.length === 0) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
        },
      });
      continue;
    }
    for (const branch of side.branches) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
          branch: branch.id,
        },
      });
    }
  }

  for (const move of baseMoves) {
    // Matrix filtering must happen before decision-sequence probing.
    // Some event branches reference decision bindings in their effects;
    // probing a move that is matrix-disallowed can raise false runtime errors.
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      continue;
    }

    try {
      if (
        !isMoveDecisionSequenceSatisfiable(def, state, move, {
          budgets: enumeration.budgets,
          onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
        }, runtime)
      ) {
        continue;
      }
    } catch (error) {
      if (shouldDeferMissingBinding(error, 'legalMoves.eventDecisionSequence')) {
        continue;
      }
      throw error;
    }
    if (!tryPushOptionMatrixFilteredMove(enumeration, def, state, move, action)) {
      return;
    }
  }
}

export const enumerateLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): LegalMoveEnumerationResult => {
  validateTurnFlowRuntimeStateInvariants(state);
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const warnings: RuntimeWarning[] = [];

  if (!isActiveSeatEligibleForTurnFlow(state)) {
    return { moves: [], warnings };
  }

  const enumeration: MoveEnumerationState = {
    budgets,
    warnings,
    moves: [],
    paramExpansions: 0,
    templateBudgetExceeded: false,
    paramExpansionBudgetExceeded: false,
  };
  const adjacencyGraph = runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);

  for (const action of def.actions) {
    if (enumeration.templateBudgetExceeded) {
      break;
    }
    const hasActionPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);
    const preflight = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph,
      decisionPlayer: state.activePlayer,
      bindings: buildMoveRuntimeBindings({ actionId: action.id, params: {} }),
      runtimeTableIndex,
      skipExecutorCheck: !hasActionPipeline,
      skipPipelineDispatch: !hasActionPipeline,
    });
    if (preflight.kind === 'notApplicable') {
      void shouldEnumerateLegalMoveForOutcome(preflight.reason);
      continue;
    }
    if (preflight.kind === 'invalidSpec') {
      throw selectorInvalidSpecError(
        'legalMoves',
        preflight.selector,
        action,
        preflight.error,
        preflight.selectorContractViolations,
      );
    }

    const beforeEventCount = enumeration.moves.length;
    enumerateCurrentEventMoves(action, def, state, enumeration, runtime);
    if (enumeration.moves.length > beforeEventCount) {
      continue;
    }

    if (!hasActionPipeline) {
      enumerateParams(action, def, adjacencyGraph, runtimeTableIndex, state, 0, {}, enumeration);
      continue;
    }

    if (preflight.pipelineDispatch.kind === 'matched') {
      const pipeline = preflight.pipelineDispatch.profile;
      const status = evaluatePipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
        includeCostValidation: pipeline.atomicity === 'atomic',
      });
      const viabilityDecision = decideLegalMovesPipelineViability(status);
      if (viabilityDecision.kind === 'excludeTemplate') {
        if (viabilityDecision.outcome === 'pipelineLegalityFailed') {
          if (!shouldEnumerateLegalMoveForOutcome(viabilityDecision.outcome)) {
            continue;
          }
        } else {
          continue;
        }
      }

      if (
        !isMoveDecisionSequenceSatisfiable(
          def,
          state,
          { actionId: action.id, params: {} },
          {
            budgets: enumeration.budgets,
            onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
          },
          runtime,
        )
      ) {
        continue;
      }

      tryPushOptionMatrixFilteredMove(enumeration, def, state, { actionId: action.id, params: {} }, action);
      continue;
    }
  }

  const windowFilteredMoves = applyTurnFlowWindowFilters(def, state, enumeration.moves);
  const finalMoves = applyPendingFreeOperationVariants(def, state, windowFilteredMoves, {
    budgets: enumeration.budgets,
    onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
  });
  return { moves: finalMoves, warnings };
};

export const legalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): readonly Move[] => enumerateLegalMoves(def, state, options, runtime).moves;
