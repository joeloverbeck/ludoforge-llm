import { tryCompileCondition, type CompiledConditionPredicate } from './condition-compiler.js';
import type { ActionPipelineDef, ConditionAST, GameDef } from './types.js';

type CompiledConditionAst = Exclude<ConditionAST, boolean>;

export type CompiledPipelinePredicateCache = ReadonlyMap<CompiledConditionAst, CompiledConditionPredicate>;

const EMPTY_COMPILED_PIPELINE_PREDICATES: CompiledPipelinePredicateCache = new Map();

const compiledPredicateCache = new WeakMap<readonly ActionPipelineDef[], CompiledPipelinePredicateCache>();

const isCompilableConditionAst = (
  condition: ConditionAST | null | undefined,
): condition is CompiledConditionAst => condition != null && typeof condition !== 'boolean';

const addCompiledCondition = (
  cache: Map<CompiledConditionAst, CompiledConditionPredicate>,
  condition: ConditionAST | null | undefined,
): void => {
  if (!isCompilableConditionAst(condition)) {
    return;
  }

  const compiled = tryCompileCondition(condition);
  if (compiled !== null) {
    cache.set(condition, compiled);
  }
};

const buildCompiledPipelinePredicates = (
  pipelines: readonly ActionPipelineDef[],
): CompiledPipelinePredicateCache => {
  const compiledPredicates = new Map<CompiledConditionAst, CompiledConditionPredicate>();

  for (const pipeline of pipelines) {
    addCompiledCondition(compiledPredicates, pipeline.legality);
    addCompiledCondition(compiledPredicates, pipeline.costValidation);
    for (const stage of pipeline.stages) {
      addCompiledCondition(compiledPredicates, stage.legality);
      addCompiledCondition(compiledPredicates, stage.costValidation);
    }
  }

  return compiledPredicates;
};

export const getCompiledPipelinePredicates = (
  def: GameDef,
): CompiledPipelinePredicateCache => {
  const pipelines = def.actionPipelines;
  if (pipelines === undefined || pipelines.length === 0) {
    return EMPTY_COMPILED_PIPELINE_PREDICATES;
  }

  let cached = compiledPredicateCache.get(pipelines);
  if (cached === undefined) {
    cached = buildCompiledPipelinePredicates(pipelines);
    compiledPredicateCache.set(pipelines, cached);
  }
  return cached;
};
