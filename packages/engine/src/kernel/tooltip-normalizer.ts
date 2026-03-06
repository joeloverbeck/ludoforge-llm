/**
 * Core normalizer: converts leaf EffectAST nodes into semantic TooltipMessage instances.
 * Handles variable effects (rules 1-8), token effects (rules 9-23b),
 * and marker effects (rules 24-28). Compound/control-flow effects are
 * handled by LEGACTTOO-005.
 */

import type { EffectAST, ValueExpr, ZoneRef, NumericValueExpr, PlayerSel } from './types-ast.js';
import type { VerbalizationDef } from './verbalization-types.js';
import type { TooltipMessage } from './tooltip-ir.js';
import { isSuppressed, isScaffoldingEffect } from './tooltip-suppression.js';

export interface NormalizerContext {
  readonly verbalization: VerbalizationDef | undefined;
  readonly suppressPatterns: readonly string[];
}

/** Extract a single-key union member from EffectAST by its discriminant key. */
type EffectOf<K extends string> = Extract<EffectAST, Record<K, unknown>>;

const stringifyZoneRef = (ref: ZoneRef): string =>
  typeof ref === 'string' ? ref : '<expr>';

const stringifyPlayerSel = (sel: PlayerSel): string => {
  if (typeof sel === 'string') return sel;
  if ('id' in sel) return String(sel.id);
  if ('chosen' in sel) return sel.chosen;
  if ('relative' in sel) return sel.relative;
  return '<player>';
};

const stringifyValueExpr = (expr: ValueExpr): string => {
  if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);
  if (typeof expr === 'string') return expr;
  if ('ref' in expr) {
    if (expr.ref === 'binding') return expr.name;
    if (expr.ref === 'gvar') return expr.var;
    if (expr.ref === 'pvar') return expr.var;
    if (expr.ref === 'globalMarkerState') return expr.marker;
    return '<ref>';
  }
  return '<expr>';
};

const stringifyNumericExpr = (expr: NumericValueExpr): string => {
  if (typeof expr === 'number') return String(expr);
  return stringifyValueExpr(expr as ValueExpr);
};

type ScopeFields = {
  readonly scope?: 'global' | 'player' | 'zone';
  readonly scopeOwner?: string;
};

const extractScopeFields = (payload: { readonly scope: string; readonly player?: PlayerSel; readonly zone?: ZoneRef }): ScopeFields => {
  if (payload.scope === 'pvar' && payload.player !== undefined) {
    return { scope: 'player', scopeOwner: stringifyPlayerSel(payload.player) };
  }
  if (payload.scope === 'zoneVar' && payload.zone !== undefined) {
    return { scope: 'zone', scopeOwner: stringifyZoneRef(payload.zone) };
  }
  return {};
};

const isNegativeLiteral = (delta: NumericValueExpr): delta is number =>
  typeof delta === 'number' && delta < 0;

const isPositiveLiteral = (delta: NumericValueExpr): delta is number =>
  typeof delta === 'number' && delta > 0;

const isSupplyZone = (zone: string): boolean =>
  zone.startsWith('available-');

const isRemovalZone = (zone: string): boolean =>
  zone.startsWith('available-') || zone.startsWith('casualties-');

const getEffectKey = (effect: EffectAST): string =>
  Object.keys(effect)[0] ?? '';

// --- Variable rules (1-8) ---

const normalizeAddVar = (
  payload: EffectOf<'addVar'>,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] => {
  const { var: varName, delta } = payload.addVar;

  if (isSuppressed(varName, ctx.suppressPatterns)) {
    return [{ kind: 'suppressed', reason: `suppressed var: ${varName}`, astPath }];
  }

  const scopeFields = extractScopeFields(payload.addVar);

  // Rule 1: negative literal → pay
  if (isNegativeLiteral(delta)) {
    return [{ kind: 'pay', resource: varName, amount: Math.abs(delta), ...scopeFields, astPath }];
  }

  // Rule 2: positive literal → gain
  if (isPositiveLiteral(delta)) {
    return [{ kind: 'gain', resource: varName, amount: delta, ...scopeFields, astPath }];
  }

  // Rule 8: non-literal expression → generic set
  return [{ kind: 'set', target: varName, value: stringifyNumericExpr(delta), ...scopeFields, astPath }];
};

const normalizeSetVar = (
  payload: EffectOf<'setVar'>,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] => {
  const { var: varName, value } = payload.setVar;

  // Rules 4-6: suppressed variable
  if (isSuppressed(varName, ctx.suppressPatterns)) {
    return [{ kind: 'suppressed', reason: `suppressed var: ${varName}`, astPath }];
  }

  const scopeFields = extractScopeFields(payload.setVar);

  // Rule 7: generic set
  return [{ kind: 'set', target: varName, value: stringifyValueExpr(value), ...scopeFields, astPath }];
};

