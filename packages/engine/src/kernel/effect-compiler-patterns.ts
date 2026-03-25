import type {
  AddVarPayload,
  ConditionAST,
  EffectAST,
  NumericValueExpr,
  PlayerSel,
  ScopedVarNameExpr,
  SetVarPayload,
  ValueExpr,
} from './types.js';
import { EFFECT_KIND_TAG } from './types.js';

type ScalarLiteral = number | boolean | string;
type NumericScalarLiteral = number;

export type SimpleValuePattern =
  | { readonly kind: 'literal'; readonly value: ScalarLiteral }
  | { readonly kind: 'gvar'; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'pvar'; readonly player: PlayerSel; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'binding'; readonly name: string; readonly displayName?: string };

export type SimpleNumericValuePattern =
  | { readonly kind: 'literal'; readonly value: NumericScalarLiteral }
  | { readonly kind: 'gvar'; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'pvar'; readonly player: PlayerSel; readonly varName: ScopedVarNameExpr }
  | { readonly kind: 'binding'; readonly name: string; readonly displayName?: string };

export type SimpleScopedTargetPattern =
  | { readonly scope: 'global'; readonly varName: ScopedVarNameExpr }
  | { readonly scope: 'pvar'; readonly player: PlayerSel; readonly varName: ScopedVarNameExpr };

export interface SimpleComparisonPattern {
  readonly kind: 'comparison';
  readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
  readonly left: SimpleValuePattern;
  readonly right: SimpleValuePattern;
}

export interface LogicalConditionPattern {
  readonly kind: 'logical';
  readonly op: 'and' | 'or';
  readonly args: readonly CompilableConditionPattern[];
}

export type CompilableConditionPattern =
  | SimpleComparisonPattern
  | LogicalConditionPattern;

export type SetVarPattern = {
  readonly kind: 'setVar';
  readonly target: SimpleScopedTargetPattern;
  readonly value: SimpleValuePattern;
};

export type AddVarPattern = {
  readonly kind: 'addVar';
  readonly target: SimpleScopedTargetPattern;
  readonly delta: SimpleNumericValuePattern;
};

export type IfPattern = {
  readonly kind: 'if';
  readonly condition: CompilableConditionPattern;
  readonly thenEffects: readonly EffectAST[];
  readonly elseEffects: readonly EffectAST[];
};

export type ForEachPlayersPattern = {
  readonly kind: 'forEachPlayers';
  readonly bind: string;
  readonly effects: readonly EffectAST[];
  readonly limit?: NumericValueExpr;
  readonly countBind?: string;
  readonly inEffects?: readonly EffectAST[];
};

export type GotoPhaseExactPattern = {
  readonly kind: 'gotoPhaseExact';
  readonly phase: string;
};

type BindValuePayload = Extract<EffectAST, { readonly bindValue: unknown }>['bindValue'];
type TransferVarPayload = Extract<EffectAST, { readonly transferVar: unknown }>['transferVar'];
type LetPayload = Extract<EffectAST, { readonly let: unknown }>['let'];
type SetMarkerPayload = Extract<EffectAST, { readonly setMarker: unknown }>['setMarker'];
type ShiftMarkerPayload = Extract<EffectAST, { readonly shiftMarker: unknown }>['shiftMarker'];
type SetGlobalMarkerPayload = Extract<EffectAST, { readonly setGlobalMarker: unknown }>['setGlobalMarker'];
type FlipGlobalMarkerPayload = Extract<EffectAST, { readonly flipGlobalMarker: unknown }>['flipGlobalMarker'];
type ShiftGlobalMarkerPayload = Extract<EffectAST, { readonly shiftGlobalMarker: unknown }>['shiftGlobalMarker'];

export type BindValuePattern = {
  readonly kind: 'bindValue';
  readonly bind: BindValuePayload['bind'];
  readonly value: BindValuePayload['value'];
};

export type TransferVarPattern = {
  readonly kind: 'transferVar';
  readonly payload: TransferVarPayload;
};

export type LetPattern = {
  readonly kind: 'let';
  readonly bind: LetPayload['bind'];
  readonly value: LetPayload['value'];
  readonly inEffects: LetPayload['in'];
};

export type SetMarkerPattern = {
  readonly kind: 'setMarker';
  readonly payload: SetMarkerPayload;
};

export type ShiftMarkerPattern = {
  readonly kind: 'shiftMarker';
  readonly payload: ShiftMarkerPayload;
};

export type SetGlobalMarkerPattern = {
  readonly kind: 'setGlobalMarker';
  readonly payload: SetGlobalMarkerPayload;
};

export type FlipGlobalMarkerPattern = {
  readonly kind: 'flipGlobalMarker';
  readonly payload: FlipGlobalMarkerPayload;
};

