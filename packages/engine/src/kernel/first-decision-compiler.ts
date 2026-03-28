import type { ActionId } from './branded.js';
import type { ReadContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { EFFECT_KIND_TAG, type ActionPipelineDef, type ConditionAST, type EffectAST, type GameDef, type OptionsQuery } from './types.js';

export interface FirstDecisionNode {
  readonly kind: 'chooseOne' | 'chooseN';
  readonly node: EffectAST;
  readonly path: readonly number[];
  readonly guardConditions: readonly ConditionAST[];
  readonly insideForEach: boolean;
  readonly forEachQuery?: OptionsQuery;
}

export interface FirstDecisionCheckResult {
  readonly admissible: boolean;
}

export interface FirstDecisionDomainResult {
  readonly compilable: boolean;
  readonly check?: (ctx: ReadContext) => FirstDecisionCheckResult;
  readonly description?: string;
}

export interface FirstDecisionRuntimeCompilation {
  readonly byActionId: ReadonlyMap<ActionId, FirstDecisionDomainResult>;
  readonly byPipelineProfileId: ReadonlyMap<string, FirstDecisionDomainResult>;
}

interface WalkContext {
  readonly path: readonly number[];
  readonly guardConditions: readonly ConditionAST[];
  readonly forEachQuery?: OptionsQuery;
}

const ROOT_WALK_CONTEXT: WalkContext = Object.freeze({
  path: [],
  guardConditions: [],
});

const withPath = (
  context: WalkContext,
  tag: number,
): WalkContext => ({
  ...context,
  path: [...context.path, tag],
});

const withGuardCondition = (
  context: WalkContext,
  condition: ConditionAST,
): WalkContext => ({
  ...context,
  guardConditions: [...context.guardConditions, condition],
});

const withForEachQuery = (
  context: WalkContext,
  query: OptionsQuery,
): WalkContext => ({
  ...context,
  forEachQuery: query,
});

const buildFirstDecisionNode = (
  effect: Extract<EffectAST, { readonly _k: 15 | 16 }>,
  context: WalkContext,
): FirstDecisionNode => ({
  kind: effect._k === EFFECT_KIND_TAG.chooseOne ? 'chooseOne' : 'chooseN',
  node: effect,
  path: context.path,
  guardConditions: context.guardConditions,
  insideForEach: context.forEachQuery !== undefined,
  ...(context.forEachQuery === undefined ? {} : { forEachQuery: context.forEachQuery }),
});

const findFirstDecisionNodeInternal = (
  effects: readonly EffectAST[],
  context: WalkContext,
): FirstDecisionNode | null => {
  for (const effect of effects) {
    switch (effect._k) {
      case EFFECT_KIND_TAG.chooseOne:
      case EFFECT_KIND_TAG.chooseN:
        return buildFirstDecisionNode(effect, context);
      case EFFECT_KIND_TAG.if: {
        const nestedContext = withPath(context, effect._k);
        const thenResult = findFirstDecisionNodeInternal(
          effect.if.then,
          withGuardCondition(nestedContext, effect.if.when),
        );
        if (thenResult !== null) {
          return thenResult;
        }
        if (effect.if.else !== undefined) {
          const elseResult = findFirstDecisionNodeInternal(
            effect.if.else,
            withGuardCondition(nestedContext, { op: 'not', arg: effect.if.when }),
          );
          if (elseResult !== null) {
            return elseResult;
          }
        }
        break;
      }
      case EFFECT_KIND_TAG.forEach: {
        const loopContext = withPath(context, effect._k);
        const bodyResult = findFirstDecisionNodeInternal(
          effect.forEach.effects,
          withForEachQuery(loopContext, effect.forEach.over),
        );
        if (bodyResult !== null) {
          return bodyResult;
        }
        if (effect.forEach.in !== undefined) {
          const continuationResult = findFirstDecisionNodeInternal(effect.forEach.in, loopContext);
          if (continuationResult !== null) {
            return continuationResult;
          }
        }
        break;
      }
      case EFFECT_KIND_TAG.let: {
        const nestedResult = findFirstDecisionNodeInternal(effect.let.in, withPath(context, effect._k));
        if (nestedResult !== null) {
          return nestedResult;
        }
        break;
      }
      case EFFECT_KIND_TAG.reduce: {
        const nestedResult = findFirstDecisionNodeInternal(effect.reduce.in, withPath(context, effect._k));
        if (nestedResult !== null) {
          return nestedResult;
        }
        break;
      }
      case EFFECT_KIND_TAG.rollRandom: {
        const nestedResult = findFirstDecisionNodeInternal(effect.rollRandom.in, withPath(context, effect._k));
        if (nestedResult !== null) {
          return nestedResult;
        }
        break;
      }
      case EFFECT_KIND_TAG.evaluateSubset: {
        const nestedContext = withPath(context, effect._k);
        const computeResult = findFirstDecisionNodeInternal(effect.evaluateSubset.compute, nestedContext);
        if (computeResult !== null) {
          return computeResult;
        }
        const inResult = findFirstDecisionNodeInternal(effect.evaluateSubset.in, nestedContext);
        if (inResult !== null) {
          return inResult;
        }
        break;
      }
      case EFFECT_KIND_TAG.removeByPriority:
        if (effect.removeByPriority.in !== undefined) {
          const nestedResult = findFirstDecisionNodeInternal(effect.removeByPriority.in, withPath(context, effect._k));
          if (nestedResult !== null) {
            return nestedResult;
          }
        }
        break;
      default:
        break;
    }
  }

  return null;
};

const countDecisionNodesInternal = (effects: readonly EffectAST[]): number => {
  let count = 0;

  for (const effect of effects) {
    switch (effect._k) {
      case EFFECT_KIND_TAG.chooseOne:
      case EFFECT_KIND_TAG.chooseN:
        count += 1;
        break;
      case EFFECT_KIND_TAG.if:
        count += countDecisionNodesInternal(effect.if.then);
        if (effect.if.else !== undefined) {
          count += countDecisionNodesInternal(effect.if.else);
        }
        break;
      case EFFECT_KIND_TAG.forEach:
        count += countDecisionNodesInternal(effect.forEach.effects);
        if (effect.forEach.in !== undefined) {
          count += countDecisionNodesInternal(effect.forEach.in);
        }
        break;
      case EFFECT_KIND_TAG.let:
        count += countDecisionNodesInternal(effect.let.in);
        break;
      case EFFECT_KIND_TAG.reduce:
        count += countDecisionNodesInternal(effect.reduce.in);
        break;
      case EFFECT_KIND_TAG.rollRandom:
        count += countDecisionNodesInternal(effect.rollRandom.in);
        break;
      case EFFECT_KIND_TAG.evaluateSubset:
        count += countDecisionNodesInternal(effect.evaluateSubset.compute);
        count += countDecisionNodesInternal(effect.evaluateSubset.in);
        break;
      case EFFECT_KIND_TAG.removeByPriority:
        if (effect.removeByPriority.in !== undefined) {
          count += countDecisionNodesInternal(effect.removeByPriority.in);
        }
        break;
      default:
        break;
    }
  }

  return count;
};

export const findFirstDecisionNode = (
  effects: readonly EffectAST[],
): FirstDecisionNode | null => findFirstDecisionNodeInternal(effects, ROOT_WALK_CONTEXT);

export const countDecisionNodes = (
  effects: readonly EffectAST[],
): number => countDecisionNodesInternal(effects);

const getDecisionOptionsQuery = (
  node: FirstDecisionNode,
): OptionsQuery => {
  if (node.kind === 'chooseOne') {
    return (node.node as Extract<EffectAST, { readonly _k: 15 }>).chooseOne.options;
  }
  return (node.node as Extract<EffectAST, { readonly _k: 16 }>).chooseN.options;
};

const compileDirectFirstDecisionNode = (
  node: FirstDecisionNode,
): FirstDecisionDomainResult => {
  const options = getDecisionOptionsQuery(node);
  return {
    compilable: true,
    description: `direct:${options.query}`,
    check: (ctx) => ({
      admissible: evalQuery(options, ctx).length > 0,
    }),
  };
};

export const compileFirstDecisionDomain = (
  effects: readonly EffectAST[],
): FirstDecisionDomainResult => {
  const firstDecision = findFirstDecisionNode(effects);
  if (firstDecision === null) {
    return {
      compilable: false,
      description: 'noDecision',
    };
  }

  if (firstDecision.guardConditions.length > 0) {
    return {
      compilable: false,
      description: 'guardedFirstDecision',
    };
  }

  if (firstDecision.insideForEach) {
    return {
      compilable: false,
      description: 'loopScopedFirstDecision',
    };
  }

  return compileDirectFirstDecisionNode(firstDecision);
};

export const compilePipelineFirstDecisionDomain = (
  pipeline: ActionPipelineDef,
): FirstDecisionDomainResult => {
  for (const stage of pipeline.stages) {
    const compiled = compileFirstDecisionDomain(stage.effects);
    if (compiled.compilable) {
      return {
        ...compiled,
        description: stage.stage === undefined
          ? `pipeline:${pipeline.id}:${compiled.description ?? 'compiled'}`
          : `pipeline:${pipeline.id}:${stage.stage}:${compiled.description ?? 'compiled'}`,
      };
    }

    if (findFirstDecisionNode(stage.effects) !== null) {
      return {
        compilable: false,
        description: stage.stage === undefined
          ? `pipeline:${pipeline.id}:unsupportedStageFirstDecision`
          : `pipeline:${pipeline.id}:${stage.stage}:unsupportedStageFirstDecision`,
      };
    }
  }

  return {
    compilable: false,
    description: `pipeline:${pipeline.id}:noDecision`,
  };
};

export const compileGameDefFirstDecisionDomains = (
  def: GameDef,
): FirstDecisionRuntimeCompilation => {
  const byActionId = new Map<ActionId, FirstDecisionDomainResult>();
  for (const action of def.actions) {
    byActionId.set(action.id, compileFirstDecisionDomain(action.effects));
  }

  const byPipelineProfileId = new Map<string, FirstDecisionDomainResult>();
  for (const pipeline of def.actionPipelines ?? []) {
    byPipelineProfileId.set(pipeline.id, compilePipelineFirstDecisionDomain(pipeline));
  }

  return {
    byActionId,
    byPipelineProfileId,
  };
};
