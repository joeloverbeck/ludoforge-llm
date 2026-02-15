import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { resolveBindingTemplate } from './binding-template.js';
import { resolveChooseNCardinality } from './choose-n-cardinality.js';
import { composeDecisionId } from './decision-id.js';
import { applyEffect } from './effect-dispatch.js';
import type { EffectContext } from './effect-context.js';
import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { resolveEventEffectList } from './event-execution.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import {
  decideDiscoveryLegalChoicesPipelineViability,
  evaluateDiscoveryPipelinePredicateStatus,
} from './pipeline-viability-policy.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { buildAdjacencyGraph } from './spatial.js';
import { toChoiceIllegalReason } from './legality-outcome.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { resolveFreeOperationExecutionPlayer, resolveFreeOperationZoneFilter } from './turn-flow-eligibility.js';
import { isCardEventActionId } from './action-capabilities.js';
import { normalizeChoiceDomain, toChoiceComparableValue } from './value-membership.js';
import type {
  ActionDef,
  ChoicePendingRequest,
  ChoiceRequest,
  EffectAST,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  Rng,
} from './types.js';

const COMPLETE: ChoiceRequest = { kind: 'complete', complete: true };

export interface LegalChoicesOptions {
  readonly onDeferredPredicatesEvaluated?: (count: number) => void;
}

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

interface WalkContext {
  readonly evalCtx: EvalContext;
  readonly rng: Rng;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
}

interface WalkOutcome {
  readonly pending: ChoicePendingRequest | null;
  readonly wCtx: WalkContext;
}

const legalChoicesValidationError = (
  message: string,
  context?: Readonly<Record<string, unknown>>,
): Error => kernelRuntimeError('LEGAL_CHOICES_VALIDATION_FAILED', message, context);

const withBinding = (wCtx: WalkContext, name: string, value: unknown): WalkContext => ({
  evalCtx: {
    ...wCtx.evalCtx,
    bindings: { ...wCtx.evalCtx.bindings, [name]: value },
  },
  rng: wCtx.rng,
  moveParams: wCtx.moveParams,
});

const withStateAndRng = (wCtx: WalkContext, state: GameState, rng: Rng): WalkContext => ({
  evalCtx: {
    ...wCtx.evalCtx,
    state,
  },
  rng,
  moveParams: wCtx.moveParams,
});

const mergeStateAndRng = (outer: WalkContext, inner: WalkContext): WalkContext =>
  withStateAndRng(outer, inner.evalCtx.state, inner.rng);

const applyResolvedEffect = (effect: EffectAST, wCtx: WalkContext): WalkContext => {
  const effectCtx: EffectContext = {
    def: wCtx.evalCtx.def,
    adjacencyGraph: wCtx.evalCtx.adjacencyGraph,
    state: wCtx.evalCtx.state,
    rng: wCtx.rng,
    activePlayer: wCtx.evalCtx.activePlayer,
    actorPlayer: wCtx.evalCtx.actorPlayer,
    bindings: wCtx.evalCtx.bindings,
    moveParams: wCtx.moveParams,
    collector: wCtx.evalCtx.collector,
    ...(wCtx.evalCtx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: wCtx.evalCtx.runtimeTableIndex }),
    ...(wCtx.evalCtx.mapSpaces === undefined ? {} : { mapSpaces: wCtx.evalCtx.mapSpaces }),
  };
  const result = applyEffect(effect, effectCtx);
  return withStateAndRng(wCtx, result.state, result.rng);
};

function walkEffects(effects: readonly EffectAST[], initialCtx: WalkContext): WalkOutcome {
  let wCtx = initialCtx;
  for (const effect of effects) {
    const result = walkEffect(effect, wCtx);
    if (result.pending !== null) {
      return result;
    }
    wCtx = result.wCtx;
  }
  return { pending: null, wCtx };
}

function walkEffect(effect: EffectAST, wCtx: WalkContext): WalkOutcome {
  if ('chooseOne' in effect) {
    return walkChooseOne(effect, wCtx);
  }
  if ('chooseN' in effect) {
    return walkChooseN(effect, wCtx);
  }
  if ('if' in effect) {
    return walkIf(effect, wCtx);
  }
  if ('forEach' in effect) {
    return walkForEach(effect, wCtx);
  }
  if ('removeByPriority' in effect) {
    return walkRemoveByPriority(effect, wCtx);
  }
  if ('let' in effect) {
    return walkLet(effect, wCtx);
  }
  if ('rollRandom' in effect) {
    // Choice discovery should not execute stochastic branches while parameters are still being validated.
    return { pending: null, wCtx };
  }
  return { pending: null, wCtx: applyResolvedEffect(effect, wCtx) };
}

