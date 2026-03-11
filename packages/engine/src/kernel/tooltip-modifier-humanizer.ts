/**
 * Modifier humanizer: converts raw ConditionAST into human-readable condition
 * strings and resolves pre-authored modifier effect descriptions.
 *
 * Suppresses internal conditions (double-underscore prefixes, macro artifacts,
 * tracking variables) and resolves identifiers through the label resolver.
 */

import type { ConditionAST, ValueExpr } from './types-ast.js';
import type { ModifierRole } from './tooltip-ir.js';
import type { NormalizerContext } from './tooltip-normalizer.js';
import type { LabelContext } from './tooltip-label-resolver.js';
import { buildLabelContext, resolveLabel } from './tooltip-label-resolver.js';
import { humanizeValueExpr } from './tooltip-value-stringifier.js';
import { isSuppressed } from './tooltip-suppression.js';

// ---------------------------------------------------------------------------
// Condition variable extraction
// ---------------------------------------------------------------------------

/**
 * Extract all variable/identifier names referenced in a ConditionAST.
 * Used to check if any referenced name should trigger suppression.
 */
function extractConditionNames(cond: ConditionAST): readonly string[] {
  if (typeof cond === 'boolean') return [];
  const c = cond as Record<string, unknown>;

  if (c.op === 'and' || c.op === 'or') {
    return (c.args as ConditionAST[]).flatMap(extractConditionNames);
  }
  if (c.op === 'not') {
    return extractConditionNames(c.arg as ConditionAST);
  }

  const names: string[] = [];
  if (c.left !== undefined) names.push(...extractValueNames(c.left as ValueExpr));
  if (c.right !== undefined) names.push(...extractValueNames(c.right as ValueExpr));
  if (c.item !== undefined) names.push(...extractValueNames(c.item as ValueExpr));
  if (c.set !== undefined) names.push(...extractValueNames(c.set as ValueExpr));
  if (c.value !== undefined) names.push(...extractValueNames(c.value as ValueExpr));
  if (c.state !== undefined) names.push(...extractValueNames(c.state as ValueExpr));
  if (typeof c.prop === 'string') names.push(c.prop);
  if (typeof c.marker === 'string') names.push(c.marker);
  return names;
}

