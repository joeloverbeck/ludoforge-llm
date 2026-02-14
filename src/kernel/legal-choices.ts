import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { resolveActionPipelineDispatch } from './apply-move-pipeline.js';
import { createCollector } from './execution-collector.js';
import { buildAdjacencyGraph } from './spatial.js';
import type {
  ActionDef,
  ChoicePendingRequest,
  ChoiceRequest,
  EffectAST,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
} from './types.js';

const COMPLETE: ChoiceRequest = { kind: 'complete', complete: true };

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const valuesMatch = (candidate: unknown, selected: unknown): boolean => {
  if (Object.is(candidate, selected)) {
    return true;
  }
  if (
    typeof selected === 'string' &&
    typeof candidate === 'object' &&
    candidate !== null &&
    'id' in candidate &&
    typeof candidate.id === 'string'
  ) {
    return candidate.id === selected;
  }
  return false;
};

const isInDomain = (selected: unknown, domain: readonly unknown[]): boolean =>
  domain.some((candidate) => valuesMatch(candidate, selected));

interface WalkContext {
  readonly evalCtx: EvalContext;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
}

const withBinding = (wCtx: WalkContext, name: string, value: unknown): WalkContext => ({
  evalCtx: {
    ...wCtx.evalCtx,
    bindings: { ...wCtx.evalCtx.bindings, [name]: value },
  },
  moveParams: wCtx.moveParams,
});