function walkChooseOne(
  effect: Extract<EffectAST, { readonly chooseOne: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const bind = resolveBindingTemplate(effect.chooseOne.bind, wCtx.evalCtx.bindings);
  const decisionId = composeDecisionId(effect.chooseOne.internalDecisionId, effect.chooseOne.bind, bind);
  const options = evalQuery(effect.chooseOne.options, wCtx.evalCtx);
  const asParamValues = normalizeChoiceDomain(options, (issue) => {
    throw legalChoicesValidationError(
      `legalChoices: chooseOne "${bind}" (${decisionId}) options domain item at index ${issue.index} is not move-param encodable`,
      {
        bind,
        decisionId,
        index: issue.index,
        actualType: issue.actualType,
        value: issue.value,
      },
    );
  }) as readonly MoveParamValue[];

  if (Object.prototype.hasOwnProperty.call(wCtx.moveParams, decisionId)) {
    const selected = wCtx.moveParams[decisionId];
    const selectedComparable = toChoiceComparableValue(selected);
    if (selectedComparable === null || !asParamValues.includes(selectedComparable)) {
      throw legalChoicesValidationError(
        `legalChoices: invalid selection for chooseOne "${bind}" (${decisionId}): ${JSON.stringify(selected)} is not in options domain (${options.length} options)`,
      );
    }
    return { pending: null, wCtx: withBinding(wCtx, bind, selectedComparable) };
  }

  return {
    pending: {
      kind: 'pending',
      complete: false,
      decisionId,
      name: bind,
      type: 'chooseOne',
      options: asParamValues,
    },
    wCtx,
  };
}

function walkChooseN(
  effect: Extract<EffectAST, { readonly chooseN: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const chooseN = effect.chooseN;
  const bind = resolveBindingTemplate(chooseN.bind, wCtx.evalCtx.bindings);
  const decisionId = composeDecisionId(chooseN.internalDecisionId, chooseN.bind, bind);
  const { minCardinality, maxCardinality } = resolveChooseNCardinality(chooseN, wCtx.evalCtx, (issue) => {
    if (issue.code === 'CHOOSE_N_MODE_INVALID') {
      throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" must use either exact n or range max/min cardinality`);
    }
    if (issue.code === 'CHOOSE_N_MIN_EVAL_INVALID') {
      throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" (${decisionId}) minimum cardinality must evaluate to a non-negative integer`);
    }
    if (issue.code === 'CHOOSE_N_MAX_EVAL_INVALID') {
      throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" (${decisionId}) maximum cardinality must evaluate to a non-negative integer`);
    }
    if (issue.code === 'CHOOSE_N_MIN_INVALID') {
      throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" (${decisionId}) minimum cardinality must be a non-negative integer`);
    }
    if (issue.code === 'CHOOSE_N_MAX_INVALID') {
      throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" (${decisionId}) maximum cardinality must be a non-negative integer`);
    }
    throw legalChoicesValidationError(`legalChoices: chooseN "${bind}" (${decisionId}) requires max >= min cardinality`);
  });

  const options = evalQuery(chooseN.options, wCtx.evalCtx);
  const asParamValues = normalizeChoiceDomain(options, (issue) => {
    throw legalChoicesValidationError(
      `legalChoices: chooseN "${bind}" (${decisionId}) options domain item at index ${issue.index} is not move-param encodable`,
      {
        bind,
        decisionId,
        index: issue.index,
        actualType: issue.actualType,
        value: issue.value,
      },
    );
  }) as readonly MoveParamValue[];
  const clampedMax = Math.min(maxCardinality, asParamValues.length);

  if (Object.prototype.hasOwnProperty.call(wCtx.moveParams, decisionId)) {
    const selectedValue = wCtx.moveParams[decisionId];
    if (!Array.isArray(selectedValue)) {
      throw legalChoicesValidationError(
        `legalChoices: chooseN "${bind}" (${decisionId}) expects array selection, got ${typeof selectedValue}`,
      );
    }
    if (selectedValue.length < minCardinality || selectedValue.length > clampedMax) {
      throw legalChoicesValidationError(
        `legalChoices: invalid cardinality for chooseN "${bind}" (${decisionId}): selected ${selectedValue.length}, expected [${minCardinality}, ${clampedMax}]`,
      );
    }
    const normalizedSelected: MoveParamValue[] = [];
    for (const item of selectedValue) {
      const comparable = toChoiceComparableValue(item);
      if (comparable === null || !asParamValues.includes(comparable)) {
        throw legalChoicesValidationError(
          `legalChoices: invalid selection for chooseN "${bind}" (${decisionId}): ${JSON.stringify(item)} is not in options domain`,
        );
      }
      normalizedSelected.push(comparable);
    }
    return { pending: null, wCtx: withBinding(wCtx, bind, normalizedSelected) };
  }

  return {
    pending: {
      kind: 'pending',
      complete: false,
      decisionId,
      name: bind,
      type: 'chooseN',
      options: asParamValues,
      min: minCardinality,
      max: clampedMax,
    },
    wCtx,
  };
}

function walkIf(
  effect: Extract<EffectAST, { readonly if: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const conditionResult = evalCondition(effect.if.when, wCtx.evalCtx);
  if (conditionResult) {
    return walkEffects(effect.if.then, wCtx);
  }
  if (effect.if.else !== undefined) {
    return walkEffects(effect.if.else, wCtx);
  }
  return { pending: null, wCtx };
}

function walkForEach(
  effect: Extract<EffectAST, { readonly forEach: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const items = evalQuery(effect.forEach.over, wCtx.evalCtx);
  let limit = 100;
  if (effect.forEach.limit !== undefined) {
    const limitValue = evalValue(effect.forEach.limit, wCtx.evalCtx);
    if (typeof limitValue === 'number' && Number.isSafeInteger(limitValue) && limitValue > 0) {
      limit = limitValue;
    }
  }
  const bounded = items.slice(0, limit);

  let currentCtx = wCtx;
  for (const item of bounded) {
    const iterCtx = withBinding(currentCtx, effect.forEach.bind, item);
    const result = walkEffects(effect.forEach.effects, iterCtx);
    if (result.pending !== null) {
      return result;
    }
    currentCtx = mergeStateAndRng(currentCtx, result.wCtx);
  }

  if (effect.forEach.countBind !== undefined && effect.forEach.in !== undefined) {
    const countCtx = withBinding(currentCtx, effect.forEach.countBind, bounded.length);
    const result = walkEffects(effect.forEach.in, countCtx);
    if (result.pending !== null) {
      return result;
    }
    currentCtx = mergeStateAndRng(currentCtx, result.wCtx);
  }

  return { pending: null, wCtx: currentCtx };
}

function walkLet(
  effect: Extract<EffectAST, { readonly let: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const evaluatedValue = evalValue(effect.let.value, wCtx.evalCtx);
  const nestedCtx = withBinding(wCtx, effect.let.bind, evaluatedValue);
  const nestedResult = walkEffects(effect.let.in, nestedCtx);
  if (nestedResult.pending !== null) {
    return nestedResult;
  }
  return { pending: null, wCtx: mergeStateAndRng(wCtx, nestedResult.wCtx) };
}

function walkRemoveByPriority(
  effect: Extract<EffectAST, { readonly removeByPriority: unknown }>,
  wCtx: WalkContext,
): WalkOutcome {
  const budgetValue = evalValue(effect.removeByPriority.budget, wCtx.evalCtx);
  const totalBudget = typeof budgetValue === 'number' && Number.isSafeInteger(budgetValue) && budgetValue > 0 ? budgetValue : 0;
  let remaining = totalBudget;
  const countBindings: Record<string, number> = {};

  for (const group of effect.removeByPriority.groups) {
    let removed = 0;
    if (remaining > 0) {
      const items = evalQuery(group.over, wCtx.evalCtx);
      removed = Math.min(items.length, remaining);
      remaining -= removed;
    }
    if (group.countBind !== undefined) {
      countBindings[group.countBind] = removed;
    }
  }

  if (effect.removeByPriority.in !== undefined) {
    const nestedCtx: WalkContext = {
      evalCtx: {
        ...wCtx.evalCtx,
        bindings: {
          ...wCtx.evalCtx.bindings,
          ...countBindings,
          ...(effect.removeByPriority.remainingBind === undefined ? {} : { [effect.removeByPriority.remainingBind]: remaining }),
        },
      },
      rng: wCtx.rng,
      moveParams: wCtx.moveParams,
    };
    const nestedResult = walkEffects(effect.removeByPriority.in, nestedCtx);
    if (nestedResult.pending !== null) {
      return nestedResult;
    }
    return { pending: null, wCtx: mergeStateAndRng(wCtx, nestedResult.wCtx) };
  }

  return { pending: null, wCtx };
}

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
  const evalCtx: EvalContext = preflight.evalCtx;
  const pipelineDispatch = preflight.pipelineDispatch;

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
    const eventEffects = isCardEventActionId(def, action.id)
      ? resolveEventEffectList(def, state, partialMove)
      : [];

    const wCtx: WalkContext = { evalCtx, rng: { state: state.rng }, moveParams: partialMove.params };
    const result = walkEffects([...resolutionEffects, ...eventEffects], wCtx);
    return result.pending ?? COMPLETE;
  }
  const eventEffects = isCardEventActionId(def, action.id)
    ? resolveEventEffectList(def, state, partialMove)
    : [];
  const wCtx: WalkContext = { evalCtx, rng: { state: state.rng }, moveParams: partialMove.params };
  const result = walkEffects([...action.effects, ...eventEffects], wCtx);
  return result.pending ?? COMPLETE;
}
