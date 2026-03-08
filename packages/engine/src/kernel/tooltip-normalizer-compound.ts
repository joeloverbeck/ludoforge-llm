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
import { humanizeCondition } from './tooltip-modifier-humanizer.js';
import { stringifyValueExpr, stringifyNumericExpr, stringifyZoneRef, stripMacroBindingPrefix } from './tooltip-value-stringifier.js';

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

const stringifyPredicateValue = (value: ValueExpr | readonly (string | number | boolean)[]): string => {
  if (Array.isArray(value)) return (value as readonly (string | number | boolean)[]).join(', ');
  return stringifyValueExpr(value as ValueExpr);
};

const stringifyTokenFilter = (filter: TokenFilterExpr): string => {
  if ('prop' in filter) return `${filter.prop} ${filter.op} ${stringifyPredicateValue(filter.value)}`;
  if (filter.op === 'not') return `NOT ${stringifyTokenFilter(filter.arg)}`;
  return (filter.args as readonly TokenFilterExpr[]).map(stringifyTokenFilter).join(` ${filter.op.toUpperCase()} `);
};

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

  return buildSelectMessage(target, bounds, extracted, astPath, optionHints);
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

export const normalizeIf = (
  payload: EffectOf<'if'>,
  ctx: NormalizerContext,
  astPath: string,
  recurse: EffectRecurse,
): readonly TooltipMessage[] => {
  const { when, then: thenEffects } = payload.if;
  const elseEffects = payload.if.else;

  const humanized = humanizeCondition(when, ctx);

  const thenMessages = recurse(thenEffects, ctx, `${astPath}.then`);

  const elseMessages = elseEffects !== undefined
    ? recurse(elseEffects, ctx, `${astPath}.else`)
    : [];

  if (humanized === null) {
    const suppressed: TooltipMessage = { kind: 'suppressed', reason: 'internal condition', astPath };
    return [suppressed, ...thenMessages, ...elseMessages];
  }

  const modifier: TooltipMessage = { kind: 'modifier', condition: humanized, description: `If ${humanized}`, conditionAST: when, astPath };

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
  const macroEntry = ctx.verbalization.macros[macroId];
  if (macroEntry?.summary === undefined) return undefined;
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
};
