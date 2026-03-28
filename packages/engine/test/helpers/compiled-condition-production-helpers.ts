import * as assert from 'node:assert/strict';

import { assertNoErrors } from './diagnostic-helpers.js';
import { compileProductionSpec } from './production-spec-helpers.js';
import {
  applyMove,
  assertValidatedGameDef,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  createEvalContext,
  createEvalRuntimeResources,
  createGameDefRuntime,
  getCompiledPipelinePredicates,
  initialState,
  legalMoves,
  type CompiledConditionPredicate,
  type ConditionAST,
  type GameDef,
  type GameState,
  type ReadContext,
} from '../../src/kernel/index.js';

type ScalarBindingValue = string | number | boolean;

export interface PredicateEntry {
  readonly scope: 'pipeline' | 'stage';
  readonly profileId: string;
  readonly predicate: 'legality' | 'costValidation';
  readonly stageIndex?: number;
  readonly condition: ConditionAST | null | undefined;
}

export interface PredicateCoverageSummary {
  readonly total: number;
  readonly booleanLiteral: number;
  readonly compiled: number;
  readonly fallback: number;
}

export interface PredicateSample {
  readonly entry: PredicateEntry & { readonly condition: Exclude<ConditionAST, boolean> };
  readonly state: GameState;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly ctx: ReadContext;
  readonly compiled: CompiledConditionPredicate;
}

const STATE_CORPUS_SEEDS = [11, 23, 37, 53] as const;
const STATE_CORPUS_STEPS_PER_SEED = 4;
const DEFAULT_BINDING_VALUES: readonly ScalarBindingValue[] = [true, false, 0, 1, 'sample'];

export const compileFitlValidatedGameDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    assert.fail('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

export const collectActionPredicateEntries = (def: GameDef): readonly PredicateEntry[] => {
  const entries: PredicateEntry[] = [];
  for (const pipeline of def.actionPipelines ?? []) {
    entries.push({
      scope: 'pipeline',
      profileId: pipeline.id,
      predicate: 'legality',
      condition: pipeline.legality,
    });
    entries.push({
      scope: 'pipeline',
      profileId: pipeline.id,
      predicate: 'costValidation',
      condition: pipeline.costValidation,
    });
    for (const [stageIndex, stage] of pipeline.stages.entries()) {
      entries.push({
        scope: 'stage',
        profileId: pipeline.id,
        stageIndex,
        predicate: 'legality',
        condition: stage.legality,
      });
      entries.push({
        scope: 'stage',
        profileId: pipeline.id,
        stageIndex,
        predicate: 'costValidation',
        condition: stage.costValidation,
      });
    }
  }
  return entries;
};

export const summarizePredicateCoverage = (def: GameDef): PredicateCoverageSummary => {
  const compiledPredicates = getCompiledPipelinePredicates(def);
  let total = 0;
  let booleanLiteral = 0;

  for (const entry of collectActionPredicateEntries(def)) {
    if (entry.condition == null) {
      continue;
    }
    total += 1;
    if (typeof entry.condition === 'boolean') {
      booleanLiteral += 1;
    }
  }

  return {
    total,
    booleanLiteral,
    compiled: compiledPredicates.size,
    fallback: total - booleanLiteral - compiledPredicates.size,
  };
};

export const buildDeterministicFitlStateCorpus = (def: GameDef): readonly GameState[] => {
  const runtime = createGameDefRuntime(def);
  const states: GameState[] = [];

  for (const seed of STATE_CORPUS_SEEDS) {
    let current = initialState(def, seed, undefined, undefined, runtime).state;
    states.push(current);

    for (let step = 0; step < STATE_CORPUS_STEPS_PER_SEED; step += 1) {
      const moves = legalMoves(def, current, undefined, runtime);
      if (moves.length === 0) {
        break;
      }
      const startIndex = (seed + step) % moves.length;
      let advanced = false;
      for (let offset = 0; offset < moves.length; offset += 1) {
        const selected = moves[(startIndex + offset) % moves.length];
        if (selected === undefined) {
          continue;
        }
        try {
          current = applyMove(def, current, selected, undefined, runtime).state;
          states.push(current);
          advanced = true;
          break;
        } catch {
          continue;
        }
      }
      if (!advanced) {
        break;
      }
    }
  }

  return states;
};

const materializeBindingName = (
  name: string,
  placeholderBindings: Readonly<Record<string, unknown>>,
): string => name.replaceAll(/\{([^}]+)\}/g, (_match, placeholder: string) => String(placeholderBindings[placeholder] ?? `${placeholder}-sample`));

