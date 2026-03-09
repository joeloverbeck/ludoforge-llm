/**
 * Compound normalizers: control-flow effects (chooseN, chooseOne, forEach, if,
 * rollRandom, removeByPriority, grantFreeOperation) plus macro override.
 *
 * These normalizers recurse into child effects via a `recurse` callback
 * (dependency-injected by the main dispatch in tooltip-normalizer.ts) to
 * avoid circular module imports.
 */

import type { EffectAST, ValueExpr, ConditionAST, OptionsQuery, TokenFilterExpr } from './types-ast.js';
import type { TooltipMessage, SelectMessage } from './tooltip-ir.js';
import type { NormalizerContext } from './tooltip-normalizer.js';
import { humanizeCondition, resolveModifierEffect, classifyModifierRole, matchesGlobPattern } from './tooltip-modifier-humanizer.js';
import { stringifyNumericExpr, stringifyZoneRef, stripMacroBindingPrefix, stringifyTokenFilter, humanizeMacroId } from './tooltip-value-stringifier.js';

/** Extract a single-key union member from EffectAST by its discriminant key. */
type EffectOf<K extends string> = Extract<EffectAST, Record<K, unknown>>;

/**
 * Signature for the recursive normalizer callback injected by the main module.
 * This breaks the circular dependency: compound normalizers don't import
 * normalizeEffect directly.
 */
export type EffectRecurse = (
  effects: readonly EffectAST[],
  ctx: NormalizerContext,
  basePath: string,
) => readonly TooltipMessage[];

// --- Helpers ---

export const getChooseNBounds = (p: EffectOf<'chooseN'>['chooseN']): { readonly min: number; readonly max: number } => {
  if ('n' in p && p.n !== undefined) return { min: p.n, max: p.n };
  const minVal = 'min' in p && typeof p.min === 'number' ? p.min : 0;
  const maxVal = 'max' in p && typeof p.max === 'number' ? p.max : 0;
  return { min: minVal, max: maxVal };
};

export const isSpaceQuery = (q: OptionsQuery): boolean =>
  'query' in q && (q.query === 'mapSpaces' || q.query === 'zones' || q.query === 'adjacentZones' || q.query === 'connectedZones' || q.query === 'tokenZones');

export const isTokenQuery = (q: OptionsQuery): boolean =>
  'query' in q && (q.query === 'tokensInZone' || q.query === 'tokensInMapSpaces' || q.query === 'tokensInAdjacentZones');

export const isPlayerQuery = (q: OptionsQuery): boolean =>
  'query' in q && q.query === 'players';

export const isValueQuery = (q: OptionsQuery): boolean =>
  'query' in q && (q.query === 'intsInRange' || q.query === 'intsInVarRange');

export const isMarkerQuery = (q: OptionsQuery): boolean =>
  'query' in q && q.query === 'globalMarkers';

export const isRowQuery = (q: OptionsQuery): boolean =>
  'query' in q && q.query === 'assetRows';

export const isEnumQuery = (q: OptionsQuery): boolean =>
  'query' in q && q.query === 'enums';

// --- Filter stringifiers ---

interface ExtractedFilter {
  readonly filter?: string;
  readonly conditionAST?: ConditionAST;
}

const extractQueryFilter = (options: OptionsQuery, ctx: NormalizerContext): ExtractedFilter => {
  if (!('query' in options)) return {};
  const q = options as Record<string, unknown>;

  // Space queries: mapSpaces, zones, adjacentZones — filter has { condition? }
  if (options.query === 'mapSpaces' || options.query === 'zones' || options.query === 'adjacentZones') {
    const f = q.filter as { readonly condition?: ConditionAST } | undefined;
    if (f?.condition !== undefined) {
      const humanized = humanizeCondition(f.condition, ctx);
      // Only store conditionAST when the condition is not suppressed —
      // otherwise the realizer would re-render suppressed variables into output.
      if (humanized !== null) {
        return { filter: humanized, conditionAST: f.condition };
      }
      return {};
    }
    return {};
  }

  // Token queries: tokensInZone, tokensInMapSpaces, tokensInAdjacentZones — filter is TokenFilterExpr
  if (options.query === 'tokensInZone' || options.query === 'tokensInMapSpaces' || options.query === 'tokensInAdjacentZones') {
    const f = q.filter as TokenFilterExpr | undefined;
    if (f !== undefined) return { filter: stringifyTokenFilter(f) };
    return {};
  }

  return {};
};

// --- Compound rules (28-35, 41) ---

