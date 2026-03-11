/**
 * Canonical stringification of ValueExpr, NumericValueExpr, and ZoneRef
 * for tooltip display. Handles all 12 Reference types, arithmetic
 * expressions, and aggregate expressions.
 *
 * Extracted from tooltip-normalizer.ts / tooltip-normalizer-compound.ts
 * to eliminate duplication and provide complete ref-type coverage.
 */

import type { ValueExpr, NumericValueExpr, ZoneRef, OptionsQuery, TokenFilterExpr } from './types-ast.js';
import type { LabelContext } from './tooltip-label-resolver.js';
import { resolveLabel } from './tooltip-label-resolver.js';
import { humanizeIdentifier } from './tooltip-humanizer.js';

// ---------------------------------------------------------------------------
// Macro ID humanization
// ---------------------------------------------------------------------------

/**
 * Known abbreviations in macro IDs that should be rendered in a specific form.
 * Keys are lowercase, values are the display form.
 *
 * Game-specific abbreviations (e.g. faction names) belong in verbalization
 * data, not here.  Only truly generic abbreviations go in this map.
 */
const MACRO_ABBREVIATIONS: Readonly<Record<string, string>> = {
  id: 'ID',
  hp: 'HP',
  ai: 'AI',
  ui: 'UI',
};

/**
 * Convert a macro ID (underscore-separated) into a human-readable title.
 *
 * - Splits on underscores
 * - Strips trailing "action" segment (internal compiler artifact)
 * - Expands known generic abbreviations (e.g., `id` → `ID`, `ai` → `AI`)
 * - Title-cases remaining words
 *
 * @example humanizeMacroId('place_from_available_or_map_action') → 'Place From Available Or Map'
 * @example humanizeMacroId('player_ai_turn') → 'Player AI Turn'
 */
/**
 * Split a segment on camelCase boundaries.
 * E.g. `trainUs` → `['train', 'Us']`, `MyTroops` → `['My', 'Troops']`
 */
const splitCamelCase = (segment: string): readonly string[] =>
  segment
    .replace(/([a-z])([A-Z])/g, '$1\0$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\0$2')
    .split('\0')
    .filter((w) => w.length > 0);

