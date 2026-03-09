/**
 * Core normalizer: converts EffectAST nodes into semantic TooltipMessage instances.
 * Handles variable effects (rules 1-8), token effects (rules 9-23b),
 * marker effects (rules 24-28). Delegates compound/control-flow effects
 * and macro override to tooltip-normalizer-compound.ts.
 */

import type { EffectAST, ZoneRef, NumericValueExpr, PlayerSel } from './types-ast.js';
import type { VerbalizationDef } from './verbalization-types.js';
import type { TooltipMessage, VarScope } from './tooltip-ir.js';
import { isSuppressed, isScaffoldingEffect } from './tooltip-suppression.js';
import { stringifyValueExpr, stringifyNumericExpr, stringifyZoneRef, stripMacroBindingPrefix } from './tooltip-value-stringifier.js';
import {
  normalizeChooseN,
  normalizeChooseOne,
  normalizeForEach,
  normalizeIf,
  normalizeRollRandom,
  normalizeRemoveByPriority,
  normalizeGrantFreeOperation,
  tryMacroOverride,
} from './tooltip-normalizer-compound.js';

export interface NormalizerContext {
  readonly verbalization: VerbalizationDef | undefined;
  readonly suppressPatterns: readonly string[];
  /** Label from a parent chooseOne branch, propagated to child chooseN for contextual "Select up to N X" */
  readonly choiceBranchLabel?: string;
}

/** Extract a single-key union member from EffectAST by its discriminant key. */
type EffectOf<K extends string> = Extract<EffectAST, Record<K, unknown>>;

const stringifyPlayerSel = (sel: PlayerSel): string => {
  if (typeof sel === 'string') return stripMacroBindingPrefix(sel);
  if ('id' in sel) return String(sel.id);
  if ('chosen' in sel) return stripMacroBindingPrefix(sel.chosen);
  if ('relative' in sel) return sel.relative;
  return '<player>';
};

type ScopeFields = {
  readonly scope?: VarScope;
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

  if (isNegativeLiteral(delta)) {
    return [{ kind: 'pay', resource: varName, amount: Math.abs(delta), ...scopeFields, astPath }];
  }

  if (isPositiveLiteral(delta)) {
    return [{ kind: 'gain', resource: varName, amount: delta, ...scopeFields, astPath }];
  }

  return [{ kind: 'set', target: varName, value: stringifyNumericExpr(delta), ...scopeFields, astPath }];
};

const normalizeSetVar = (
  payload: EffectOf<'setVar'>,
  ctx: NormalizerContext,
  astPath: string,
): readonly TooltipMessage[] => {
  const { var: varName, value } = payload.setVar;

  if (isSuppressed(varName, ctx.suppressPatterns)) {
    return [{ kind: 'suppressed', reason: `suppressed var: ${varName}`, astPath }];
  }

  const scopeFields = extractScopeFields(payload.setVar);

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
  const { token: rawToken, from, to } = payload.moveToken;
  const token = stripMacroBindingPrefix(rawToken);
  const fromStr = stringifyZoneRef(from);
  const toStr = stringifyZoneRef(to);

  if (isSupplyZone(fromStr)) {
    return [{ kind: 'place', tokenFilter: token, targetZone: toStr, astPath }];
  }

  if (isRemovalZone(toStr)) {
    return [{ kind: 'remove', tokenFilter: token, fromZone: fromStr, destination: toStr, astPath }];
  }

  return [{ kind: 'move', tokenFilter: token, fromZone: fromStr, toZone: toStr, astPath }];
};

const normalizeMoveTokenAdjacent = (
  payload: EffectOf<'moveTokenAdjacent'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token: rawToken, from } = payload.moveTokenAdjacent;
  const token = stripMacroBindingPrefix(rawToken);
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

  if (isSupplyZone(fromStr)) {
    return [{ kind: 'place', tokenFilter: '*', targetZone: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
  }

  if (isRemovalZone(toStr)) {
    return [{ kind: 'remove', tokenFilter: '*', fromZone: fromStr, destination: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
  }

  return [{ kind: 'move', tokenFilter: '*', fromZone: fromStr, toZone: toStr, ...(filterStr !== undefined ? { filter: filterStr } : {}), astPath }];
};

const normalizeSetTokenProp = (
  payload: EffectOf<'setTokenProp'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token: rawToken, prop, value } = payload.setTokenProp;
  const token = stripMacroBindingPrefix(rawToken);

  if (prop === 'activity') {
    const valueStr = stringifyValueExpr(value);
    if (valueStr === 'active' || valueStr === 'underground') {
      return [{ kind: 'activate', tokenFilter: token, zone: '', astPath }];
    }
    if (valueStr === 'inactive') {
      return [{ kind: 'deactivate', tokenFilter: token, zone: '', astPath }];
    }
  }

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
  const { type: rawType, zone } = payload.createToken;
  const type = stripMacroBindingPrefix(rawType);
  return [{ kind: 'create', tokenFilter: type, targetZone: stringifyZoneRef(zone), astPath }];
};

const normalizeDestroyToken = (
  payload: EffectOf<'destroyToken'>,
  astPath: string,
): readonly TooltipMessage[] => {
  const { token: rawToken } = payload.destroyToken;
  const token = stripMacroBindingPrefix(rawToken);
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

// --- Recursive helper (injected into compound normalizers) ---

const normalizeEffectList = (
  effects: readonly EffectAST[],
  ctx: NormalizerContext,
  basePath: string,
): readonly TooltipMessage[] =>
  effects.flatMap((child, i) => normalizeEffect(child, ctx, `${basePath}[${i}]`));

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

  // Macro override: highest priority for compound effects
  const macroResult = tryMacroOverride(effect, ctx, astPath);
  if (macroResult !== undefined) return macroResult;

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

  // Compound / control-flow rules (28-35) — delegated, with DI recurse callback
  if ('chooseN' in effect) return normalizeChooseN(effect, ctx, astPath);
  if ('chooseOne' in effect) return normalizeChooseOne(effect, astPath);
  if ('forEach' in effect) return normalizeForEach(effect, ctx, astPath, normalizeEffectList);
  if ('if' in effect) return normalizeIf(effect, ctx, astPath, normalizeEffectList);
  if ('rollRandom' in effect) return normalizeRollRandom(effect, ctx, astPath, normalizeEffectList);
  if ('removeByPriority' in effect) return normalizeRemoveByPriority(effect, ctx, astPath, normalizeEffectList);

  // Turn flow rule 41
  if ('grantFreeOperation' in effect) return normalizeGrantFreeOperation(effect, astPath);

  // Internal computation → suppressed
  if ('reduce' in effect) return [{ kind: 'suppressed', reason: 'internal computation: reduce', astPath }];

  // Fallback: unhandled effect
  return [{ kind: 'suppressed', reason: `unhandled: ${key}`, astPath }];
};
