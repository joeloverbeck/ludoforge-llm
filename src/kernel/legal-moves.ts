import { evalCondition } from './eval-condition.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { isMoveDecisionSequenceSatisfiable, resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { applyPendingFreeOperationVariants, applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { shouldEnumerateLegalMoveForOutcome } from './legality-outcome.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { decideLegalMovesPipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { isEvalErrorCode } from './eval-error.js';
import { isActiveFactionEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { createCollector } from './execution-collector.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import { isCardEventAction } from './action-capabilities.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
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
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
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
      if (allowPendingBinding && isEvalErrorCode(resolution.error, 'MISSING_BINDING')) {
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
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      return;
    }
    tryPushTemplateMove(enumeration, move, action.id);
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
  const domainValues = evalQuery(param.domain, ctx);
  for (const value of domainValues) {
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
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      continue;
    }
    const completion = resolveMoveDecisionSequence(def, state, move, {
      budgets: enumeration.budgets,
      onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
    });
    if (!completion.complete) {
      continue;
    }
    if (!tryPushTemplateMove(enumeration, completion.move, action.id)) {
      return;
    }
  }
}

export const enumerateLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
): LegalMoveEnumerationResult => {
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const warnings: RuntimeWarning[] = [];

  if (!isActiveFactionEligibleForTurnFlow(state)) {
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
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);

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
      bindings: {},
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
    enumerateCurrentEventMoves(action, def, state, enumeration);
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
        )
      ) {
        continue;
      }

      tryPushTemplateMove(enumeration, { actionId: action.id, params: {} }, action.id);
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
): readonly Move[] => enumerateLegalMoves(def, state, options).moves;