function extractValueNames(expr: ValueExpr): readonly string[] {
  if (typeof expr === 'string') return [expr];
  if (typeof expr === 'number' || typeof expr === 'boolean') return [];
  if ('ref' in expr) {
    if (expr.ref === 'gvar') return [expr.var];
    if (expr.ref === 'pvar') return [expr.var];
    if (expr.ref === 'binding') return [expr.name];
    if (expr.ref === 'globalMarkerState') return [expr.marker];
    if (expr.ref === 'markerState') return [expr.marker, expr.space];
    if (expr.ref === 'zoneCount') return [expr.zone];
    if (expr.ref === 'tokenProp') return [expr.token, expr.prop];
    if (expr.ref === 'assetField') return [expr.field];
    if (expr.ref === 'zoneProp') return [expr.zone, expr.prop];
    if (expr.ref === 'activePlayer' || expr.ref === 'activeSeat') return [];
    if (expr.ref === 'tokenZone') return [expr.token];
    if (expr.ref === 'zoneVar') return [expr.zone, expr.var];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Humanize a ConditionAST into a display string
// ---------------------------------------------------------------------------

function humanizeConditionInner(cond: ConditionAST, ctx: LabelContext, count?: number): string {
  if (typeof cond === 'boolean') return String(cond);
  const c = cond as Record<string, unknown>;

  if (c.op === 'and') {
    return (c.args as ConditionAST[]).map((a) => humanizeConditionInner(a, ctx, count)).join(' and ');
  }
  if (c.op === 'or') {
    return (c.args as ConditionAST[]).map((a) => humanizeConditionInner(a, ctx, count)).join(' or ');
  }
  if (c.op === 'not') {
    return `not ${humanizeConditionInner(c.arg as ConditionAST, ctx, count)}`;
  }
  if (c.op === 'in') {
    return `${humanizeValueExpr(c.item as ValueExpr, ctx, count)} in ${humanizeValueExpr(c.set as ValueExpr, ctx, count)}`;
  }
  if (c.op === 'adjacent' || c.op === 'connected') {
    return String(c.op);
  }
  if (c.op === 'zonePropIncludes') {
    return `${resolveLabel(c.prop as string, ctx, count)} includes ${humanizeValueExpr(c.value as ValueExpr, ctx, count)}`;
  }
  if (c.op === 'markerStateAllowed') {
    return `${resolveLabel(c.marker as string, ctx, count)} allows ${humanizeValueExpr(c.state as ValueExpr, ctx, count)}`;
  }

  // Comparison operators
  if (c.left !== undefined && c.right !== undefined) {
    const left = humanizeValueExpr(c.left as ValueExpr, ctx, count);
    const right = humanizeValueExpr(c.right as ValueExpr, ctx, count);
    const op = humanizeOperator(c.op as string);
    return `${left} ${op} ${right}`;
  }

  return '<condition>';
}

function humanizeOperator(op: string): string {
  switch (op) {
    case '==': return 'is';
    case '!=': return 'is not';
    case '>=': return '\u2265';
    case '<=': return '\u2264';
    case '>': return '>';
    case '<': return '<';
    default: return op;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Humanize a ConditionAST with a pre-built LabelContext (no suppression check).
 * Used by the realizer to re-render conditions on SelectMessage with full
 * label resolution, when the raw AST is available alongside the pre-rendered
 * filter string.
 */
export function humanizeConditionWithLabels(
  cond: ConditionAST,
  ctx: LabelContext,
  count?: number,
): string {
  return humanizeConditionInner(cond, ctx, count);
}

/**
 * Humanize a ConditionAST for display in modifier tooltips.
 * Returns null if the condition should be suppressed (references internal
 * variables like `__actionClass`, `$__macro_*`, tracking vars, etc.).
 */
export function humanizeCondition(
  cond: ConditionAST,
  ctx: NormalizerContext,
): string | null {
  const names = extractConditionNames(cond);

  // Suppress if any referenced name is internal/tracking
  for (const name of names) {
    if (isSuppressed(name, ctx.suppressPatterns)) return null;
    if (name.startsWith('$__macro_')) return null;
  }

  const labelCtx = buildLabelContext(ctx.verbalization);
  return humanizeConditionInner(cond, labelCtx);
}

/**
 * Resolve a modifier's condition+effect from pre-authored verbalization data.
 * Looks up modifierEffects[capabilityId] for matching conditions.
 * Returns null if the condition should be suppressed.
 * Falls back to auto-humanized condition with empty effect when no pre-authored text exists.
 */
export function resolveModifierEffect(
  cond: ConditionAST,
  ctx: NormalizerContext,
): { readonly condition: string; readonly effect: string } | null {
  const humanized = humanizeCondition(cond, ctx);
  if (humanized === null) return null;

  // Try to find pre-authored text from modifierEffects, narrowed by variable name
  if (ctx.verbalization !== undefined) {
    const modEffects = ctx.verbalization.modifierEffects;
    const condNames = extractConditionNames(cond);
    for (const name of condNames) {
      const entries = modEffects[name];
      if (entries === undefined) continue;
      for (const entry of entries) {
        if (entry.condition === humanized) {
          return { condition: entry.condition, effect: entry.effect };
        }
      }
    }
  }

  return { condition: humanized, effect: '' };
}

// ---------------------------------------------------------------------------
// Modifier role classification
// ---------------------------------------------------------------------------

/**
 * Match a name against a glob-like pattern with leading/trailing wildcards.
 * Supports patterns like `*Choice`, `Active Leader*`, `*Mode*`.
 */
export function matchesGlobPattern(name: string, pattern: string): boolean {
  const startsWild = pattern.startsWith('*');
  const endsWild = pattern.endsWith('*');
  const core = pattern.replace(/^\*|\*$/g, '');
  if (startsWild && endsWild) return name.includes(core);
  if (startsWild) return name.endsWith(core);
  if (endsWild) return name.startsWith(core);
  return name === pattern;
}

/**
 * Classify a modifier's semantic role based on condition variable names
 * and the verbalization configuration. Game-agnostic — patterns are
 * defined in VerbalizationDef.modifierClassification.
 */
export function classifyModifierRole(
  cond: ConditionAST,
  ctx: NormalizerContext,
): ModifierRole | undefined {
  if (ctx.verbalization === undefined) return undefined;

  const names = extractConditionNames(cond);
  const modEffects = ctx.verbalization.modifierEffects;
  const classification = ctx.verbalization.modifierClassification;

  // 1. If condition variable matches a key in modifierEffects → 'capability'
  for (const name of names) {
    if (modEffects[name] !== undefined) return 'capability';
  }

  if (classification !== undefined) {
    // 2. choiceFlowPatterns
    for (const name of names) {
      for (const pattern of classification.choiceFlowPatterns) {
        if (matchesGlobPattern(name, pattern)) return 'choiceFlow';
      }
    }

    // 3. leaderPatterns
    for (const name of names) {
      for (const pattern of classification.leaderPatterns) {
        if (matchesGlobPattern(name, pattern)) return 'leader';
      }
    }
  }

  // 4. Fallback
  return 'state';
}
