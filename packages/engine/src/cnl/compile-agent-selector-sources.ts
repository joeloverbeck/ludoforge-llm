import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  MAX_SELECTOR_PRODUCT_PAIRS,
  MAX_SELECTOR_SUBSET_BEAM_WIDTH,
  type CandidateParamRef,
  type CompiledAgentCandidateParamDef,
  type CompiledAgentDependencyRefs,
  type CompiledPolicySelector,
  type SelectorCostClass,
  type SelectorId,
  type SelectorSource,
} from '../kernel/types.js';
import type { GameSpecSelectorSource, GameSpecSelectorSubsetSource } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  isSelectorProductPairCapExceeded,
  normalizeSelectorCollection,
} from './compile-agent-selectors.js';

export type LoweredSelectorSource = {
  readonly source: SelectorSource;
  readonly dependencies: CompiledAgentDependencyRefs;
  readonly costClass: SelectorCostClass;
};

export interface LowerSelectorSourceInput {
  readonly source: GameSpecSelectorSource | undefined;
  readonly path: string;
  readonly diagnostics: Diagnostic[];
  readonly candidateParamDefs: Readonly<Record<string, CompiledAgentCandidateParamDef>>;
  readonly compileSelector: (selectorId: string) => CompiledPolicySelector | null;
}

export function lowerSelectorSource(input: LowerSelectorSourceInput): LoweredSelectorSource | null {
  const { source, path, diagnostics } = input;
  if (source === undefined || source === null || typeof source !== 'object' || Array.isArray(source)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
      path,
      severity: 'error',
      message: 'Selector source must be a supported finite source object.',
      suggestion: 'Use source.collection, source.kind: product, routePairs, subset, microturnOptions, or candidateParams.',
    });
    return null;
  }
  if (source.kind === 'product') {
    return lowerProductSource(source, input);
  }
  if (source.kind === 'routePairs') {
    return lowerRoutePairsSource(source, input);
  }
  if (source.kind === 'subset') {
    return lowerSubsetSource(source, input);
  }
  if (source.kind === 'microturnOptions') {
    return { source: { kind: 'microturnOptions' }, dependencies: emptyDependencies(), costClass: 'microturn' };
  }
  if (source.kind === 'candidateParams') {
    if (
      typeof source.param !== 'string'
      || source.param.length === 0
      || input.candidateParamDefs[source.param] === undefined
    ) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
        path: `${path}.param`,
        severity: 'error',
        message: `Selector candidateParams source references unknown candidate param "${String(source.param)}".`,
        suggestion: 'Reference a declared doc.agents.candidateParams entry.',
      });
      return null;
    }
    return {
      source: { kind: 'candidateParams', param: source.param as CandidateParamRef },
      dependencies: emptyDependencies(),
      costClass: 'candidate',
    };
  }
  const collection = normalizeSelectorCollection(source.collection, `${path}.collection`, diagnostics);
  if (collection === null) {
    return null;
  }
  const sourceRecord = source as Readonly<Record<string, unknown>>;
  const key = sourceRecord.key;
  const keyFrom = key === null || typeof key !== 'object'
    ? undefined
    : (key as Readonly<Record<string, unknown>>).from;
  if (key !== undefined && (typeof keyFrom !== 'string' || keyFrom.length === 0)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_BINDING_TYPE_MISMATCH,
      path: `${path}.key.from`,
      severity: 'error',
      message: 'Selector source key.from must be a non-empty string when source.key is declared.',
      suggestion: 'Use key: { from: <candidate field> } or omit source.key.',
    });
    return null;
  }
  return {
    source: {
      kind: 'collection',
      collection,
      ...(source.key?.from === undefined ? {} : { key: { from: source.key.from } }),
    },
    dependencies: emptyDependencies(),
    costClass: 'state',
  };
}

