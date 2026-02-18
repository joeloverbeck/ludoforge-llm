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
import {
  classifyDecisionSequenceSatisfiability,
  type DecisionSequenceSatisfiability,
} from './decision-sequence-satisfiability.js';
import { buildAdjacencyGraph } from './spatial.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { resolveFreeOperationExecutionPlayer, resolveFreeOperationZoneFilter } from './turn-flow-eligibility.js';
import { isCardEventActionId } from './action-capabilities.js';
import type {
  ActionDef,
  ChoiceOption,
  ChoicePendingRequest,
  ChoiceRequest,
  EffectAST,
  GameDef,
  GameState,
  Move,
} from './types.js';

const COMPLETE: ChoiceRequest = { kind: 'complete', complete: true };
const MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024;

export interface LegalChoicesRuntimeOptions {
  readonly onDeferredPredicatesEvaluated?: (count: number) => void;
  readonly onProbeContextPrepared?: () => void;
}

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

interface LegalChoicesPreparedContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly action: ActionDef;
  readonly adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>;
  readonly runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>;
}

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

const optionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const countCombinationsCapped = (n: number, k: number, cap: number): number => {
  if (k < 0 || k > n) {
    return 0;
  }

  const normalizedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= normalizedK; i += 1) {
    result = (result * (n - normalizedK + i)) / i;
    if (result > cap) {
      return cap;
    }
  }

  return Math.floor(result);
};

const enumerateCombinations = (
  n: number,
  k: number,
  visit: (indices: readonly number[]) => void,
): void => {
  const current: number[] = [];

  const walk = (start: number, remaining: number): void => {
    if (remaining === 0) {
      visit(current);
      return;
    }

    const upper = n - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(index);
      walk(index + 1, remaining - 1);
      current.pop();
    }
  };

  walk(0, k);
};

const mapChooseNOptions = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingRequest,
): readonly ChoiceOption[] => {
  const uniqueOptions: Move['params'][string][] = [];
  const uniqueByKey = new Map<string, Move['params'][string]>();
  for (const option of request.options) {
    const key = optionKey(option.value);
    if (uniqueByKey.has(key)) {
      continue;
    }
    uniqueByKey.set(key, option.value);
    uniqueOptions.push(option.value);
  }

  const min = request.min ?? 0;
  const max = Math.min(request.max ?? uniqueOptions.length, uniqueOptions.length);
  if (min > max) {
    return request.options.map((option) => ({
      value: option.value,
      legality: 'illegal',
      illegalReason: null,
    }));
  }

  let totalCombinations = 0;
  for (let size = min; size <= max; size += 1) {
    totalCombinations += countCombinationsCapped(
      uniqueOptions.length,
      size,
      MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS - totalCombinations + 1,
    );
    if (totalCombinations > MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS) {
      return request.options.map((option) => ({
        value: option.value,
        legality: 'unknown',
        illegalReason: null,
      }));
    }
  }

  const optionLegalityByKey = new Map<string, { legality: ChoiceOption['legality']; illegalReason: ChoiceOption['illegalReason'] }>();
  for (const option of uniqueOptions) {
    optionLegalityByKey.set(optionKey(option), { legality: 'illegal', illegalReason: null });
  }

  for (let size = min; size <= max; size += 1) {
    if (size === 0) {
      continue;
    }

    enumerateCombinations(uniqueOptions.length, size, (indices) => {
      const selected = indices.map((index) => uniqueOptions[index]!);
      const selectedChoice = selected as Move['params'][string];
      const probed = evaluateProbeMove(
        {
          ...partialMove,
          params: {
            ...partialMove.params,
            [request.decisionId]: selectedChoice,
          },
        },
      );

      const classification = probed.kind === 'pending'
        ? classifyProbeMoveSatisfiability(
            {
              ...partialMove,
              params: {
                ...partialMove.params,
                [request.decisionId]: selectedChoice,
              },
            },
          )
        : null;

      for (const option of selected) {
        const key = optionKey(option);
        const status = optionLegalityByKey.get(key);
        if (status === undefined || status.legality === 'legal') {
          continue;
        }

        if (classification === 'unknown') {
          status.legality = 'unknown';
          status.illegalReason = null;
          continue;
        }

        if (probed.kind === 'illegal' || classification === 'unsatisfiable') {
          if (status.illegalReason === null && probed.kind === 'illegal') {
            status.illegalReason = probed.reason;
          }
          continue;
        }

        status.legality = 'legal';
        status.illegalReason = null;
      }
    });
  }

  return request.options.map((option) => {
    const status = optionLegalityByKey.get(optionKey(option.value));
    if (status === undefined) {
      return {
        value: option.value,
        legality: 'unknown',
        illegalReason: null,
      };
    }

    return {
      value: option.value,
      legality: status.legality,
      illegalReason: status.legality === 'legal' ? null : status.illegalReason,
    };
  });
};