export const humanizeMacroId = (macroId: string): string => {
  // Split on underscores first, then split each segment on camelCase boundaries
  const rawWords = macroId.split('_').filter((w) => w.length > 0);
  if (rawWords.length === 0) return macroId;

  const words = rawWords.flatMap(splitCamelCase);
  if (words.length === 0) return macroId;

  // Strip trailing "action" — it's a compiler artifact, not meaningful to users
  if (words.length > 1 && words[words.length - 1]!.toLowerCase() === 'action') {
    words.pop();
  }

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      const abbr = MACRO_ABBREVIATIONS[lower];
      if (abbr !== undefined) return abbr;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// ---------------------------------------------------------------------------
// Binding name sanitization
// ---------------------------------------------------------------------------

const MACRO_PREFIX = '__macro_';

/**
 * Extract the final semantic segment from a macro-expanded binding name.
 * E.g. `__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece`
 * → `piece`.
 *
 * If no `__` segments exist after the prefix, returns the full stripped name.
 */
const extractSemanticTail = (name: string): string => {
  const stripped = name.slice(MACRO_PREFIX.length);
  // Handle space-separated segments (e.g. "__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece")
  // Take the last space-separated segment first, then extract the double-underscore tail from it.
  const spaceIdx = stripped.lastIndexOf(' ');
  const segment = spaceIdx >= 0 ? stripped.slice(spaceIdx + 1) : stripped;
  const lastDoubleUnderscore = segment.lastIndexOf('__');
  return lastDoubleUnderscore >= 0 ? segment.slice(lastDoubleUnderscore + 2) : segment;
};

/**
 * Strip a `__macro_` prefix from a binding name, returning the raw semantic
 * tail identifier. Use this in normalizer tokenFilter fields where downstream
 * `resolveLabel()` handles display formatting.
 *
 * Non-`__macro_` names pass through unchanged.
 */
export const stripMacroBindingPrefix = (name: string): string => {
  if (!name.startsWith(MACRO_PREFIX)) return name;
  return extractSemanticTail(name);
};

/**
 * Sanitize AND format a binding name for direct display (no downstream
 * `resolveLabel`). Extracts the semantic tail, then humanizes it.
 *
 * Use this in `stringifyValueExpr` and other contexts where the result
 * is rendered directly without further label resolution.
 *
 * Non-`__macro_` names pass through unchanged.
 */
export const sanitizeBindingName = (
  name: string,
  ctx?: LabelContext,
): string => {
  if (!name.startsWith(MACRO_PREFIX)) return name;
  const semantic = extractSemanticTail(name);
  if (ctx !== undefined) return resolveLabel(semantic, ctx);
  return humanizeIdentifier(semantic);
};

export const stringifyZoneRef = (ref: ZoneRef): string => {
  if (typeof ref === 'string') return sanitizeBindingName(ref);
  // { zoneExpr: ValueExpr } — delegate to value stringifier (handles binding refs)
  if ('zoneExpr' in ref) return stringifyValueExpr(ref.zoneExpr);
  // Best-effort: stringify any remaining object shape by its keys
  const keys = Object.keys(ref as Record<string, unknown>);
  return keys.length > 0 ? `zone(${keys.join(', ')})` : 'zone';
};

// ---------------------------------------------------------------------------
// Token filter stringification (moved from tooltip-normalizer-compound.ts)
// ---------------------------------------------------------------------------

const stringifyPredicateValue = (value: ValueExpr | readonly (string | number | boolean)[]): string => {
  if (Array.isArray(value)) return (value as readonly (string | number | boolean)[]).join(', ');
  return stringifyValueExpr(value as ValueExpr);
};

export const stringifyTokenFilter = (filter: TokenFilterExpr): string => {
  if ('prop' in filter) return `${filter.prop} ${filter.op} ${stringifyPredicateValue(filter.value)}`;
  if (filter.op === 'not') return `NOT ${stringifyTokenFilter(filter.arg)}`;
  return (filter.args as readonly TokenFilterExpr[]).map(stringifyTokenFilter).join(` ${filter.op.toUpperCase()} `);
};

// ---------------------------------------------------------------------------
// Aggregate count humanization
// ---------------------------------------------------------------------------

/**
 * Build a human-readable description from a token filter for use in count
 * expressions. E.g. `{ prop: 'faction', op: 'eq', value: 'US' }` → "US".
 */
const humanizeTokenFilterForCount = (filter: TokenFilterExpr, ctx: LabelContext): string => {
  if ('prop' in filter) {
    const { prop, op, value } = filter;
    // Array values (e.g., in operator): "Alpha/Bravo"
    if (Array.isArray(value)) {
      return (value as readonly (string | number | boolean)[])
        .map((v) => resolveLabel(String(v), ctx))
        .join('/');
    }
    const resolved = resolveLabel(String(value), ctx);
    // For 'type' properties, capitalize as a noun (e.g., "base" → "Bases")
    if (prop === 'type') return resolved;
    // For 'in' operator with array-like values
    if (op === 'in' && Array.isArray(value)) {
      return (value as readonly (string | number | boolean)[])
        .map((v) => resolveLabel(String(v), ctx))
        .join('/');
    }
    return resolved;
  }
  if (filter.op === 'not') return humanizeTokenFilterForCount(filter.arg, ctx);
  if (filter.op === 'and') {
    // AND combinator: concatenate parts (e.g., "US Bases")
    return (filter.args as readonly TokenFilterExpr[])
      .map((f) => humanizeTokenFilterForCount(f, ctx))
      .join(' ');
  }
  // OR combinator: slash-separate (e.g., "Alpha/Bravo")
  return (filter.args as readonly TokenFilterExpr[])
    .map((f) => humanizeTokenFilterForCount(f, ctx))
    .join('/');
};

/**
 * Humanize an aggregate count query into a descriptive string.
 * Introspects the query's type and filter to produce text like
 * "US Bases" instead of "matching items".
 */
const humanizeAggregateQuery = (query: OptionsQuery, ctx: LabelContext): string => {
  if (!('query' in query)) return 'matching items';

  // Token queries — introspect the token filter
  if (query.query === 'tokensInZone' || query.query === 'tokensInMapSpaces' || query.query === 'tokensInAdjacentZones') {
    const q = query as { readonly filter?: TokenFilterExpr };
    if (q.filter !== undefined) {
      const desc = humanizeTokenFilterForCount(q.filter, ctx);
      if (desc.length > 0) return `${desc} pieces`;
    }
    return 'pieces';
  }

  // Space queries
  if (query.query === 'mapSpaces' || query.query === 'zones') return 'spaces';

  // Binding — resolve label
  if (query.query === 'binding') {
    const q = query as { readonly query: 'binding'; readonly name: string };
    return resolveLabel(q.name, ctx);
  }

  // Concat — combine source descriptions
  if (query.query === 'concat') {
    const descriptions = query.sources.map((s) => humanizeAggregateQuery(s, ctx));
    const unique = [...new Set(descriptions)];
    return unique.length === 1 ? unique[0]! : unique.join(' or ');
  }

  return 'matching items';
};

export const stringifyValueExpr = (expr: ValueExpr): string => {
  if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);
  if (typeof expr === 'string') return expr;

  // Reference types (all 12)
  if ('ref' in expr) {
    switch (expr.ref) {
      case 'gvar': return expr.var;
      case 'pvar': return expr.var;
      case 'binding': return sanitizeBindingName(expr.displayName ?? expr.name);
      case 'globalMarkerState': return expr.marker;
      case 'markerState': return `${expr.marker} of ${expr.space}`;
      case 'zoneCount': return `pieces in ${expr.zone}`;
      case 'tokenProp': return `${expr.token}.${expr.prop}`;
      case 'assetField': return expr.field;
      case 'zoneProp': {
        if (typeof expr.zone === 'string' && expr.zone.startsWith('$')) return `zone ${expr.prop}`;
        return `${expr.zone}.${expr.prop}`;
      }
      case 'activePlayer': return 'activePlayer';
      case 'activeSeat': return 'activeSeat';
      case 'tokenZone': return `zone of ${expr.token}`;
      case 'zoneVar': return `${expr.var} of ${expr.zone}`;
      default: return '<ref>';
    }
  }

  // Arithmetic expression
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = stringifyValueExpr(expr.left);
    const right = stringifyValueExpr(expr.right);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    const agg = expr.aggregate;
    if (agg.op === 'count') return `count of ${agg.query.query ?? '...'}`;
    return `${agg.op} of ...`;
  }

  // Concat expression
  if ('concat' in expr && Array.isArray(expr.concat)) {
    return (expr.concat as readonly ValueExpr[]).map(stringifyValueExpr).join(' + ');
  }

  // Conditional expression
  if ('if' in expr) {
    return `${stringifyValueExpr(expr.if.then)} or ${stringifyValueExpr(expr.if.else)}`;
  }

  // Best-effort: describe by keys for debugging
  const keys = Object.keys(expr as Record<string, unknown>);
  return keys.length > 0 ? `expr(${keys.join(', ')})` : 'expression';
};

