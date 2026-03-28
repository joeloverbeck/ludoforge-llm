import type { PlayerId } from './branded.js';
import { missingBindingError, missingVarError, typeMismatchError } from './eval-error.js';
import { resolveBindingTemplate } from './binding-template.js';
import type { EnumerationStateSnapshot } from './enumeration-snapshot.js';
import { tryStaticScopedVarNameExpr } from './scoped-var-name-resolution.js';
import type { ConditionAST, ScalarArrayValue, ScalarValue, ValueExpr, GameState } from './types.js';

export type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
  snapshot?: EnumerationStateSnapshot,
) => boolean;

export type CompiledConditionValueAccessor = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
  snapshot?: EnumerationStateSnapshot,
) => ScalarValue | ScalarArrayValue;

type ComparisonCondition = Extract<ConditionAST, { readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=' }>;
type AggregateCountExpr = Extract<ValueExpr, { readonly _t: 5; readonly aggregate: { readonly op: 'count' } }>;

const isScalarValue = (value: unknown): value is ScalarValue =>
  typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';

const isScalarArrayValue = (value: unknown): value is ScalarArrayValue =>
  Array.isArray(value) && value.every((entry) => isScalarValue(entry));

const compileZoneCountAccessor = (zoneId: string, context: ValueExpr): CompiledConditionValueAccessor =>
  (state, _activePlayer, _bindings, snapshot) => {
    if (snapshot !== undefined) {
      return snapshot.zoneTotals.get(zoneId);
    }

    const zoneTokens = state.zones[zoneId];
    if (zoneTokens === undefined) {
      throw missingVarError(`Zone state not found for selector result: ${zoneId}`, {
        reference: context,
        zoneId,
        availableZoneIds: Object.keys(state.zones).sort(),
      });
    }

    return zoneTokens.length;
  };

const compileReferenceAccessor = (expr: Extract<ValueExpr, { readonly _t: 2 }>): CompiledConditionValueAccessor | null => {
  switch (expr.ref) {
    case 'gvar': {
      const variableName = tryStaticScopedVarNameExpr(expr.var);
      if (variableName === null) {
        return null;
      }
      return (state, _activePlayer, _bindings, snapshot) => {
        const value = snapshot === undefined
          ? state.globalVars[variableName]
          : snapshot.globalVars[variableName];
        if (value === undefined) {
          throw missingVarError(`Global variable not found: ${variableName}`, {
            reference: expr,
            var: variableName,
            availableGlobalVars: Object.keys(state.globalVars).sort(),
          });
        }
        return value;
      };
    }

    case 'pvar': {
      if (expr.player !== 'active') {
        return null;
      }
      const variableName = tryStaticScopedVarNameExpr(expr.var);
      if (variableName === null) {
        return null;
      }
      return (state, activePlayer, _bindings, snapshot) => {
        const playerVars = snapshot?.perPlayerVars[activePlayer] ?? state.perPlayerVars[activePlayer];
        if (playerVars === undefined) {
          throw missingVarError(`Per-player vars missing for player ${activePlayer}`, {
            reference: expr,
            playerId: activePlayer,
            availablePlayers: Object.keys(state.perPlayerVars).sort(),
          });
        }

        const value = playerVars[variableName];
        if (value === undefined) {
          throw missingVarError(`Per-player variable not found: ${variableName}`, {
            reference: expr,
            playerId: activePlayer,
            var: variableName,
            availablePlayerVars: Object.keys(playerVars).sort(),
          });
        }

        return value;
      };
    }

    case 'binding':
      return (_state, _activePlayer, bindings) => {
        const resolvedName = resolveBindingTemplate(expr.name, bindings);
        const value = bindings[resolvedName];
        if (value === undefined) {
          throw missingBindingError(`Binding not found: ${resolvedName}`, {
            reference: expr,
            binding: resolvedName,
            bindingTemplate: expr.name,
            availableBindings: Object.keys(bindings).sort(),
          });
        }

        if (!isScalarValue(value) && !isScalarArrayValue(value)) {
          throw typeMismatchError(`Binding ${resolvedName} must resolve to number | boolean | string | scalar-array`, {
            reference: expr,
            binding: resolvedName,
            actualType: typeof value,
            value,
          });
        }

        return value;
      };

    default:
      return null;
  }
};

const compileAggregateCountAccessor = (
  expr: AggregateCountExpr,
): CompiledConditionValueAccessor | null => {
  const query = expr.aggregate.query;
  if (query.query !== 'tokensInZone' || query.filter !== undefined || typeof query.zone !== 'string') {
    return null;
  }

  return compileZoneCountAccessor(query.zone, expr);
};

const expectOrderingNumber = (
  value: ScalarValue | ScalarArrayValue,
  side: 'left' | 'right',
  cond: ComparisonCondition,
): number => {
  if (typeof value !== 'number') {
    throw typeMismatchError('Ordering comparisons require numeric operands', {
      cond,
      side,
      actualType: typeof value,
      value,
    });
  }
  return value;
};

const compileComparison = (
  op: ComparisonCondition['op'],
  leftAccessor: CompiledConditionValueAccessor,
  rightAccessor: CompiledConditionValueAccessor,
  cond: ComparisonCondition,
): CompiledConditionPredicate => {
  switch (op) {
    case '==':
      return (state, activePlayer, bindings, snapshot) =>
        leftAccessor(state, activePlayer, bindings, snapshot) === rightAccessor(state, activePlayer, bindings, snapshot);
    case '!=':
      return (state, activePlayer, bindings, snapshot) =>
        leftAccessor(state, activePlayer, bindings, snapshot) !== rightAccessor(state, activePlayer, bindings, snapshot);
    case '<':
      return (state, activePlayer, bindings, snapshot) =>
        expectOrderingNumber(leftAccessor(state, activePlayer, bindings, snapshot), 'left', cond)
        < expectOrderingNumber(rightAccessor(state, activePlayer, bindings, snapshot), 'right', cond);
    case '<=':
      return (state, activePlayer, bindings, snapshot) =>
        expectOrderingNumber(leftAccessor(state, activePlayer, bindings, snapshot), 'left', cond)
        <= expectOrderingNumber(rightAccessor(state, activePlayer, bindings, snapshot), 'right', cond);
    case '>':
      return (state, activePlayer, bindings, snapshot) =>
        expectOrderingNumber(leftAccessor(state, activePlayer, bindings, snapshot), 'left', cond)
        > expectOrderingNumber(rightAccessor(state, activePlayer, bindings, snapshot), 'right', cond);
    case '>=':
      return (state, activePlayer, bindings, snapshot) =>
        expectOrderingNumber(leftAccessor(state, activePlayer, bindings, snapshot), 'left', cond)
        >= expectOrderingNumber(rightAccessor(state, activePlayer, bindings, snapshot), 'right', cond);
  }
};

export const tryCompileValueExpr = (
  expr: ValueExpr,
): CompiledConditionValueAccessor | null => {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return () => expr;
  }

  switch (expr._t) {
    case 2:
      return compileReferenceAccessor(expr as Extract<ValueExpr, { readonly _t: 2 }>);
    case 5:
      if (expr.aggregate.op !== 'count') {
        return null;
      }
      return compileAggregateCountAccessor(expr as AggregateCountExpr);
    default:
      return null;
  }
};