const buildSelectMessage = (
  target: SelectMessage['target'],
  bounds: { readonly min: number; readonly max: number },
  extracted: ExtractedFilter,
  astPath: string,
  optionHints?: readonly string[],
): readonly TooltipMessage[] => [
  {
    kind: 'select',
    target,
    bounds,
    ...(extracted.filter !== undefined ? { filter: extracted.filter } : {}),
    ...(extracted.conditionAST !== undefined ? { conditionAST: extracted.conditionAST } : {}),
    ...(optionHints !== undefined ? { optionHints } : {}),
    astPath,
  },
];

const classifyQueryTarget = (options: OptionsQuery): SelectMessage['target'] => {
  if (!('query' in options)) return 'items';
  if (isSpaceQuery(options)) return 'spaces';
  if (isTokenQuery(options)) return 'zones';
  if (isPlayerQuery(options)) return 'players';
  if (isValueQuery(options)) return 'values';
  if (isMarkerQuery(options)) return 'markers';
  if (isRowQuery(options)) return 'rows';
  if (isEnumQuery(options)) return 'options';
  if (options.query === 'concat') {
    const sourceTargets = options.sources.map(classifyQueryTarget);
    const unique = [...new Set(sourceTargets)];
    return unique.length === 1 ? unique[0]! : 'items';
  }
  if (options.query === 'nextInOrderByCondition') return classifyQueryTarget(options.source);
  return 'items';
};

/**
 * Derive a human-readable context label from an OptionsQuery when the
 * classifyQueryTarget returns 'items'. Returns undefined if no meaningful
 * label can be derived.
 */
const deriveQueryContextLabel = (options: OptionsQuery): string | undefined => {
  if (!('query' in options)) return undefined;

  if (options.query === 'binding') {
    const name = (options as { readonly query: 'binding'; readonly name: string }).name;
    return stripMacroBindingPrefix(name);
  }

  if (options.query === 'concat') {
    const sourceLabels = options.sources
      .map((s) => deriveQueryContextLabel(s))
      .filter((l): l is string => l !== undefined);
    const unique = [...new Set(sourceLabels)];
    if (unique.length > 0) return unique.join(' or ');
  }

  return undefined;
};

export const normalizeChooseN = (
  payload: EffectOf<'chooseN'>,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] => {
  const p = payload.chooseN;
  const bounds = getChooseNBounds(p);
  const extracted = extractQueryFilter(p.options, ctx);
  const target = classifyQueryTarget(p.options);

  const optionHints = isEnumQuery(p.options)
    ? (p.options as { readonly query: 'enums'; readonly values: readonly string[] }).values
    : undefined;

  const msgs = buildSelectMessage(target, bounds, extracted, astPath, optionHints);

  // Propagate choiceBranchLabel to SelectMessage when target is generic 'items'
  if (target === 'items' && msgs.length > 0) {
    // Prefer parent choiceBranchLabel, fall back to query-derived context
    const label = ctx.choiceBranchLabel ?? deriveQueryContextLabel(p.options);
    if (label !== undefined) {
      return msgs.map((m) =>
        m.kind === 'select'
          ? { ...m, choiceBranchLabel: label } as typeof m
          : m,
      );
    }
  }

  return msgs;
};

export const normalizeChooseOne = (
  payload: EffectOf<'chooseOne'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const p = payload.chooseOne;

  if ('query' in p.options && p.options.query === 'enums') {
    const hasNone = p.options.values.some((v) => v.toLowerCase() === 'none');
    const filteredOptions = hasNone
      ? p.options.values.filter((v) => v.toLowerCase() !== 'none')
      : p.options.values;
    return [{
      kind: 'choose',
      options: filteredOptions,
      paramName: p.bind,
      ...(hasNone ? { optional: true } : {}),
      astPath,
    }];
  }

  return [{ kind: 'choose', options: [], paramName: p.bind, astPath }];
};

export const normalizeForEach = (
  payload: EffectOf<'forEach'>,
  ctx: NormalizerContext,
  astPath: string,
  recurse: EffectRecurse,
): readonly TooltipMessage[] => {
  const children = recurse(payload.forEach.effects, ctx, `${astPath}.effects`);
  const inChildren = payload.forEach.in !== undefined
    ? recurse(payload.forEach.in, ctx, `${astPath}.in`)
    : [];
  const all = [...children, ...inChildren];
  return all.length > 0 ? all : [{ kind: 'suppressed', reason: 'empty forEach', astPath }];
};

/**
 * Extract the variable name from the LHS of a comparison condition.
 */