// ---------------------------------------------------------------------------
// Label-aware value humanization (authoritative — all shapes)
// ---------------------------------------------------------------------------

/**
 * Humanize a `ValueExpr` into a human-readable string with full label
 * resolution via `LabelContext`. Handles every discriminant shape:
 *
 *   - primitives (number, boolean, string)
 *   - Reference (all 12 sub-types)
 *   - arithmetic (recursive)
 *   - aggregate (count, sum, min, max)
 *   - concat
 *   - conditional
 *
 * Never produces a raw `<value>` placeholder.
 */
export const humanizeValueExpr = (
  expr: ValueExpr,
  ctx: LabelContext,
  count?: number,
): string => {
  // Primitives
  if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);
  if (typeof expr === 'string') return resolveLabel(expr, ctx, count);

  // Reference types (all 12)
  if ('ref' in expr) {
    switch (expr.ref) {
      case 'gvar': return resolveLabel(expr.var, ctx, count);
      case 'pvar': return resolveLabel(expr.var, ctx, count);
      case 'binding': {
        const raw = expr.displayName ?? expr.name;
        return raw.startsWith(MACRO_PREFIX)
          ? sanitizeBindingName(raw, ctx)
          : resolveLabel(raw, ctx, count);
      }
      case 'globalMarkerState': return resolveLabel(expr.marker, ctx, count);
      case 'markerState': return `${resolveLabel(expr.marker, ctx, count)} of ${resolveLabel(expr.space as string, ctx, count)}`;
      case 'zoneCount': return `pieces in ${resolveLabel(expr.zone as string, ctx, count)}`;
      case 'tokenProp': return `${resolveLabel(expr.token as string, ctx, count)}.${resolveLabel(expr.prop, ctx, count)}`;
      case 'assetField': return resolveLabel(expr.field, ctx, count);
      case 'zoneProp': {
        const zoneName = resolveLabel(expr.zone as string, ctx, count);
        const propName = resolveLabel(expr.prop, ctx, count);
        // For binding-like zones (e.g. $space), render as "zone property" instead of "$space.property"
        if (expr.zone.startsWith('$')) return `zone ${propName}`;
        return `${zoneName} ${propName}`;
      }
      case 'activePlayer': return 'active player';
      case 'activeSeat': return 'active seat';
      case 'tokenZone': return `zone of ${resolveLabel(expr.token as string, ctx, count)}`;
      case 'zoneVar': return `${resolveLabel(expr.var, ctx, count)} of ${resolveLabel(expr.zone as string, ctx, count)}`;
      default: {
        // Exhaustive — all 12 ref types are handled above. This guards
        // against future additions; render the ref type for debugging.
        const refType = (expr as { readonly ref: string }).ref;
        return refType !== undefined ? `ref(${refType})` : 'value';
      }
    }
  }

  // Arithmetic expression
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = humanizeValueExpr(expr.left, ctx, count);
    const right = humanizeValueExpr(expr.right, ctx, count);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    const agg = expr.aggregate;
    if (agg.op === 'count') {
      const description = humanizeAggregateQuery(agg.query, ctx);
      return `number of ${description}`;
    }
    // sum/min/max with bind + valueExpr
    const rawBind = agg.bind;
    const field = rawBind.startsWith(MACRO_PREFIX)
      ? sanitizeBindingName(rawBind, ctx)
      : resolveLabel(rawBind, ctx, count);
    return `${agg.op} of ${field}`;
  }

  // Concat expression
  if ('concat' in expr && Array.isArray(expr.concat)) {
    return (expr.concat as readonly ValueExpr[])
      .map((part) => humanizeValueExpr(part, ctx, count))
      .join(' ');
  }

  // Conditional expression
  if ('if' in expr) {
    const thenText = humanizeValueExpr(expr.if.then, ctx, count);
    const elseText = humanizeValueExpr(expr.if.else, ctx, count);
    return `${thenText} if condition met, otherwise ${elseText}`;
  }

  // Best-effort: describe by keys for debugging instead of opaque 'value'
  const keys = Object.keys(expr as Record<string, unknown>);
  return keys.length > 0 ? `expr(${keys.join(', ')})` : 'value';
};

export const stringifyNumericExpr = (expr: NumericValueExpr): string => {
  if (typeof expr === 'number') return String(expr);

  // Arithmetic expression (NumericValueExpr has its own op/left/right)
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = stringifyNumericExpr(expr.left);
    const right = stringifyNumericExpr(expr.right);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    return `${expr.aggregate.op} of ...`;
  }

  return stringifyValueExpr(expr as ValueExpr);
};