export type ShiftGlobalMarkerPattern = {
  readonly kind: 'shiftGlobalMarker';
  readonly payload: ShiftGlobalMarkerPayload;
};

export type PatternDescriptor =
  | SetVarPattern
  | AddVarPattern
  | IfPattern
  | ForEachPlayersPattern
  | GotoPhaseExactPattern
  | BindValuePattern
  | TransferVarPattern
  | LetPattern
  | SetMarkerPattern
  | ShiftMarkerPattern
  | SetGlobalMarkerPattern
  | FlipGlobalMarkerPattern
  | ShiftGlobalMarkerPattern;

const isScalarLiteral = (expr: ValueExpr): expr is ScalarLiteral =>
  typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string';

const isNumericLiteral = (expr: NumericValueExpr): expr is NumericScalarLiteral =>
  typeof expr === 'number';

const isComparisonCondition = (
  condition: Exclude<ConditionAST, boolean>,
): condition is Extract<ConditionAST, { readonly op: SimpleComparisonPattern['op'] }> =>
  condition.op === '==' || condition.op === '!=' || condition.op === '<' || condition.op === '<=' || condition.op === '>' || condition.op === '>=';

export const matchSimpleValue = (expr: ValueExpr): SimpleValuePattern | null => {
  if (isScalarLiteral(expr)) {
    return { kind: 'literal', value: expr };
  }

  if (!('ref' in expr)) {
    return null;
  }

  if (expr.ref === 'gvar') {
    return { kind: 'gvar', varName: expr.var };
  }

  if (expr.ref === 'pvar') {
    return { kind: 'pvar', player: expr.player, varName: expr.var };
  }

  if (expr.ref === 'binding') {
    return { kind: 'binding', name: expr.name, ...(expr.displayName === undefined ? {} : { displayName: expr.displayName }) };
  }

  return null;
};

export const matchSimpleNumericValue = (expr: NumericValueExpr): SimpleNumericValuePattern | null => {
  if (isNumericLiteral(expr)) {
    return { kind: 'literal', value: expr };
  }

  if (!('ref' in expr)) {
    return null;
  }

  if (expr.ref === 'gvar') {
    return { kind: 'gvar', varName: expr.var };
  }

  if (expr.ref === 'pvar') {
    return { kind: 'pvar', player: expr.player, varName: expr.var };
  }

  if (expr.ref === 'binding') {
    return { kind: 'binding', name: expr.name, ...(expr.displayName === undefined ? {} : { displayName: expr.displayName }) };
  }

  return null;
};

export const matchSimpleScopedTarget = (
  payload: SetVarPayload | AddVarPayload,
): SimpleScopedTargetPattern | null => {
  if (payload.scope === 'global') {
    return { scope: 'global', varName: payload.var };
  }

  if (payload.scope === 'pvar') {
    return { scope: 'pvar', player: payload.player, varName: payload.var };
  }

  return null;
};

export const matchCompilableCondition = (
  condition: ConditionAST,
): CompilableConditionPattern | null => {
  if (typeof condition === 'boolean') {
    return null;
  }

  if (condition.op === 'and' || condition.op === 'or') {
    const args: CompilableConditionPattern[] = [];
    for (const entry of condition.args) {
      const matched = matchCompilableCondition(entry);
      if (matched === null) {
        return null;
      }
      args.push(matched);
    }
    return { kind: 'logical', op: condition.op, args };
  }

  if (!isComparisonCondition(condition)) {
    return null;
  }

  const left = matchSimpleValue(condition.left);
  const right = matchSimpleValue(condition.right);
  if (left === null || right === null) {
    return null;
  }

  return {
    kind: 'comparison',
    op: condition.op,
    left,
    right,
  };
};

export const isCompilableCondition = (condition: ConditionAST): boolean =>
  matchCompilableCondition(condition) !== null;

export const matchSetVar = (node: EffectAST): SetVarPattern | null => {
  if (!('setVar' in node)) {
    return null;
  }

  const target = matchSimpleScopedTarget(node.setVar);
  const value = matchSimpleValue(node.setVar.value);
  if (target === null || value === null) {
    return null;
  }

  return { kind: 'setVar', target, value };
};

export const matchAddVar = (node: EffectAST): AddVarPattern | null => {
  if (!('addVar' in node)) {
    return null;
  }

  const target = matchSimpleScopedTarget(node.addVar);
  const delta = matchSimpleNumericValue(node.addVar.delta);
  if (target === null || delta === null) {
    return null;
  }

  return { kind: 'addVar', target, delta };
};

export const matchIf = (node: EffectAST): IfPattern | null => {
  if (!('if' in node)) {
    return null;
  }

  const condition = matchCompilableCondition(node.if.when);
  if (condition === null) {
    return null;
  }

  return {
    kind: 'if',
    condition,
    thenEffects: node.if.then,
    elseEffects: node.if.else ?? [],
  };
};