export const tryCompileCondition = (
  cond: ConditionAST,
): CompiledConditionPredicate | null => {
  if (typeof cond === 'boolean') {
    return () => cond;
  }

  switch (cond.op) {
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const leftAccessor = tryCompileValueExpr(cond.left);
      const rightAccessor = tryCompileValueExpr(cond.right);
      if (leftAccessor === null || rightAccessor === null) {
        return null;
      }
      return compileComparison(cond.op, leftAccessor, rightAccessor, cond);
    }

    case 'and': {
      const compiledArgs: CompiledConditionPredicate[] = [];
      for (const arg of cond.args) {
        const compiledArg = tryCompileCondition(arg);
        if (compiledArg === null) {
          return null;
        }
        compiledArgs.push(compiledArg);
      }
      return (state, activePlayer, bindings, snapshot) =>
        compiledArgs.every((arg) => arg(state, activePlayer, bindings, snapshot));
    }

    case 'or': {
      const compiledArgs: CompiledConditionPredicate[] = [];
      for (const arg of cond.args) {
        const compiledArg = tryCompileCondition(arg);
        if (compiledArg === null) {
          return null;
        }
        compiledArgs.push(compiledArg);
      }
      return (state, activePlayer, bindings, snapshot) =>
        compiledArgs.some((arg) => arg(state, activePlayer, bindings, snapshot));
    }

    case 'not': {
      const compiledArg = tryCompileCondition(cond.arg);
      if (compiledArg === null) {
        return null;
      }
      return (state, activePlayer, bindings, snapshot) => !compiledArg(state, activePlayer, bindings, snapshot);
    }

    default:
      return null;
  }
};
