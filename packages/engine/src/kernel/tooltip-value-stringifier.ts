/**
 * Canonical stringification of ValueExpr, NumericValueExpr, and ZoneRef
 * for tooltip display. Handles all 12 Reference types, arithmetic
 * expressions, and aggregate expressions.
 *
 * Extracted from tooltip-normalizer.ts / tooltip-normalizer-compound.ts
 * to eliminate duplication and provide complete ref-type coverage.
 */

import type { ValueExpr, NumericValueExpr, ZoneRef } from './types-ast.js';
import type { LabelContext } from './tooltip-label-resolver.js';
import { resolveLabel } from './tooltip-label-resolver.js';
import { humanizeIdentifier } from './tooltip-humanizer.js';

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
  const lastDoubleUnderscore = stripped.lastIndexOf('__');
  return lastDoubleUnderscore >= 0 ? stripped.slice(lastDoubleUnderscore + 2) : stripped;
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

export const stringifyZoneRef = (ref: ZoneRef): string =>
  typeof ref === 'string' ? ref : '<expr>';

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
      case 'zoneProp': return `${expr.zone}.${expr.prop}`;
      case 'activePlayer': return 'activePlayer';
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
    return `${expr.aggregate.op} of ...`;
  }

  // Concat expression
  if ('concat' in expr && Array.isArray(expr.concat)) {
    return (expr.concat as readonly ValueExpr[]).map(stringifyValueExpr).join(' + ');
  }

  // Conditional expression
  if ('if' in expr) {
    return `${stringifyValueExpr(expr.if.then)} or ${stringifyValueExpr(expr.if.else)}`;
  }

  return '<expr>';
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
): string => {
  // Primitives
  if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);
  if (typeof expr === 'string') return resolveLabel(expr, ctx);

  // Reference types (all 12)
  if ('ref' in expr) {
    switch (expr.ref) {
      case 'gvar': return resolveLabel(expr.var, ctx);
      case 'pvar': return resolveLabel(expr.var, ctx);
      case 'binding': {
        const raw = expr.displayName ?? expr.name;
        return raw.startsWith(MACRO_PREFIX)
          ? sanitizeBindingName(raw, ctx)
          : resolveLabel(raw, ctx);
      }
      case 'globalMarkerState': return resolveLabel(expr.marker, ctx);
      case 'markerState': return `${resolveLabel(expr.marker, ctx)} of ${resolveLabel(expr.space as string, ctx)}`;
      case 'zoneCount': return `pieces in ${resolveLabel(expr.zone as string, ctx)}`;
      case 'tokenProp': return `${resolveLabel(expr.token as string, ctx)}.${resolveLabel(expr.prop, ctx)}`;
      case 'assetField': return resolveLabel(expr.field, ctx);
      case 'zoneProp': return `${resolveLabel(expr.zone as string, ctx)}.${resolveLabel(expr.prop, ctx)}`;
      case 'activePlayer': return 'active player';
      case 'tokenZone': return `zone of ${resolveLabel(expr.token as string, ctx)}`;
      case 'zoneVar': return `${resolveLabel(expr.var, ctx)} of ${resolveLabel(expr.zone as string, ctx)}`;
      default: return 'value';
    }
  }

  // Arithmetic expression
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = humanizeValueExpr(expr.left, ctx);
    const right = humanizeValueExpr(expr.right, ctx);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    const agg = expr.aggregate;
    if (agg.op === 'count') {
      return 'number of matching items';
    }
    // sum/min/max with bind + valueExpr
    const rawBind = agg.bind;
    const field = rawBind.startsWith(MACRO_PREFIX)
      ? sanitizeBindingName(rawBind, ctx)
      : resolveLabel(rawBind, ctx);
    return `${agg.op} of ${field}`;
  }

  // Concat expression
  if ('concat' in expr && Array.isArray(expr.concat)) {
    return (expr.concat as readonly ValueExpr[])
      .map((part) => humanizeValueExpr(part, ctx))
      .join(' ');
  }

  // Conditional expression
  if ('if' in expr) {
    const thenText = humanizeValueExpr(expr.if.then, ctx);
    const elseText = humanizeValueExpr(expr.if.else, ctx);
    return `${thenText} if condition met, otherwise ${elseText}`;
  }

  return 'value';
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