function lowerProductSource(
  source: Extract<GameSpecSelectorSource, { readonly kind: 'product' }>,
  input: LowerSelectorSourceInput,
): LoweredSelectorSource | null {
  const left = normalizeSelectorCollection(source.left, `${input.path}.left`, input.diagnostics);
  const right = normalizeSelectorCollection(source.right, `${input.path}.right`, input.diagnostics);
  if (source.maxPairs === undefined) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MISSING_MAXPAIRS,
      path: `${input.path}.maxPairs`,
      severity: 'error',
      message: 'Product selector source requires maxPairs.',
      suggestion: `Set maxPairs to a positive integer <= ${MAX_SELECTOR_PRODUCT_PAIRS}.`,
    });
    return null;
  }
  if (isSelectorProductPairCapExceeded(source.maxPairs)) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MAXPAIRS_EXCEEDS_CAP,
      path: `${input.path}.maxPairs`,
      severity: 'error',
      message: `Product selector maxPairs must be a positive integer <= ${MAX_SELECTOR_PRODUCT_PAIRS}.`,
      suggestion: `Reduce maxPairs to ${MAX_SELECTOR_PRODUCT_PAIRS} or less.`,
    });
    return null;
  }
  return left === null || right === null
    ? null
    : {
        source: { kind: 'product', left, right, maxPairs: source.maxPairs },
        dependencies: emptyDependencies(),
        costClass: 'state',
      };
}

function lowerRoutePairsSource(
  source: Extract<GameSpecSelectorSource, { readonly kind: 'routePairs' }>,
  input: LowerSelectorSourceInput,
): LoweredSelectorSource | null {
  const origin = compileSelectorRefForSource(source.origin, `${input.path}.origin`, input);
  const destination = compileSelectorRefForSource(source.destination, `${input.path}.destination`, input);
  if (source.maxPairs === undefined) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MISSING_MAXPAIRS,
      path: `${input.path}.maxPairs`,
      severity: 'error',
      message: 'routePairs selector source requires maxPairs.',
      suggestion: `Set maxPairs to a positive integer <= ${MAX_SELECTOR_PRODUCT_PAIRS}.`,
    });
    return null;
  }
  if (isSelectorProductPairCapExceeded(source.maxPairs)) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MAXPAIRS_EXCEEDS_CAP,
      path: `${input.path}.maxPairs`,
      severity: 'error',
      message: `routePairs selector maxPairs must be a positive integer <= ${MAX_SELECTOR_PRODUCT_PAIRS}.`,
      suggestion: `Reduce maxPairs to ${MAX_SELECTOR_PRODUCT_PAIRS} or less.`,
    });
    return null;
  }
  if (origin === null || destination === null) {
    return null;
  }
  return {
    source: {
      kind: 'routePairs',
      originSelectorId: source.origin as SelectorId,
      destinationSelectorId: source.destination as SelectorId,
      maxPairs: source.maxPairs,
    },
    dependencies: mergeDependencies([
      selectorDependency(source.origin),
      selectorDependency(source.destination),
      origin.dependencies,
      destination.dependencies,
    ]),
    costClass: maxSelectorCostClass(origin.costClass, destination.costClass),
  };
}