const extractLHSName = (left: ValueExpr): string | undefined => {
  if (typeof left === 'string') return left;
  if (typeof left === 'object' && left !== null && 'ref' in left) {
    if (left.ref === 'gvar') return left.var;
    if (left.ref === 'pvar') return left.var;
    if (left.ref === 'binding') return left.name;
  }
  return undefined;
};

/**
 * Extract a branch label from a simple equality condition (e.g., "Train Choice == Place Irregulars").
 * Returns the right-hand string value, which contextualizes child chooseN selections.
 *
 * Guards against capability marker state values leaking as branch labels — only
 * produces labels from choice-flow variables, not capability keys.
 */
const extractBranchLabel = (cond: ConditionAST, ctx: NormalizerContext): string | undefined => {
  if (typeof cond === 'boolean') return undefined;
  const c = cond as Record<string, unknown>;
  if (c.op !== '==' || c.right === undefined || typeof c.right !== 'string') return undefined;

  const lhsName = extractLHSName(c.left as ValueExpr);
  if (lhsName === undefined) return undefined;

  // Reject if LHS is a capability key (e.g., cap_cords)
  if (ctx.verbalization?.modifierEffects[lhsName] !== undefined) return undefined;

  // Only accept if LHS matches a choiceFlowPattern
  const classification = ctx.verbalization?.modifierClassification;
  if (classification !== undefined) {
    const isChoiceFlow = classification.choiceFlowPatterns.some((p) => matchesGlobPattern(lhsName, p));
    if (!isChoiceFlow) return undefined;
  }

  return c.right;
};

/**
 * Detect an `__actionClass == '<value>'` condition pattern.
 * Returns the string literal from the RHS if matched, undefined otherwise.
 */
const extractActionClassConditionValue = (cond: ConditionAST): string | undefined => {
  if (typeof cond === 'boolean') return undefined;
  const c = cond as Record<string, unknown>;
  if (c.op !== '==') return undefined;
  const left = c.left as ValueExpr | undefined;
  if (left === undefined) return undefined;
  // Check if LHS is a binding or gvar ref named '__actionClass'
  if (typeof left === 'object' && left !== null && 'ref' in left) {
    const isActionClass =
      (left.ref === 'binding' && left.name === '__actionClass') ||
      (left.ref === 'gvar' && left.var === '__actionClass');
    if (isActionClass) {
      return typeof c.right === 'string' ? c.right : undefined;
    }
  }
  // Also handle direct string LHS (less common but possible)
  if (typeof left === 'string' && left === '__actionClass') {
    return typeof c.right === 'string' ? c.right : undefined;
  }
  return undefined;
};

export const normalizeIf = (
  payload: EffectOf<'if'>,
  ctx: NormalizerContext,
  astPath: string,
  recurse: EffectRecurse,
): readonly TooltipMessage[] => {
  const { when, then: thenEffects } = payload.if;
  const elseEffects = payload.if.else;

  // Early check: if this is an __actionClass branch and we know the runtime value,
  // emit only the matching branch to avoid showing duplicate LimOp/FullOp content.
  if (ctx.actionClassBinding !== undefined) {
    const condValue = extractActionClassConditionValue(when);
    if (condValue !== undefined) {
      const isMatch = condValue === ctx.actionClassBinding;
      if (isMatch) {
        return recurse(thenEffects, ctx, `${astPath}.then`);
      }
      // Not a match — process the else branch if it exists
      return elseEffects !== undefined
        ? recurse(elseEffects, ctx, `${astPath}.else`)
        : [];
    }
  }

  const resolved = resolveModifierEffect(when, ctx);

  // Propagate branch label from equality conditions (e.g., "Choice is Place Irregulars")
  const branchLabel = extractBranchLabel(when, ctx);
  const childCtx = branchLabel !== undefined ? { ...ctx, choiceBranchLabel: branchLabel } : ctx;

  const thenMessages = recurse(thenEffects, childCtx, `${astPath}.then`);

  const elseMessages = elseEffects !== undefined
    ? recurse(elseEffects, childCtx, `${astPath}.else`)
    : [];

  if (resolved === null) {
    const suppressed: TooltipMessage = { kind: 'suppressed', reason: 'internal condition', astPath };
    return [suppressed, ...thenMessages, ...elseMessages];
  }

  const role = classifyModifierRole(when, ctx);

  const modifier: TooltipMessage = {
    kind: 'modifier',
    condition: resolved.condition,
    description: resolved.effect,
    conditionAST: when,
    ...(role !== undefined ? { modifierRole: role } : {}),
    astPath,
  };

  return [modifier, ...thenMessages, ...elseMessages];
};