const mapOptionsForPendingChoice = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingRequest,
): readonly ChoiceOption[] => {
  if (request.type === 'chooseN') {
    return mapChooseNOptions(evaluateProbeMove, classifyProbeMoveSatisfiability, partialMove, request);
  }

  return request.options.map((option) => {
    const probed = evaluateProbeMove(
      {
        ...partialMove,
        params: {
          ...partialMove.params,
          [request.decisionId]: option.value,
        },
      },
    );

    const illegalReason = probed.kind === 'illegal' ? probed.reason : null;
    const classification = probed.kind === 'pending'
      ? classifyProbeMoveSatisfiability(
          {
            ...partialMove,
            params: {
              ...partialMove.params,
              [request.decisionId]: option.value,
            },
          },
        )
      : null;
    return {
      value: option.value,
      legality: illegalReason !== null
        ? 'illegal'
        : classification === 'unsatisfiable'
          ? 'illegal'
          : classification === 'unknown'
            ? 'unknown'
            : 'legal',
      illegalReason: illegalReason ?? null,
    };
  });
};

const legalChoicesWithPreparedContext = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesRuntimeOptions,
): ChoiceRequest => {
  const { def, state, action, adjacencyGraph, runtimeTableIndex } = context;
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
    const request = executeDiscoveryEffects([...resolutionEffects, ...eventEffects], evalCtx, partialMove);
    if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
      return request;
    }

    return {
      ...request,
      options: mapOptionsForPendingChoice(
        (probeMove) => legalChoicesWithPreparedContext(context, probeMove, false),
        (probeMove) =>
          classifyDecisionSequenceSatisfiability(
            probeMove,
            (candidateMove, discoverOptions) =>
              legalChoicesWithPreparedContext(context, candidateMove, false, {
                onDeferredPredicatesEvaluated: (count) => {
                  options?.onDeferredPredicatesEvaluated?.(count);
                  discoverOptions?.onDeferredPredicatesEvaluated?.(count);
                },
              }),
          ).classification,
        partialMove,
        request,
      ),
    };
  }

  const request = executeDiscoveryEffects([...action.effects, ...eventEffects], evalCtx, partialMove);
  if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
    return request;
  }

  return {
    ...request,
    options: mapOptionsForPendingChoice(
      (probeMove) => legalChoicesWithPreparedContext(context, probeMove, false),
      (probeMove) =>
        classifyDecisionSequenceSatisfiability(
          probeMove,
          (candidateMove, discoverOptions) =>
            legalChoicesWithPreparedContext(context, candidateMove, false, {
              onDeferredPredicatesEvaluated: (count) => {
                options?.onDeferredPredicatesEvaluated?.(count);
                discoverOptions?.onDeferredPredicatesEvaluated?.(count);
              },
            }),
        ).classification,
      partialMove,
      request,
    ),
  };
};

export function legalChoicesDiscover(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesRuntimeOptions,
): ChoiceRequest {
  const action = findAction(def, partialMove.actionId);
  if (action === undefined) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_UNKNOWN_ACTION',
      `legalChoicesDiscover: unknown action id: ${String(partialMove.actionId)}`,
      { actionId: partialMove.actionId },
    );
  }

  const context: LegalChoicesPreparedContext = {
    def,
    state,
    action,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
  };
  options?.onProbeContextPrepared?.();
  return legalChoicesWithPreparedContext(context, partialMove, false, options);
}

export function legalChoicesEvaluate(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesRuntimeOptions,
): ChoiceRequest {
  const action = findAction(def, partialMove.actionId);
  if (action === undefined) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_UNKNOWN_ACTION',
      `legalChoicesEvaluate: unknown action id: ${String(partialMove.actionId)}`,
      { actionId: partialMove.actionId },
    );
  }

  const context: LegalChoicesPreparedContext = {
    def,
    state,
    action,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
  };
  options?.onProbeContextPrepared?.();
  return legalChoicesWithPreparedContext(context, partialMove, true, options);
}