function walkEffects(effects: readonly EffectAST[], wCtx: WalkContext): ChoicePendingRequest | null {
  for (const effect of effects) {
    const result = walkEffect(effect, wCtx);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

function walkEffect(effect: EffectAST, wCtx: WalkContext): ChoicePendingRequest | null {
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
    return null;
  }
  // All side-effect types: skip
  return null;
}

function walkChooseOne(
  effect: Extract<EffectAST, { readonly chooseOne: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
  const bind = effect.chooseOne.bind;
  const options = evalQuery(effect.chooseOne.options, wCtx.evalCtx);
  const asParamValues = options.map((o) =>
    typeof o === 'object' && o !== null && 'id' in o ? (o.id as MoveParamValue) : (o as MoveParamValue),
  );

  if (Object.prototype.hasOwnProperty.call(wCtx.moveParams, bind)) {
    const selected = wCtx.moveParams[bind];
    if (!isInDomain(selected, options)) {
      throw new Error(
        `legalChoices: invalid selection for chooseOne "${bind}": ${JSON.stringify(selected)} is not in options domain (${options.length} options)`,
      );
    }
    return null;
  }

  return {
    kind: 'pending',
    complete: false,
    name: bind,
    type: 'chooseOne',
    options: asParamValues,
  };
}

function walkChooseN(
  effect: Extract<EffectAST, { readonly chooseN: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
  const chooseN = effect.chooseN;
  const bind = chooseN.bind;
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;

  let minCardinality: number;
  let maxCardinality: number;

  if (hasN) {
    minCardinality = chooseN.n;
    maxCardinality = chooseN.n;
  } else if (hasMax) {
    minCardinality = hasMin ? chooseN.min : 0;
    maxCardinality = chooseN.max;
  } else {
    throw new Error(`legalChoices: chooseN "${bind}" must use either exact n or range max/min cardinality`);
  }

  const options = evalQuery(chooseN.options, wCtx.evalCtx);
  const asParamValues = options.map((o) =>
    typeof o === 'object' && o !== null && 'id' in o ? (o.id as MoveParamValue) : (o as MoveParamValue),
  );
  const clampedMax = Math.min(maxCardinality, asParamValues.length);

  if (Object.prototype.hasOwnProperty.call(wCtx.moveParams, bind)) {
    const selectedValue = wCtx.moveParams[bind];
    if (!Array.isArray(selectedValue)) {
      throw new Error(
        `legalChoices: chooseN "${bind}" expects array selection, got ${typeof selectedValue}`,
      );
    }
    if (selectedValue.length < minCardinality || selectedValue.length > clampedMax) {
      throw new Error(
        `legalChoices: invalid cardinality for chooseN "${bind}": selected ${selectedValue.length}, expected [${minCardinality}, ${clampedMax}]`,
      );
    }
    for (const item of selectedValue) {
      if (!isInDomain(item, options)) {
        throw new Error(
          `legalChoices: invalid selection for chooseN "${bind}": ${JSON.stringify(item)} is not in options domain`,
        );
      }
    }
    return null;
  }

  return {
    kind: 'pending',
    complete: false,
    name: bind,
    type: 'chooseN',
    options: asParamValues,
    min: minCardinality,
    max: clampedMax,
  };
}

function walkIf(
  effect: Extract<EffectAST, { readonly if: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
  const conditionResult = evalCondition(effect.if.when, wCtx.evalCtx);
  if (conditionResult) {
    return walkEffects(effect.if.then, wCtx);
  }
  if (effect.if.else !== undefined) {
    return walkEffects(effect.if.else, wCtx);
  }
  return null;
}

function walkForEach(
  effect: Extract<EffectAST, { readonly forEach: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
  const items = evalQuery(effect.forEach.over, wCtx.evalCtx);
  let limit = 100;
  if (effect.forEach.limit !== undefined) {
    const limitValue = evalValue(effect.forEach.limit, wCtx.evalCtx);
    if (typeof limitValue === 'number' && Number.isSafeInteger(limitValue) && limitValue > 0) {
      limit = limitValue;
    }
  }
  const bounded = items.slice(0, limit);

  for (const item of bounded) {
    const iterCtx = withBinding(wCtx, effect.forEach.bind, item);
    const result = walkEffects(effect.forEach.effects, iterCtx);
    if (result !== null) {
      return result;
    }
  }

  if (effect.forEach.countBind !== undefined && effect.forEach.in !== undefined) {
    const countCtx = withBinding(wCtx, effect.forEach.countBind, bounded.length);
    const result = walkEffects(effect.forEach.in, countCtx);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

function walkLet(
  effect: Extract<EffectAST, { readonly let: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
  const evaluatedValue = evalValue(effect.let.value, wCtx.evalCtx);
  const nestedCtx = withBinding(wCtx, effect.let.bind, evaluatedValue);
  return walkEffects(effect.let.in, nestedCtx);
}

function walkRemoveByPriority(
  effect: Extract<EffectAST, { readonly removeByPriority: unknown }>,
  wCtx: WalkContext,
): ChoicePendingRequest | null {
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
      moveParams: wCtx.moveParams,
    };
    return walkEffects(effect.removeByPriority.in, nestedCtx);
  }

  return null;
}

export function legalChoices(def: GameDef, state: GameState, partialMove: Move): ChoiceRequest {
  const action = findAction(def, partialMove.actionId);
  if (action === undefined) {
    throw new Error(`legalChoices: unknown action id: ${String(partialMove.actionId)}`);
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings: Record<string, unknown> = {
    ...partialMove.params,
    __freeOperation: partialMove.freeOperation ?? false,
    __actionClass: partialMove.actionClass ?? 'operation',
  };

  const evalCtx: EvalContext = {
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: baseBindings,
    collector: createCollector(),
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  };

  const pipelineDispatch = resolveActionPipelineDispatch(def, action, evalCtx);

  if (pipelineDispatch.kind === 'matched') {
    const pipeline = pipelineDispatch.profile;
    if (pipeline.legality !== null) {
      if (!evalCondition(pipeline.legality, evalCtx)) {
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      }
    }

    const resolutionEffects: readonly EffectAST[] =
      pipeline.stages.length > 0
        ? pipeline.stages.flatMap((stage) => stage.effects)
        : action.effects;

    const wCtx: WalkContext = { evalCtx, moveParams: partialMove.params };
    const result = walkEffects(resolutionEffects, wCtx);
    return result ?? COMPLETE;
  }
  if (pipelineDispatch.kind === 'configuredNoMatch') {
    return { kind: 'illegal', complete: false, reason: 'pipelineNotApplicable' };
  }

  const wCtx: WalkContext = { evalCtx, moveParams: partialMove.params };
  const result = walkEffects(action.effects, wCtx);
  return result ?? COMPLETE;
}