const normalizeTransferVar = (
  payload: EffectOf<'transferVar'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { from, to, amount } = payload.transferVar;
  const numAmount = typeof amount === 'number' ? amount : 0;
  const amountExpr = typeof amount === 'number' ? undefined : stringifyNumericExpr(amount);
  const fromScope = extractScopeFields(from);
  const toScope = extractScopeFields(to);
  return [{
    kind: 'transfer',
    resource: from.var,
    amount: numAmount,
    from: from.var,
    to: to.var,
    ...(amountExpr !== undefined ? { amountExpr } : {}),
    ...(fromScope.scope !== undefined ? { fromScope: fromScope.scope, fromScopeOwner: fromScope.scopeOwner } : {}),
    ...(toScope.scope !== undefined ? { toScope: toScope.scope, toScopeOwner: toScope.scopeOwner } : {}),
    astPath,
  }];
};

// --- Token rules (9-23b) ---

const normalizeMoveToken = (
  payload: EffectOf<'moveToken'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token, from, to } = payload.moveToken;
  const fromStr = stringifyZoneRef(from);
  const toStr = stringifyZoneRef(to);

  // Rule 9: from supply zone → place
  if (isSupplyZone(fromStr)) {
    return [{ kind: 'place', tokenFilter: token, targetZone: toStr, astPath }];
  }

  // Rule 10: to supply/casualties zone → remove
  if (isRemovalZone(toStr)) {
    return [{ kind: 'remove', tokenFilter: token, fromZone: fromStr, destination: toStr, astPath }];
  }

  // Rule 12: generic move
  return [{ kind: 'move', tokenFilter: token, fromZone: fromStr, toZone: toStr, astPath }];
};

const normalizeMoveTokenAdjacent = (
  payload: EffectOf<'moveTokenAdjacent'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token, from } = payload.moveTokenAdjacent;
  return [{
    kind: 'move',
    tokenFilter: token,
    fromZone: stringifyZoneRef(from),
    toZone: '<adjacent>',
    variant: 'adjacent',
    astPath,
  }];
};

