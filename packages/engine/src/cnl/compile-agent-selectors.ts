import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyCostClass,
  AgentPolicyValueType,
  CollectionRef,
  CompiledAgentPolicyRef,
  ResultSpec,
  SelectorCostClass,
  SelectorSource,
} from '../kernel/types.js';
import type { GameSpecSelectorDef } from './game-spec-doc.js';
import { MAX_SELECTOR_PRODUCT_PAIRS, MAX_SELECTOR_RESULT_ITEMS } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { PolicyExprAnalysis } from '../agents/policy-expr.js';

const SELECTOR_COST_CLASS_ORDER: Record<SelectorCostClass, number> = {
  state: 0,
  candidate: 1,
  microturn: 2,
  preview: 3,
  auditOnly: 4,
};

export function normalizeSelectorScopes(
  scopes: readonly string[] | undefined,
  path: string,
  diagnostics: Diagnostic[],
): readonly ('move' | 'microturn')[] | null {
  if (scopes === undefined) {
    return ['move'];
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_EMPTY,
      path,
      severity: 'error',
      message: 'Selector scopes must contain at least one scope.',
      suggestion: 'Use scopes: [move] or scopes: [microturn].',
    });
    return null;
  }
  const lowered: ('move' | 'microturn')[] = [];
  for (const scope of scopes) {
    if (scope !== 'move' && scope !== 'microturn') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_INVALID,
        path,
        severity: 'error',
        message: `Selector scope must be move or microturn, got ${JSON.stringify(scope)}.`,
        suggestion: 'Use only move or microturn selector scopes.',
      });
      return null;
    }
    lowered.push(scope);
  }
  return lowered;
}

export function normalizeSelectorCollection(
  collection: unknown,
  path: string,
  diagnostics: Diagnostic[],
): CollectionRef | null {
  if (collection === null || typeof collection !== 'object' || Array.isArray(collection)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
      path,
      severity: 'error',
      message: 'Selector collection source must be an object with a supported kind.',
      suggestion: 'Use collection: { kind: zones }, tokens, cards, players, or authoredFinite.',
    });
    return null;
  }
  const value = collection as Readonly<Record<string, unknown>>;
  switch (value.kind) {
    case 'zones':
      return { kind: 'zones' };
    case 'tokens':
      return { kind: 'tokens', ...(typeof value.tokenType === 'string' ? { tokenType: value.tokenType } : {}) };
    case 'cards':
      return { kind: 'cards', ...(typeof value.deck === 'string' ? { deck: value.deck } : {}) };
    case 'players':
      return { kind: 'players' };
    case 'authoredFinite':
      if (typeof value.collectionId === 'string' && value.collectionId.length > 0) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_NOT_FINITE,
          path: `${path}.collectionId`,
          severity: 'error',
          message: `authoredFinite selector collection "${value.collectionId}" is not backed by a registered finite collection.`,
          suggestion: 'Use a built-in finite selector collection until authored finite collection registration lands.',
        });
        return null;
      }
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
        path: `${path}.collectionId`,
        severity: 'error',
        message: 'authoredFinite selector source requires collectionId.',
        suggestion: 'Set collectionId to a declared finite game-authored collection id.',
      });
      return null;
    default:
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
        path: `${path}.kind`,
        severity: 'error',
        message: `Unknown selector collection kind ${JSON.stringify(value.kind)}.`,
        suggestion: 'Use zones, tokens, cards, players, or authoredFinite.',
      });
      return null;
  }
}