const dedupeBindingVariants = (
  variants: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] => {
  const seen = new Set<string>();
  const deduped: Readonly<Record<string, unknown>>[] = [];
  for (const variant of variants) {
    const key = JSON.stringify(
      Object.entries(variant)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(variant);
  }
  return deduped;
};

const collectBindingTemplates = (
  condition: ConditionAST,
  templates: Set<string>,
  literals: Set<ScalarBindingValue>,
): void => {
  if (typeof condition === 'boolean') {
    literals.add(condition);
    return;
  }

  switch (condition.op) {
    case 'and':
    case 'or':
      for (const arg of condition.args) {
        collectBindingTemplates(arg, templates, literals);
      }
      return;
    case 'not':
      collectBindingTemplates(condition.arg, templates, literals);
      return;
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      collectValueExprMetadata(condition.left, templates, literals);
      collectValueExprMetadata(condition.right, templates, literals);
      return;
    case 'in':
      collectValueExprMetadata(condition.item, templates, literals);
      collectValueExprMetadata(condition.set, templates, literals);
      return;
    case 'connected':
      if (condition.via !== undefined) {
        collectBindingTemplates(condition.via, templates, literals);
      }
      return;
    case 'zonePropIncludes':
      collectValueExprMetadata(condition.value, templates, literals);
      return;
    case 'markerStateAllowed':
      collectValueExprMetadata(condition.state, templates, literals);
      return;
    case 'markerShiftAllowed':
      collectValueExprMetadata(condition.delta, templates, literals);
      return;
    default:
      return;
  }
};

const collectValueExprMetadata = (
  value: unknown,
  templates: Set<string>,
  literals: Set<ScalarBindingValue>,
): void => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    literals.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectValueExprMetadata(item, templates, literals);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  const tagged = value as { readonly _t?: number; readonly ref?: string };
  if (tagged._t === 2 && tagged.ref === 'binding' && 'name' in tagged && typeof tagged.name === 'string') {
    templates.add(tagged.name);
    return;
  }

  if ('var' in tagged) {
    const scopedVar = tagged.var;
    if (
      scopedVar !== null &&
      typeof scopedVar === 'object' &&
      'ref' in scopedVar &&
      scopedVar.ref === 'binding' &&
      'name' in scopedVar &&
      typeof scopedVar.name === 'string'
    ) {
      templates.add(scopedVar.name);
    }
  }

  if (tagged._t === 3 && 'concat' in tagged && Array.isArray(tagged.concat)) {
    for (const item of tagged.concat) {
      collectValueExprMetadata(item, templates, literals);
    }
    return;
  }

  if (tagged._t === 4 && 'if' in tagged && tagged.if !== null && typeof tagged.if === 'object') {
    const conditionalExpr = tagged.if as { readonly when: ConditionAST; readonly then: unknown; readonly else: unknown };
    collectBindingTemplates(conditionalExpr.when, templates, literals);
    collectValueExprMetadata(conditionalExpr.then, templates, literals);
    collectValueExprMetadata(conditionalExpr.else, templates, literals);
    return;
  }

  if (tagged._t === 5 && 'aggregate' in tagged && tagged.aggregate !== null && typeof tagged.aggregate === 'object') {
    const aggregate = tagged.aggregate as { readonly query?: unknown; readonly valueExpr?: unknown };
    if (aggregate.query !== undefined) {
      collectQueryMetadata(aggregate.query, templates, literals);
    }
    if (aggregate.valueExpr !== undefined) {
      collectValueExprMetadata(aggregate.valueExpr, templates, literals);
    }
    return;
  }

  if (tagged._t === 6) {
    if ('left' in tagged) {
      collectValueExprMetadata(tagged.left, templates, literals);
    }
    if ('right' in tagged) {
      collectValueExprMetadata(tagged.right, templates, literals);
    }
  }
};

