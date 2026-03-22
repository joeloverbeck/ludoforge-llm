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

export type PatternDescriptor =
  | SetVarPattern
  | AddVarPattern
  | IfPattern
  | ForEachPlayersPattern
  | GotoPhaseExactPattern;

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

export const classifyEffect = (node: EffectAST): PatternDescriptor | null =>
  matchSetVar(node)
  ?? matchAddVar(node)
  ?? matchIf(node)
  ?? matchForEachPlayers(node)
  ?? matchGotoPhaseExact(node);

const walkEffects = (
  effects: readonly EffectAST[],
  visit: (effect: EffectAST) => void,
): void => {
  for (const effect of effects) {
    visit(effect);
    if ('if' in effect) {
      walkEffects(effect.if.then, visit);
      if (effect.if.else !== undefined) {
        walkEffects(effect.if.else, visit);
      }
    }
    if ('forEach' in effect) {
      walkEffects(effect.forEach.effects, visit);
      if (effect.forEach.in !== undefined) {
        walkEffects(effect.forEach.in, visit);
      }
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