export function normalizeSelectorResult(
  result: GameSpecSelectorDef['result'] | undefined,
  path: string,
  diagnostics: Diagnostic[],
): ResultSpec | null {
  if (result === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path,
      severity: 'error',
      message: 'Selector result is required.',
      suggestion: `Set result.maxItems <= ${MAX_SELECTOR_RESULT_ITEMS}, result.order, and result.onEmpty.`,
    });
    return null;
  }
  if (!isPositiveSafeInteger(result.maxItems) || result.maxItems > MAX_SELECTOR_RESULT_ITEMS) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path: `${path}.maxItems`,
      severity: 'error',
      message: `Selector result.maxItems must be a positive integer <= ${MAX_SELECTOR_RESULT_ITEMS}.`,
      suggestion: `Set result.maxItems to ${MAX_SELECTOR_RESULT_ITEMS} or less.`,
    });
    return null;
  }
  if (result.onEmpty !== 'noContribution' && result.onEmpty !== 'traceAndNoContribution' && result.onEmpty !== 'demote') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_ONEMPTY_MISSING,
      path: `${path}.onEmpty`,
      severity: 'error',
      message: 'Selector result.onEmpty must be noContribution, traceAndNoContribution, or demote.',
      suggestion: 'Declare result.onEmpty explicitly.',
    });
    return null;
  }
  const order = result.order ?? [];
  const valid = new Set(['qualityDesc', 'qualityAsc', 'stableKeyAsc', 'stableKeyDesc']);
  if (order.length === 0 || !order.every((entry) => valid.has(entry))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COMPONENT_NONDETERMINISTIC_ORDER,
      path: `${path}.order`,
      severity: 'error',
      message: 'Selector result.order must list supported deterministic order keys.',
      suggestion: 'Use order: [qualityDesc, stableKeyAsc] or another quality plus stable-key order.',
    });
    return null;
  }
  if (!order.includes('stableKeyAsc') && !order.includes('stableKeyDesc')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COMPONENT_NONDETERMINISTIC_ORDER,
      path: `${path}.order`,
      severity: 'error',
      message: 'Selector result.order must include stableKeyAsc or stableKeyDesc as a deterministic tie-breaker.',
      suggestion: 'Append stableKeyAsc to selector result.order.',
    });
    return null;
  }
  return { maxItems: result.maxItems, order: order as ResultSpec['order'], onEmpty: result.onEmpty };
}

export function deriveSelectorCostClass(
  source: SelectorSource,
  analyses: readonly PolicyExprAnalysis[],
): SelectorCostClass {
  if (analyses.some((entry) => entry.costClass === 'preview')) return 'preview';
  if (source.kind === 'microturnOptions') return 'microturn';
  if (analyses.some((entry) => entry.costClass === 'candidate') || source.kind === 'candidateParams') {
    return 'candidate';
  }
  return 'state';
}

export function isSelectorCostClass(value: unknown): value is SelectorCostClass {
  return value === 'state'
    || value === 'candidate'
    || value === 'microturn'
    || value === 'preview'
    || value === 'auditOnly';
}

export function selectorCostClassLeq(left: SelectorCostClass, right: SelectorCostClass): boolean {
  return SELECTOR_COST_CLASS_ORDER[left] <= SELECTOR_COST_CLASS_ORDER[right];
}

export function selectorCostToPolicyCostClass(costClass: SelectorCostClass): AgentPolicyCostClass {
  if (costClass === 'preview') return 'preview';
  if (costClass === 'candidate' || costClass === 'microturn') return 'candidate';
  return 'state';
}

export function parseSelectorRef(refPath: string): {
  readonly selectorId: string;
  readonly field: Extract<CompiledAgentPolicyRef, { readonly kind: 'selector' }>['field'];
  readonly type: AgentPolicyValueType;
} | null {
  const rest = refPath.slice('selector.'.length);
  const selectedComponent = rest.match(/^([^.]+)\.selected\.component\.([^.]+)$/);
  if (selectedComponent !== null) {
    return {
      selectorId: selectedComponent[1]!,
      field: { kind: 'selected.component', componentId: selectedComponent[2]! },
      type: 'number',
    };
  }
  const candidateQuality = rest.match(/^([^.]+)\.candidate\.([^.]+)\.quality$/);
  if (candidateQuality !== null) {
    return {
      selectorId: candidateQuality[1]!,
      field: { kind: 'candidate.quality', key: candidateQuality[2]! },
      type: 'number',
    };
  }
  const dotIndex = rest.indexOf('.');
  if (dotIndex <= 0) return null;
  const selectorId = rest.slice(0, dotIndex);
  const field = rest.slice(dotIndex + 1);
  switch (field) {
    case 'selected.matches':
      return { selectorId, field, type: 'boolean' };
    case 'selected.key':
      return { selectorId, field, type: 'id' };
    case 'selected.quality':
    case 'selected.rank':
    case 'size':
      return { selectorId, field, type: 'number' };
    case 'impactSatisfied':
      return { selectorId, field, type: 'boolean' };
    default:
      return null;
  }
}

export function isSelectorProductPairCapExceeded(value: unknown): boolean {
  return !isPositiveSafeInteger(value) || value > MAX_SELECTOR_PRODUCT_PAIRS;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