export const matchForEachPlayers = (node: EffectAST): ForEachPlayersPattern | null => {
  if (!('forEach' in node) || node.forEach.over.query !== 'players') {
    return null;
  }

  return {
    kind: 'forEachPlayers',
    bind: node.forEach.bind,
    effects: node.forEach.effects,
    ...(node.forEach.limit === undefined ? {} : { limit: node.forEach.limit }),
    ...(node.forEach.countBind === undefined ? {} : { countBind: node.forEach.countBind }),
    ...(node.forEach.in === undefined ? {} : { inEffects: node.forEach.in }),
  };
};

export const matchGotoPhaseExact = (node: EffectAST): GotoPhaseExactPattern | null => {
  if (!('gotoPhaseExact' in node)) {
    return null;
  }

  return {
    kind: 'gotoPhaseExact',
    phase: node.gotoPhaseExact.phase,
  };
};

export const matchBindValue = (node: EffectAST): BindValuePattern | null => {
  if (!('bindValue' in node)) {
    return null;
  }

  return {
    kind: 'bindValue',
    bind: node.bindValue.bind,
    value: node.bindValue.value,
  };
};

export const matchTransferVar = (node: EffectAST): TransferVarPattern | null => {
  if (!('transferVar' in node)) {
    return null;
  }

  return {
    kind: 'transferVar',
    payload: node.transferVar,
  };
};

export const matchLet = (node: EffectAST): LetPattern | null => {
  if (!('let' in node)) {
    return null;
  }

  return {
    kind: 'let',
    bind: node.let.bind,
    value: node.let.value,
    inEffects: node.let.in,
  };
};

export const matchSetMarker = (node: EffectAST): SetMarkerPattern | null => {
  if (!('setMarker' in node)) {
    return null;
  }

  return {
    kind: 'setMarker',
    payload: node.setMarker,
  };
};

export const matchShiftMarker = (node: EffectAST): ShiftMarkerPattern | null => {
  if (!('shiftMarker' in node)) {
    return null;
  }

  return {
    kind: 'shiftMarker',
    payload: node.shiftMarker,
  };
};

export const matchSetGlobalMarker = (node: EffectAST): SetGlobalMarkerPattern | null => {
  if (!('setGlobalMarker' in node)) {
    return null;
  }

  return {
    kind: 'setGlobalMarker',
    payload: node.setGlobalMarker,
  };
};

export const matchFlipGlobalMarker = (node: EffectAST): FlipGlobalMarkerPattern | null => {
  if (!('flipGlobalMarker' in node)) {
    return null;
  }

  return {
    kind: 'flipGlobalMarker',
    payload: node.flipGlobalMarker,
  };
};

export const matchShiftGlobalMarker = (node: EffectAST): ShiftGlobalMarkerPattern | null => {
  if (!('shiftGlobalMarker' in node)) {
    return null;
  }

  return {
    kind: 'shiftGlobalMarker',
    payload: node.shiftGlobalMarker,
  };
};

/*
 * Effect compilation status by EFFECT_KIND_TAG (34 tags, 0-33):
 *
 *  0  setVar              — compiled (Phase 0)
 *  1  addVar              — compiled (Phase 0)
 *  2  setActivePlayer     — stub (Phase 1)
 *  3  transferVar         — compiled (Phase 1)
 *  4  moveToken           — stub (Phase 2)
 *  5  moveAll             — stub (Phase 2)
 *  6  moveTokenAdjacent   — stub (Phase 2)
 *  7  draw                — stub (Phase 2)
 *  8  shuffle             — stub (Phase 2)
 *  9  createToken         — stub (Phase 2)
 * 10  destroyToken        — stub (Phase 2)
 * 11  setTokenProp        — stub (Phase 2)
 * 12  reveal              — stub (Phase 4)
 * 13  conceal             — stub (Phase 4)
 * 14  bindValue           — compiled (Phase 1)
 * 15  chooseOne           — stub (Phase 6)
 * 16  chooseN             — stub (Phase 6)
 * 17  setMarker           — stub (Phase 1)
 * 18  shiftMarker         — stub (Phase 1)
 * 19  setGlobalMarker     — stub (Phase 1)
 * 20  flipGlobalMarker    — stub (Phase 1)
 * 21  shiftGlobalMarker   — stub (Phase 1)
 * 22  grantFreeOperation  — deferred (action-context-heavy, future spec)
 * 23  gotoPhaseExact      — compiled (Phase 0)
 * 24  advancePhase        — stub (Phase 1)
 * 25  pushInterruptPhase  — stub (Phase 5)
 * 26  popInterruptPhase   — stub (Phase 1)
 * 27  rollRandom          — stub (Phase 5)
 * 28  if                  — compiled (Phase 0)
 * 29  forEach             — compiled (Phase 0, players-only; general in Phase 3)
 * 30  reduce              — stub (Phase 3)
 * 31  removeByPriority    — stub (Phase 3)
 * 32  let                 — compiled (Phase 1)
 * 33  evaluateSubset      — stub (Phase 5)
 */