const collectQueryMetadata = (
  query: unknown,
  templates: Set<string>,
  literals: Set<ScalarBindingValue>,
): void => {
  if (query === null || typeof query !== 'object') {
    return;
  }

  const record = query as Record<string, unknown>;
  if (record.query === 'tokensInZone' && record.zone !== undefined && typeof record.zone === 'object' && record.zone !== null) {
    const zone = record.zone as Record<string, unknown>;
    if (zone.zoneExpr !== undefined) {
      collectValueExprMetadata(zone.zoneExpr, templates, literals);
    }
  }

  if (record.query === 'concat' && Array.isArray(record.sources)) {
    for (const source of record.sources) {
      collectQueryMetadata(source, templates, literals);
    }
  }

  if (record.query === 'prioritized' && Array.isArray(record.tiers)) {
    for (const tier of record.tiers) {
      collectQueryMetadata(tier, templates, literals);
    }
  }

  if (record.query === 'tokenZones' && record.source !== undefined) {
    collectQueryMetadata(record.source, templates, literals);
  }

  if (record.query === 'nextInOrderByCondition') {
    if (record.source !== undefined) {
      collectQueryMetadata(record.source, templates, literals);
    }
    if (record.from !== undefined) {
      collectValueExprMetadata(record.from, templates, literals);
    }
    if (record.where !== undefined) {
      collectBindingTemplates(record.where as ConditionAST, templates, literals);
    }
  }

  if (record.query === 'intsInRange' || record.query === 'intsInVarRange') {
    for (const key of ['min', 'max', 'step', 'maxResults'] as const) {
      if (record[key] !== undefined) {
        collectValueExprMetadata(record[key], templates, literals);
      }
    }
    if (Array.isArray(record.alwaysInclude)) {
      for (const item of record.alwaysInclude) {
        collectValueExprMetadata(item, templates, literals);
      }
    }
  }
};

export const buildBindingVariants = (
  condition: ConditionAST,
): readonly Readonly<Record<string, unknown>>[] => {
  if (typeof condition === 'boolean') {
    return [{}];
  }

  const templates = new Set<string>();
  const literals = new Set<ScalarBindingValue>();
  collectBindingTemplates(condition, templates, literals);
  if (templates.size === 0) {
    return [{}];
  }

  const placeholderNames = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(/\{([^}]+)\}/g)) {
      const placeholder = match[1];
      if (placeholder !== undefined) {
        placeholderNames.add(placeholder);
      }
    }
  }

  const placeholderBindings = Object.fromEntries(
    Array.from(placeholderNames, (name) => [name, `${name}-sample`]),
  );
  const materializedBindingNames = Array.from(templates, (template) => materializeBindingName(template, placeholderBindings));
  const candidateValues = Array.from(
    new Set<ScalarBindingValue>([
      ...DEFAULT_BINDING_VALUES,
      ...Array.from(literals),
    ]),
  ).slice(0, 6);

  const variants: Readonly<Record<string, unknown>>[] = [
    {},
    placeholderBindings,
  ];

  for (const bindingName of materializedBindingNames) {
    variants.push({
      ...placeholderBindings,
      [bindingName]: candidateValues[0] ?? true,
    });
  }

  for (const value of candidateValues) {
    variants.push({
      ...placeholderBindings,
      ...Object.fromEntries(materializedBindingNames.map((bindingName) => [bindingName, value])),
    });
  }

  return dedupeBindingVariants(variants);
};

export const buildCompiledPredicateSamples = (
  def: GameDef,
  states: readonly GameState[],
): readonly PredicateSample[] => {
  const compiledPredicates = getCompiledPipelinePredicates(def);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const resources = createEvalRuntimeResources();
  const samples: PredicateSample[] = [];

  for (const entry of collectActionPredicateEntries(def)) {
    if (entry.condition == null || typeof entry.condition === 'boolean') {
      continue;
    }
    const compiled = compiledPredicates.get(entry.condition);
    if (compiled === undefined) {
      continue;
    }

    for (const state of states) {
      for (const bindings of buildBindingVariants(entry.condition)) {
        samples.push({
          entry: entry as PredicateEntry & { readonly condition: Exclude<ConditionAST, boolean> },
          state,
          bindings,
          compiled,
          ctx: createEvalContext({
            def,
            adjacencyGraph,
            state,
            activePlayer: state.activePlayer,
            actorPlayer: state.activePlayer,
            bindings,
            resources,
            runtimeTableIndex,
          }),
        });
      }
    }
  }

  return samples;
};