const normalizeMoveAll = (
  payload: EffectOf<'moveAll'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { from, to, filter } = payload.moveAll;
  const fromStr = stringifyZoneRef(from);
  const toStr = stringifyZoneRef(to);
  const filterStr = filter !== undefined ? '<condition>' : undefined;

  // Rule 21: from supply → place
  if (isSupplyZone(fromStr)) {
    return [{ kind: 'place', tokenFilter: '*', targetZone: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
  }

  // Rule 22: to supply/casualties → remove
  if (isRemovalZone(toStr)) {
    return [{ kind: 'remove', tokenFilter: '*', fromZone: fromStr, destination: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
  }

  // Rule 23: generic move
  return [{ kind: 'move', tokenFilter: '*', fromZone: fromStr, toZone: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
};

const normalizeSetTokenProp = (
  payload: EffectOf<'setTokenProp'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token, prop, value } = payload.setTokenProp;

  if (prop === 'activity') {
    const valueStr = stringifyValueExpr(value);
    // Rule 13: active/underground → activate
    if (valueStr === 'active' || valueStr === 'underground') {
      return [{ kind: 'activate', tokenFilter: token, zone: '', astPath }];
    }
    // Rule 14: inactive → deactivate
    if (valueStr === 'inactive') {
      return [{ kind: 'deactivate', tokenFilter: token, zone: '', astPath }];
    }
  }

  // Rule 15: generic property set
  return [{
    kind: 'set',
    target: `${token}.${prop}`,
    value: stringifyValueExpr(value),
    astPath,
  }];
};

const normalizeCreateToken = (
  payload: EffectOf<'createToken'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { type, zone } = payload.createToken;
  return [{ kind: 'create', tokenFilter: type, targetZone: stringifyZoneRef(zone), astPath }];
};

const normalizeDestroyToken = (
  payload: EffectOf<'destroyToken'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token } = payload.destroyToken;
  return [{ kind: 'destroy', tokenFilter: token, fromZone: '', astPath }];
};

const normalizeDraw = (
  payload: EffectOf<'draw'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { from, count } = payload.draw;
  return [{ kind: 'draw', source: stringifyZoneRef(from), count, astPath }];
};

const normalizeReveal = (
  payload: EffectOf<'reveal'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { zone } = payload.reveal;
  return [{ kind: 'reveal', target: stringifyZoneRef(zone), astPath }];
};

const normalizeConceal = (
  payload: EffectOf<'conceal'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { zone } = payload.conceal;
  return [{ kind: 'conceal', target: stringifyZoneRef(zone), astPath }];
};

const normalizeShuffle = (
  payload: EffectOf<'shuffle'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { zone } = payload.shuffle;
  return [{ kind: 'shuffle', target: stringifyZoneRef(zone), astPath }];
};

// --- Marker rules (24-28) ---

const normalizeShiftMarker = (
  payload: EffectOf<'shiftMarker'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { marker, delta } = payload.shiftMarker;
  const numDelta = typeof delta === 'number' ? delta : 0;
  const deltaExpr = typeof delta === 'number' ? undefined : stringifyNumericExpr(delta);
  return [{
    kind: 'shift',
    marker,
    direction: numDelta >= 0 ? '+' : '-',
    amount: Math.abs(numDelta),
    ...(deltaExpr !== undefined ? { deltaExpr } : {}),
    astPath,
  }];
};

const normalizeSetMarker = (
  payload: EffectOf<'setMarker'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { marker, state } = payload.setMarker;
  return [{ kind: 'set', target: marker, value: stringifyValueExpr(state), astPath }];
};

const normalizeSetGlobalMarker = (
  payload: EffectOf<'setGlobalMarker'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { marker, state } = payload.setGlobalMarker;
  return [{ kind: 'set', target: marker, value: stringifyValueExpr(state), astPath }];
};

const normalizeFlipGlobalMarker = (
  payload: EffectOf<'flipGlobalMarker'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { marker, stateA, stateB } = payload.flipGlobalMarker;
  return [{
    kind: 'set',
    target: stringifyValueExpr(marker),
    value: `${stringifyValueExpr(stateA)}/${stringifyValueExpr(stateB)}`,
    toggle: true,
    astPath,
  }];
};

const normalizeShiftGlobalMarker = (
  payload: EffectOf<'shiftGlobalMarker'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { marker, delta } = payload.shiftGlobalMarker;
  const numDelta = typeof delta === 'number' ? delta : 0;
  const deltaExpr = typeof delta === 'number' ? undefined : stringifyNumericExpr(delta);
  return [{
    kind: 'shift',
    marker,
    direction: numDelta >= 0 ? '+' : '-',
    amount: Math.abs(numDelta),
    ...(deltaExpr !== undefined ? { deltaExpr } : {}),
    astPath,
  }];
};

// --- Main entry point ---

export const normalizeEffect = (
  effect: EffectAST,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] => {
  const key = getEffectKey(effect);

  // Scaffolding/turn-machinery effects → suppressed
  if (isScaffoldingEffect(key)) {
    return [{ kind: 'suppressed', reason: `scaffolding: ${key}`, astPath }];
  }

  // Variable effects (rules 1-8)
  if ('addVar' in effect) return normalizeAddVar(effect, ctx, astPath);
  if ('setVar' in effect) return normalizeSetVar(effect, ctx, astPath);
  if ('transferVar' in effect) return normalizeTransferVar(effect, astPath);

  // Token effects (rules 9-23b)
  if ('moveToken' in effect) return normalizeMoveToken(effect, astPath);
  if ('moveTokenAdjacent' in effect) return normalizeMoveTokenAdjacent(effect, astPath);
  if ('moveAll' in effect) return normalizeMoveAll(effect, astPath);
  if ('setTokenProp' in effect) return normalizeSetTokenProp(effect, astPath);
  if ('createToken' in effect) return normalizeCreateToken(effect, astPath);
  if ('destroyToken' in effect) return normalizeDestroyToken(effect, astPath);
  if ('draw' in effect) return normalizeDraw(effect, astPath);
  if ('reveal' in effect) return normalizeReveal(effect, astPath);
  if ('conceal' in effect) return normalizeConceal(effect, astPath);
  if ('shuffle' in effect) return normalizeShuffle(effect, astPath);

  // Marker effects (rules 24-28)
  if ('shiftMarker' in effect) return normalizeShiftMarker(effect, astPath);
  if ('setMarker' in effect) return normalizeSetMarker(effect, astPath);
  if ('setGlobalMarker' in effect) return normalizeSetGlobalMarker(effect, astPath);
  if ('flipGlobalMarker' in effect) return normalizeFlipGlobalMarker(effect, astPath);
  if ('shiftGlobalMarker' in effect) return normalizeShiftGlobalMarker(effect, astPath);

  // Rule 29: unhandled effects (compound/control-flow → LEGACTTOO-005)
  return [{ kind: 'suppressed', reason: `unhandled: ${key}`, astPath }];
};