export const classifyEffect = (node: EffectAST): PatternDescriptor | null => {
  switch (node._k) {
    case EFFECT_KIND_TAG.setVar:
      return matchSetVar(node);
    case EFFECT_KIND_TAG.addVar:
      return matchAddVar(node);
    case EFFECT_KIND_TAG.if:
      return matchIf(node);
    case EFFECT_KIND_TAG.forEach:
      return matchForEachPlayers(node);
    case EFFECT_KIND_TAG.gotoPhaseExact:
      return matchGotoPhaseExact(node);
    case EFFECT_KIND_TAG.bindValue:
      return matchBindValue(node);
    case EFFECT_KIND_TAG.transferVar:
      return matchTransferVar(node);
    case EFFECT_KIND_TAG.let:
      return matchLet(node);
    case EFFECT_KIND_TAG.setMarker:
      return matchSetMarker(node);
    case EFFECT_KIND_TAG.shiftMarker:
      return matchShiftMarker(node);
    case EFFECT_KIND_TAG.setGlobalMarker:
      return matchSetGlobalMarker(node);
    case EFFECT_KIND_TAG.flipGlobalMarker:
      return matchFlipGlobalMarker(node);
    case EFFECT_KIND_TAG.shiftGlobalMarker:
      return matchShiftGlobalMarker(node);
    // Deferred: action-context-heavy, depends on __freeOperation/__actionClass
    // bindings only available during the operation pipeline. See Spec 81.
    case EFFECT_KIND_TAG.grantFreeOperation:
      return null;
    // Not-yet-compiled lifecycle tags — stubs for future tickets (002-009)
    case EFFECT_KIND_TAG.setActivePlayer:
    case EFFECT_KIND_TAG.advancePhase:
    case EFFECT_KIND_TAG.popInterruptPhase:
    case EFFECT_KIND_TAG.moveToken:
    case EFFECT_KIND_TAG.moveAll:
    case EFFECT_KIND_TAG.moveTokenAdjacent:
    case EFFECT_KIND_TAG.draw:
    case EFFECT_KIND_TAG.shuffle:
    case EFFECT_KIND_TAG.createToken:
    case EFFECT_KIND_TAG.destroyToken:
    case EFFECT_KIND_TAG.setTokenProp:
    case EFFECT_KIND_TAG.reveal:
    case EFFECT_KIND_TAG.conceal:
    case EFFECT_KIND_TAG.reduce:
    case EFFECT_KIND_TAG.removeByPriority:
    case EFFECT_KIND_TAG.rollRandom:
    case EFFECT_KIND_TAG.pushInterruptPhase:
    case EFFECT_KIND_TAG.evaluateSubset:
    case EFFECT_KIND_TAG.chooseOne:
    case EFFECT_KIND_TAG.chooseN:
      return null;
    default:
      return null;
  }
};

const walkEffects = (
  effects: readonly EffectAST[],
  visit: (effect: EffectAST) => void,
): void => {
  for (const effect of effects) {
    visit(effect);
    switch (effect._k) {
      case EFFECT_KIND_TAG.if:
        walkEffects(effect.if.then, visit);
        if (effect.if.else !== undefined) {
          walkEffects(effect.if.else, visit);
        }
        break;
      case EFFECT_KIND_TAG.forEach:
        walkEffects(effect.forEach.effects, visit);
        if (effect.forEach.in !== undefined) {
          walkEffects(effect.forEach.in, visit);
        }
        break;
      case EFFECT_KIND_TAG.let:
        walkEffects(effect.let.in, visit);
        break;
      case EFFECT_KIND_TAG.reduce:
        walkEffects(effect.reduce.in, visit);
        break;
      case EFFECT_KIND_TAG.rollRandom:
        walkEffects(effect.rollRandom.in, visit);
        break;
      case EFFECT_KIND_TAG.evaluateSubset:
        walkEffects(effect.evaluateSubset.compute, visit);
        walkEffects(effect.evaluateSubset.in, visit);
        break;
      case EFFECT_KIND_TAG.removeByPriority:
        if (effect.removeByPriority.in !== undefined) {
          walkEffects(effect.removeByPriority.in, visit);
        }
        break;
      default:
        break;
    }
  }
};

export const computeCoverageRatio = (effects: readonly EffectAST[]): number => {
  if (effects.length === 0) {
    return 1;
  }

  let total = 0;
  let compilable = 0;
  walkEffects(effects, (effect) => {
    total += 1;
    if (classifyEffect(effect) !== null) {
      compilable += 1;
    }
  });

  return total === 0 ? 1 : compilable / total;
};
