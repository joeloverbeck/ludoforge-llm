import type { ReadContext } from './eval-context.js';
import { missingVarError, typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import { booleanArityMessage, isNonEmptyArray } from './boolean-arity-policy.js';
import { evalValue } from './eval-value.js';
import { resolvePredicateValue } from './predicate-value-resolution.js';
import { resolveMapSpaceId, resolveSingleZoneSel } from './resolve-selectors.js';
import { queryConnectedZones } from './spatial.js';
import { isSpaceMarkerStateAllowed, resolveSpaceMarkerShift } from './space-marker-rules.js';
import { matchesMembership } from './query-predicate.js';
import type { ConditionAST, ScalarArrayValue, ScalarValue } from './types.js';

function expectOrderingNumber(
  value: ScalarValue | ScalarArrayValue,
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

export function evalCondition(cond: ConditionAST, ctx: ReadContext): boolean {
  if (typeof cond === 'boolean') return cond;
  switch (cond.op) {
    case 'and':
      if (!isNonEmptyArray(cond.args)) {
        throw typeMismatchError(booleanArityMessage('condition', 'and'), { cond });
      }
      for (const arg of cond.args) {
        if (!evalCondition(arg, ctx)) {
          return false;
        }
      }
      return true;

    case 'or':
      if (!isNonEmptyArray(cond.args)) {
        throw typeMismatchError(booleanArityMessage('condition', 'or'), { cond });
      }
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
      const setValues = resolvePredicateValue(cond.set, ctx, {
        missingBinding: 'bindingError',
        missingGrantContext: 'emptySet',
      });
      return matchesMembership(item, setValues, {
        cond,
        setExpr: cond.set,
      });
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
        ...(cond.allowTargetOutsideVia === undefined ? {} : { allowTargetOutsideVia: cond.allowTargetOutsideVia }),
        ...(cond.maxDepth === undefined ? {} : { maxDepth: cond.maxDepth }),
      });
      return reachableZones.includes(toZoneId);
    }

    case 'zonePropIncludes': {
      const zoneId = resolveMapSpaceId(cond.zone, ctx);
      const zoneDef = ctx.def.zones.find((zone) => zone.id === String(zoneId));
      if (zoneDef === undefined) {
        throw zonePropNotFoundError(`Zone not found: ${String(zoneId)}`, {
          condition: cond,
          zoneId,
          availableZoneIds: ctx.def.zones.map((zone) => zone.id).sort(),
        });
      }

      // Synthetic zone properties: 'id' and 'category' are scalars, not arrays.
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

      const needle = evalValue(cond.value, ctx);
      return propValue.includes(needle);
    }

    case 'markerStateAllowed': {
      const spaceId = resolveMapSpaceId(cond.space, ctx);
      const candidateState = evalValue(cond.state, ctx);
      if (typeof candidateState !== 'string') {
        throw typeMismatchError('markerStateAllowed.state must evaluate to a string', {
          condition: cond,
          actualType: typeof candidateState,
          value: candidateState,
        });
      }

      const lattice = ctx.def.markerLattices?.find((candidate) => candidate.id === cond.marker);
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
    }

    case 'markerShiftAllowed': {
      const spaceId = resolveMapSpaceId(cond.space, ctx);
      const evaluatedDelta = evalValue(cond.delta, ctx);
      if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
        throw typeMismatchError('markerShiftAllowed.delta must evaluate to a safe integer', {
          condition: cond,
          actualType: typeof evaluatedDelta,
          value: evaluatedDelta,
        });
      }

      const lattice = ctx.def.markerLattices?.find((candidate) => candidate.id === cond.marker);
      if (lattice === undefined) {
        throw missingVarError(`Marker lattice not found: ${cond.marker}`, {
          condition: cond,
          markerId: cond.marker,
          availableMarkerLattices: (ctx.def.markerLattices ?? []).map((candidate) => candidate.id).sort(),
        });
      }

      const resolution = resolveSpaceMarkerShift(lattice, String(spaceId), evaluatedDelta, ctx, evalCondition);
      return resolution.changed && resolution.allowed;
    }

    default: {
      const _exhaustive: never = cond;
      return _exhaustive;
    }
  }
}