function lowerSubsetSource(
  source: Extract<GameSpecSelectorSource, { readonly kind: 'subset' }>,
  input: LowerSelectorSourceInput,
): LoweredSelectorSource | null {
  const lowered = lowerSelectorSubsetSource(source.of, `${input.path}.of`, input);
  if (source.min === undefined || source.max === undefined || source.beamWidth === undefined) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path: input.path,
      severity: 'error',
      message: 'subset selector source requires min, max, and beamWidth.',
      suggestion: `Set min/max to non-negative integers and beamWidth to a positive integer <= ${MAX_SELECTOR_SUBSET_BEAM_WIDTH}.`,
    });
    return null;
  }
  if (!isNonnegativeSafeInteger(source.min) || !isNonnegativeSafeInteger(source.max) || source.min > source.max) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path: input.path,
      severity: 'error',
      message: 'subset selector min/max must be non-negative safe integers with min <= max.',
      suggestion: 'Use bounded subset sizes such as min: 1, max: 3.',
    });
    return null;
  }
  if (!isPositiveSafeInteger(source.beamWidth) || source.beamWidth > MAX_SELECTOR_SUBSET_BEAM_WIDTH) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path: `${input.path}.beamWidth`,
      severity: 'error',
      message: `subset selector beamWidth must be a positive integer <= ${MAX_SELECTOR_SUBSET_BEAM_WIDTH}.`,
      suggestion: `Reduce beamWidth to ${MAX_SELECTOR_SUBSET_BEAM_WIDTH} or less.`,
    });
    return null;
  }
  if (lowered === null) {
    return null;
  }
  return {
    source: {
      kind: 'subset',
      of: lowered.source,
      min: source.min,
      max: source.max,
      beamWidth: source.beamWidth,
    },
    dependencies: lowered.dependencies,
    costClass: lowered.costClass,
  };
}

function lowerSelectorSubsetSource(
  source: GameSpecSelectorSubsetSource,
  path: string,
  input: LowerSelectorSourceInput,
): {
  readonly source: Extract<SelectorSource, { readonly kind: 'subset' }>['of'];
  readonly dependencies: CompiledAgentDependencyRefs;
  readonly costClass: SelectorCostClass;
} | null {
  if (source === undefined || source === null || typeof source !== 'object' || Array.isArray(source)) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
      path,
      severity: 'error',
      message: 'subset selector source.of must be a collection or selector reference.',
      suggestion: 'Use of: { collection: { kind: zones } } or of: { kind: selector, selector: selectorId }.',
    });
    return null;
  }
  if (source.kind === 'selector') {
    const selector = compileSelectorRefForSource(source.selector, `${path}.selector`, input);
    if (selector === null) {
      return null;
    }
    return {
      source: { kind: 'selector', selectorId: source.selector as SelectorId },
      dependencies: mergeDependencies([selectorDependency(source.selector), selector.dependencies]),
      costClass: selector.costClass,
    };
  }
  const collection = normalizeSelectorCollection(source.collection, `${path}.collection`, input.diagnostics);
  if (collection === null) {
    return null;
  }
  return {
    source: { kind: 'collection', collection },
    dependencies: emptyDependencies(),
    costClass: 'state',
  };
}

function compileSelectorRefForSource(
  selectorId: unknown,
  path: string,
  input: LowerSelectorSourceInput,
): CompiledPolicySelector | null {
  if (typeof selectorId !== 'string' || selectorId.length === 0) {
    input.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_REF_UNKNOWN,
      path,
      severity: 'error',
      message: 'Selector source references must be non-empty selector ids.',
      suggestion: 'Reference a declared doc.agents.library.selectors entry.',
    });
    return null;
  }
  return input.compileSelector(selectorId);
}

function emptyDependencies(): CompiledAgentDependencyRefs {
  return {
    parameters: [],
    stateFeatures: [],
    candidateFeatures: [],
    aggregates: [],
    strategicConditions: [],
  };
}

function selectorDependency(selectorId: string): CompiledAgentDependencyRefs {
  return {
    ...emptyDependencies(),
    selectors: [selectorId],
  };
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
    ...(selectors.length === 0 ? {} : { selectors }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function maxSelectorCostClass(left: SelectorCostClass, right: SelectorCostClass): SelectorCostClass {
  return selectorCostClassLeq(left, right) ? right : left;
}

function selectorCostClassLeq(left: SelectorCostClass, right: SelectorCostClass): boolean {
  return selectorCostClassOrder(left) <= selectorCostClassOrder(right);
}

function selectorCostClassOrder(value: SelectorCostClass): number {
  switch (value) {
    case 'state': return 0;
    case 'candidate': return 1;
    case 'microturn': return 2;
    case 'preview': return 3;
    case 'auditOnly': return 4;
  }
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
