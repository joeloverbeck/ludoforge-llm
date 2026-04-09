import type { PlayerId } from './branded.js';
import { getLatticeMap, getZoneMap } from './def-lookup.js';
import { divisionByZeroError, missingBindingError, missingVarError, typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import type { ReadContext } from './eval-context.js';
import { resolveBindingTemplate } from './binding-template.js';
import type { EnumerationStateSnapshot } from './enumeration-snapshot.js';
import { matchesMembership } from './query-predicate.js';
import { resolveMapSpaceId } from './resolve-selectors.js';
import { tryStaticScopedVarNameExpr } from './scoped-var-name-resolution.js';
import { isSpaceMarkerStateAllowed, resolveSpaceMarkerShift } from './space-marker-rules.js';
import { getTokenStateIndexEntry } from './token-state-index.js';
import { resolveRuntimeTokenBindingValue } from './token-binding.js';
import { resolveTokenViewFieldValue } from './token-view.js';
import { evalCondition } from './eval-condition.js';
import type { ConditionAST, ScalarArrayValue, ScalarValue, ValueExpr } from './types.js';

export type CompiledConditionPredicate = (
  ctx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
) => boolean;

export type CompiledConditionValueAccessor = (
  ctx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
) => ScalarValue | ScalarArrayValue;

type ComparisonCondition = Extract<ConditionAST, { readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=' }>;
type AggregateCountExpr = Extract<ValueExpr, { readonly _t: 5; readonly aggregate: { readonly op: 'count' } }>;
type ConcatExpr = Extract<ValueExpr, { readonly _t: 3 }>;
type IfValueExpr = Extract<ValueExpr, { readonly _t: 4 }>;
type ArithmeticExpr = Extract<ValueExpr, { readonly _t: 6 }>;

const isScalarValue = (value: unknown): value is ScalarValue =>
  typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';

const isScalarArrayValue = (value: unknown): value is ScalarArrayValue =>
  Array.isArray(value) && value.every((entry) => isScalarValue(entry));

const isSafeIntegerNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value);

const expectSafeInteger = (value: unknown, message: string, context: Readonly<Record<string, unknown>>): number => {
  if (!isSafeIntegerNumber(value)) {
    throw typeMismatchError(message, context);
  }

  return value;
};

const compileZoneCountAccessor = (zoneId: string, context: ValueExpr): CompiledConditionValueAccessor =>
  (ctx, snapshot) => {
    if (snapshot !== undefined) {
      return snapshot.zoneTotals.get(zoneId);
    }

    const zoneTokens = ctx.state.zones[zoneId];
    if (zoneTokens === undefined) {
      throw missingVarError(`Zone state not found for selector result: ${zoneId}`, {
        reference: context,
        zoneId,
        availableZoneIds: Object.keys(ctx.state.zones).sort(),
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
      return (ctx, snapshot) => {
        const value = snapshot === undefined
          ? ctx.state.globalVars[variableName]
          : snapshot.globalVars[variableName];
        if (value === undefined) {
          throw missingVarError(`Global variable not found: ${variableName}`, {
            reference: expr,
            var: variableName,
            availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
          });
        }
        return value;
      };
    }

    case 'pvar': {
      const fixedPlayerId =
        typeof expr.player === 'object' && expr.player !== null && 'id' in expr.player
          ? expr.player.id
          : null;
      if (expr.player !== 'active' && fixedPlayerId === null) {
        return null;
      }
      const variableName = tryStaticScopedVarNameExpr(expr.var);
      if (variableName === null) {
        return null;
      }
      return (ctx, snapshot) => {
        const playerId = fixedPlayerId ?? ctx.activePlayer;
        const playerVars = snapshot?.perPlayerVars[playerId] ?? ctx.state.perPlayerVars[playerId];
        if (playerVars === undefined) {
          throw missingVarError(`Per-player vars missing for player ${playerId}`, {
            reference: expr,
            playerId,
            availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
          });
        }

        const value = playerVars[variableName];
        if (value === undefined) {
          throw missingVarError(`Per-player variable not found: ${variableName}`, {
            reference: expr,
            playerId,
            var: variableName,
            availablePlayerVars: Object.keys(playerVars).sort(),
          });
        }

        return value;
      };
    }

    case 'zoneVar': {
      if (typeof expr.zone !== 'string') {
        return null;
      }
      const variableName = tryStaticScopedVarNameExpr(expr.var);
      if (variableName === null) {
        return null;
      }
      return (ctx, snapshot) => {
        const snapshotValue = snapshot?.zoneVars.get(expr.zone, variableName);
        if (snapshotValue !== undefined) {
          return snapshotValue;
        }

        const zoneVarMap = ctx.state.zoneVars[expr.zone];
        if (zoneVarMap === undefined) {
          throw missingVarError(`Zone variable state not found for zone: ${expr.zone}`, {
            reference: expr,
            zoneId: expr.zone,
            availableZones: Object.keys(ctx.state.zoneVars).sort(),
          });
        }

        const value = zoneVarMap[variableName];
        if (value === undefined) {
          throw missingVarError(`Zone variable not found: ${variableName} in zone ${expr.zone}`, {
            reference: expr,
            zoneId: expr.zone,
            var: variableName,
            availableZoneVars: Object.keys(zoneVarMap).sort(),
          });
        }

        return value;
      };
    }

    case 'zoneCount':
      if (typeof expr.zone !== 'string') {
        return null;
      }
      return compileZoneCountAccessor(expr.zone, expr);

    case 'tokenProp':
      return (ctx) => {
        const boundToken = ctx.bindings[expr.token];
        if (boundToken === undefined) {
          throw missingBindingError(`Token binding not found: ${expr.token}`, {
            reference: expr,
            binding: expr.token,
            availableBindings: Object.keys(ctx.bindings).sort(),
          });
        }

        const resolvedBinding = resolveRuntimeTokenBindingValue(boundToken);
        if (resolvedBinding === null) {
          throw typeMismatchError(`Token binding ${expr.token} must resolve to a Token or token-id string`, {
            reference: expr,
            binding: expr.token,
            actualType: typeof boundToken,
            value: boundToken,
          });
        }

        const token = resolvedBinding.tokenFromBinding ?? getTokenStateIndexEntry(ctx.state, resolvedBinding.tokenId)?.token ?? null;
        if (token === null) {
          throw missingVarError(`Token ${String(resolvedBinding.tokenId)} not found in any zone`, {
            reference: expr,
            binding: expr.token,
            tokenId: String(resolvedBinding.tokenId),
            availableZoneIds: Object.keys(ctx.state.zones).sort(),
          });
        }

        const propValue = resolveTokenViewFieldValue(token, expr.prop);
        if (propValue === undefined) {
          throw missingVarError(`Token property not found: ${expr.prop}`, {
            reference: expr,
            binding: expr.token,
            availableBindings: Object.keys(ctx.bindings).sort(),
            availableTokenProps: Object.keys(token.props).sort(),
          });
        }

        return propValue;
      };

    case 'binding':
      return (ctx) => {
        const resolvedName = resolveBindingTemplate(expr.name, ctx.bindings);
        const value = ctx.bindings[resolvedName];
        if (value === undefined) {
          throw missingBindingError(`Binding not found: ${resolvedName}`, {
            reference: expr,
            binding: resolvedName,
            bindingTemplate: expr.name,
            availableBindings: Object.keys(ctx.bindings).sort(),
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

const compileConcatAccessor = (expr: ConcatExpr): CompiledConditionValueAccessor | null => {
  const childAccessors = expr.concat.map((child) => tryCompileValueExpr(child));
  if (childAccessors.some((accessor) => accessor === null)) {
    return null;
  }

  const accessors = childAccessors as readonly CompiledConditionValueAccessor[];
  return (ctx, snapshot) => {
    const len = accessors.length;
    let allScalar = true;
    let allArray = true;
    const parts: (ScalarValue | ScalarArrayValue)[] = new Array(len);

    for (let i = 0; i < len; i++) {
      const value = accessors[i]!(ctx, snapshot);
      parts[i] = value;
      if (Array.isArray(value)) allScalar = false;
      else allArray = false;
    }

    if (allScalar) {
      let result = '';
      for (let i = 0; i < len; i++) {
        result += String(parts[i]);
      }
      return result;
    }

    if (allArray) {
      return (parts as ScalarArrayValue[]).flatMap((part) => part);
    }

    throw typeMismatchError('concat expressions must not mix scalar and scalar-array parts', {
      expr,
      parts,
    });
  };
};

const compileIfAccessor = (expr: IfValueExpr): CompiledConditionValueAccessor | null => {
  const condition = tryCompileCondition(expr.if.when);
  const thenAccessor = tryCompileValueExpr(expr.if.then);
  const elseAccessor = tryCompileValueExpr(expr.if.else);
  if (condition === null || thenAccessor === null || elseAccessor === null) {
    return null;
  }

  return (ctx, snapshot) =>
    condition(ctx, snapshot)
      ? thenAccessor(ctx, snapshot)
      : elseAccessor(ctx, snapshot);
};

const compileArithmeticAccessor = (expr: ArithmeticExpr): CompiledConditionValueAccessor | null => {
  const leftAccessor = tryCompileValueExpr(expr.left);
  const rightAccessor = tryCompileValueExpr(expr.right);
  if (leftAccessor === null || rightAccessor === null) {
    return null;
  }

  return (ctx, snapshot) => {
    const left = expectSafeInteger(
      leftAccessor(ctx, snapshot),
      'Arithmetic operands must be finite safe integers',
      { expr, side: 'left' },
    );
    const right = expectSafeInteger(
      rightAccessor(ctx, snapshot),
      'Arithmetic operands must be finite safe integers',
      { expr, side: 'right' },
    );

    if (expr.op === '/') {
      if (right === 0) {
        throw divisionByZeroError('Division by zero', { expr, left, right });
      }
      const result = Math.trunc(left / right);
      return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
    }

    if (expr.op === 'floorDiv') {
      if (right === 0) {
        throw divisionByZeroError('Division by zero', { expr, left, right });
      }
      const result = Math.floor(left / right);
      return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
    }

    if (expr.op === 'ceilDiv') {
      if (right === 0) {
        throw divisionByZeroError('Division by zero', { expr, left, right });
      }
      const result = Math.ceil(left / right);
      return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
    }

    if (expr.op === 'min') {
      const result = Math.min(left, right);
      return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
    }

    if (expr.op === 'max') {
      const result = Math.max(left, right);
      return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
    }

    const result = expr.op === '+' ? left + right : expr.op === '-' ? left - right : left * right;
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  };
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
      return (ctx, snapshot) =>
        leftAccessor(ctx, snapshot) === rightAccessor(ctx, snapshot);
    case '!=':
      return (ctx, snapshot) =>
        leftAccessor(ctx, snapshot) !== rightAccessor(ctx, snapshot);
    case '<':
      return (ctx, snapshot) =>
        expectOrderingNumber(leftAccessor(ctx, snapshot), 'left', cond)
        < expectOrderingNumber(rightAccessor(ctx, snapshot), 'right', cond);
    case '<=':
      return (ctx, snapshot) =>
        expectOrderingNumber(leftAccessor(ctx, snapshot), 'left', cond)
        <= expectOrderingNumber(rightAccessor(ctx, snapshot), 'right', cond);
    case '>':
      return (ctx, snapshot) =>
        expectOrderingNumber(leftAccessor(ctx, snapshot), 'left', cond)
        > expectOrderingNumber(rightAccessor(ctx, snapshot), 'right', cond);
    case '>=':
      return (ctx, snapshot) =>
        expectOrderingNumber(leftAccessor(ctx, snapshot), 'left', cond)
        >= expectOrderingNumber(rightAccessor(ctx, snapshot), 'right', cond);
  }
};

export const tryCompileValueExpr = (
  expr: ValueExpr,
): CompiledConditionValueAccessor | null => {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return () => expr;
  }

  switch (expr._t) {
    case 1:
      return () => expr.scalarArray;
    case 2:
      return compileReferenceAccessor(expr as Extract<ValueExpr, { readonly _t: 2 }>);
    case 3:
      return compileConcatAccessor(expr as ConcatExpr);
    case 4:
      return compileIfAccessor(expr as IfValueExpr);
    case 5:
      if (expr.aggregate.op !== 'count') {
        return null;
      }
      return compileAggregateCountAccessor(expr as AggregateCountExpr);
    case 6:
      return compileArithmeticAccessor(expr as ArithmeticExpr);
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

    case 'in': {
      const itemAccessor = tryCompileValueExpr(cond.item);
      const setAccessor = tryCompileValueExpr(cond.set);
      if (itemAccessor === null || setAccessor === null) {
        return null;
      }
      return (ctx, snapshot) =>
        matchesMembership(itemAccessor(ctx, snapshot), setAccessor(ctx, snapshot), {
          cond,
          setExpr: cond.set,
        });
    }

    case 'zonePropIncludes': {
      const valueAccessor = tryCompileValueExpr(cond.value);
      if (valueAccessor === null) {
        return null;
      }
      return (ctx, snapshot) => {
        const zoneId = resolveMapSpaceId(cond.zone, ctx);
        const zoneDef = getZoneMap(ctx.def).get(String(zoneId));
        if (zoneDef === undefined) {
          throw zonePropNotFoundError(`Zone not found: ${String(zoneId)}`, {
            condition: cond,
            zoneId,
            availableZoneIds: ctx.def.zones.map((zone) => zone.id).sort(),
          });
        }

        if (cond.prop === 'id' || cond.prop === 'category') {
          throw typeMismatchError(
            `Property "${cond.prop}" on zone ${String(zoneId)} is a scalar, not an array. Use zoneProp reference with a comparison condition instead.`,
            {
              condition: cond,
              zoneId,
              prop: cond.prop,
              actualType: 'scalar',
            },
          );
        }

        const propValue = zoneDef.attributes?.[cond.prop];
        if (propValue === undefined) {
          throw zonePropNotFoundError(`Property "${cond.prop}" not found on zone ${String(zoneId)}`, {
            condition: cond,
            zoneId,
            prop: cond.prop,
            availableProps: ['id', ...(zoneDef.category !== undefined ? ['category'] : []), ...Object.keys(zoneDef.attributes ?? {})].sort(),
          });
        }

        if (!Array.isArray(propValue)) {
          throw typeMismatchError(
            `Property "${cond.prop}" on zone ${String(zoneId)} is not an array. Use zoneProp reference with a comparison condition instead.`,
            {
              condition: cond,
              zoneId,
              prop: cond.prop,
              actualType: typeof propValue,
            },
          );
        }

        return propValue.includes(valueAccessor(ctx, snapshot));
      };
    }

    case 'markerStateAllowed': {
      const stateAccessor = tryCompileValueExpr(cond.state);
      if (stateAccessor === null) {
        return null;
      }
      return (ctx, snapshot) => {
        const spaceId = resolveMapSpaceId(cond.space, ctx);
        const candidateState = stateAccessor(ctx, snapshot);
        if (typeof candidateState !== 'string') {
          throw typeMismatchError('markerStateAllowed.state must evaluate to a string', {
            condition: cond,
            actualType: typeof candidateState,
            value: candidateState,
          });
        }

        const lattice = getLatticeMap(ctx.def)?.get(cond.marker);
        if (lattice === undefined) {
          throw missingVarError(`Marker lattice not found: ${cond.marker}`, {
            condition: cond,
            markerId: cond.marker,
            availableMarkerLattices: (ctx.def.markerLattices ?? []).map((candidate) => candidate.id).sort(),
          });
        }

        if (!lattice.states.includes(candidateState)) {
          return false;
        }

        return isSpaceMarkerStateAllowed(lattice, String(spaceId), candidateState, ctx, evalCondition);
      };
    }

    case 'markerShiftAllowed': {
      const deltaAccessor = tryCompileValueExpr(cond.delta);
      if (deltaAccessor === null) {
        return null;
      }
      return (ctx, snapshot) => {
        const spaceId = resolveMapSpaceId(cond.space, ctx);
        const evaluatedDelta = deltaAccessor(ctx, snapshot);
        if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
          throw typeMismatchError('markerShiftAllowed.delta must evaluate to a safe integer', {
            condition: cond,
            actualType: typeof evaluatedDelta,
            value: evaluatedDelta,
          });
        }

        const lattice = getLatticeMap(ctx.def)?.get(cond.marker);
        if (lattice === undefined) {
          throw missingVarError(`Marker lattice not found: ${cond.marker}`, {
            condition: cond,
            markerId: cond.marker,
            availableMarkerLattices: (ctx.def.markerLattices ?? []).map((candidate) => candidate.id).sort(),
          });
        }

        const resolution = resolveSpaceMarkerShift(lattice, String(spaceId), evaluatedDelta, ctx, evalCondition);
        return resolution.changed && resolution.allowed;
      };
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
      return (ctx, snapshot) =>
        compiledArgs.every((arg) => arg(ctx, snapshot));
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
      return (ctx, snapshot) =>
        compiledArgs.some((arg) => arg(ctx, snapshot));
    }

    case 'not': {
      const compiledArg = tryCompileCondition(cond.arg);
      if (compiledArg === null) {
        return null;
      }
      return (ctx, snapshot) => !compiledArg(ctx, snapshot);
    }

    default:
      return null;
  }
};
