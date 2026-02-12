import type { EvalContext } from './eval-context.js';
import { typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import { evalValue } from './eval-value.js';
import { resolveMapSpaceId, resolveSingleZoneSel } from './resolve-selectors.js';
import { queryConnectedZones } from './spatial.js';
import type { ConditionAST, ValueExpr } from './types.js';

function isMembershipCollection(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function evalMembershipSet(setExpr: ValueExpr, ctx: EvalContext, cond: ConditionAST): readonly unknown[] {
  if (typeof setExpr === 'object' && setExpr !== null && 'ref' in setExpr && setExpr.ref === 'binding') {
    const boundValue = ctx.bindings[setExpr.name];
    if (isMembershipCollection(boundValue)) {
      return boundValue;
    }
  }

  const setValue = evalValue(setExpr, ctx);
  if (isMembershipCollection(setValue)) {
    return setValue;
  }

  throw typeMismatchError('Condition "in" requires an array-like set value', {
    cond,
    setExpr,
    actualType: typeof setValue,
    value: setValue,
  });
}

function expectOrderingNumber(
  value: number | boolean | string,
  side: 'left' | 'right',
  cond: ConditionAST,
): number {
  if (typeof value !== 'number') {
    throw typeMismatchError('Ordering comparisons require numeric operands', {
      cond,
      side,
      actualType: typeof value,
      value,
    });
  }

  return value;
}

export function evalCondition(cond: ConditionAST, ctx: EvalContext): boolean {
  switch (cond.op) {
    case 'and':
      for (const arg of cond.args) {
        if (!evalCondition(arg, ctx)) {
          return false;
        }
      }
      return true;

    case 'or':
      for (const arg of cond.args) {
        if (evalCondition(arg, ctx)) {
          return true;
        }
      }
      return false;

    case 'not':
      return !evalCondition(cond.arg, ctx);

    case '==':
      return evalValue(cond.left, ctx) === evalValue(cond.right, ctx);

    case '!=':
      return evalValue(cond.left, ctx) !== evalValue(cond.right, ctx);

    case '<': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left < right;
    }

    case '<=': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left <= right;
    }

    case '>': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left > right;
    }

    case '>=': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left >= right;
    }

    case 'in': {
      const item = evalValue(cond.item, ctx);
      const setValues = evalMembershipSet(cond.set, ctx, cond);
      return setValues.includes(item);
    }

    case 'adjacent': {
      const leftZoneId = resolveSingleZoneSel(cond.left, ctx);
      const rightZoneId = resolveSingleZoneSel(cond.right, ctx);
      const neighbors = ctx.adjacencyGraph.neighbors[String(leftZoneId)] ?? [];
      return neighbors.includes(rightZoneId);
    }

    case 'connected': {
      const fromZoneId = resolveSingleZoneSel(cond.from, ctx);
      const toZoneId = resolveSingleZoneSel(cond.to, ctx);
      const reachableZones = queryConnectedZones(ctx.adjacencyGraph, ctx.state, fromZoneId, ctx, cond.via, {
        ...(cond.maxDepth === undefined ? {} : { maxDepth: cond.maxDepth }),
      });
      return reachableZones.includes(toZoneId);
    }

    case 'zonePropIncludes': {
      const zoneId = resolveMapSpaceId(cond.zone, ctx);
      const mapSpaces = ctx.mapSpaces;
      if (mapSpaces === undefined) {
        throw zonePropNotFoundError('No mapSpaces available to look up zone properties', {
          condition: cond,
          zoneId,
        });
      }

      const spaceDef = mapSpaces.find((space) => space.id === String(zoneId));
      if (spaceDef === undefined) {
        throw zonePropNotFoundError(`Zone not found in mapSpaces: ${String(zoneId)}`, {
          condition: cond,
          zoneId,
          availableSpaceIds: mapSpaces.map((space) => space.id).sort(),
        });
      }

      const propValue = (spaceDef as unknown as Record<string, unknown>)[cond.prop];
      if (propValue === undefined) {
        throw zonePropNotFoundError(`Property "${cond.prop}" not found on zone ${String(zoneId)}`, {
          condition: cond,
          zoneId,
          prop: cond.prop,
          availableProps: Object.keys(spaceDef).sort(),
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

      const needle = evalValue(cond.value, ctx);
      return propValue.includes(needle);
    }

    default: {
      const _exhaustive: never = cond;
      return _exhaustive;
    }
  }
}