export const normalizeRollRandom = (
  payload: EffectOf<'rollRandom'>,
  ctx: NormalizerContext,
  astPath: string,
  recurse: EffectRecurse,
): readonly TooltipMessage[] => {
  const { bind, min, max } = payload.rollRandom;
  const minVal = typeof min === 'number' ? min : 0;
  const maxVal = typeof max === 'number' ? max : 0;
  const rollMsg: TooltipMessage = { kind: 'roll', range: { min: minVal, max: maxVal }, bindTo: bind, astPath };
  const children = recurse(payload.rollRandom.in, ctx, `${astPath}.in`);
  return [rollMsg, ...children];
};

export const normalizeRemoveByPriority = (
  payload: EffectOf<'removeByPriority'>,
  ctx: NormalizerContext,
  astPath: string,
  recurse: EffectRecurse,
): readonly TooltipMessage[] => {
  const { budget, groups } = payload.removeByPriority;
  const budgetStr = stringifyNumericExpr(budget);
  const groupMessages: readonly TooltipMessage[] = groups.map((group, i): TooltipMessage => ({
    kind: 'remove',
    tokenFilter: stripMacroBindingPrefix(group.bind),
    fromZone: group.from !== undefined ? stringifyZoneRef(group.from) : '<priority>',
    destination: stringifyZoneRef(group.to),
    budget: budgetStr,
    astPath: `${astPath}.groups[${i}]`,
  }));
  const inChildren = payload.removeByPriority.in !== undefined
    ? recurse(payload.removeByPriority.in, ctx, `${astPath}.in`)
    : [];
  return [
    ...groupMessages,
    ...inChildren,
  ];
};

export const normalizeGrantFreeOperation = (
  payload: EffectOf<'grantFreeOperation'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { seat, operationClass } = payload.grantFreeOperation;
  return [{ kind: 'grant', operation: operationClass, targetPlayer: seat, astPath }];
};

// --- Leaf macro binding extraction ---

/**
 * Extract a macro ID from a `__macro_` prefixed binding name.
 * E.g. `"__macro_place_from_available_or_map_action Pipelines_0__..."` → `"place_from_available_or_map_action"`.
 * Returns undefined if the name doesn't start with `__macro_`.
 */
export const extractMacroIdFromBinding = (name: string): string | undefined => {
  if (!name.startsWith('__macro_')) return undefined;
  const stripped = name.slice('__macro_'.length);
  const spaceIdx = stripped.indexOf(' ');
  return spaceIdx >= 0 ? stripped.slice(0, spaceIdx) : stripped;
};

// --- Macro override ---

/**
 * Extract macroOrigin from compound effects that support it.
 * Returns the macroId if present, undefined otherwise.
 */
export const extractMacroId = (effect: EffectAST): string | undefined => {
  if ('forEach' in effect) return effect.forEach.macroOrigin?.macroId;
  if ('chooseN' in effect) return effect.chooseN.macroOrigin?.macroId;
  if ('chooseOne' in effect) return effect.chooseOne.macroOrigin?.macroId;
  if ('rollRandom' in effect) return effect.rollRandom.macroOrigin?.macroId;
  if ('removeByPriority' in effect) return effect.removeByPriority.macroOrigin?.macroId;
  if ('let' in effect) return effect.let.macroOrigin?.macroId;
  if ('bindValue' in effect) return effect.bindValue.macroOrigin?.macroId;
  if ('reduce' in effect) return effect.reduce.resultMacroOrigin?.macroId;
  if ('evaluateSubset' in effect) return effect.evaluateSubset.macroOrigin?.macroId;
  return undefined;
};

export const tryMacroOverride = (
  effect: EffectAST,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] | undefined => {
  if (ctx.verbalization === undefined) return undefined;
  const macroId = extractMacroId(effect);
  if (macroId === undefined) return undefined;

  // Try verbalization summary first
  const macroEntry = ctx.verbalization.macros[macroId];
  if (macroEntry?.summary !== undefined) {
    const text = macroEntry.slots !== undefined
      ? Object.entries(macroEntry.slots).reduce(
          (acc, [key, val]) => acc.replaceAll(`{${key}}`, val),
          macroEntry.summary,
        )
      : macroEntry.summary;
    return [{
      kind: 'summary',
      text,
      macroClass: macroEntry.class,
      macroOrigin: macroId,
      astPath,
    }];
  }

  // Fallback: derive human-readable text from the macro ID itself
  // when verbalization exists but this specific macro has no summary entry
  return [{
    kind: 'summary',
    text: humanizeMacroId(macroId),
    macroOrigin: macroId,
    astPath,
  }];
};
