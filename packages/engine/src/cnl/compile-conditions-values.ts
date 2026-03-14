import { hasBindingIdentifier, isCanonicalBindingIdentifier, rankBindingIdentifierAlternatives } from '../contracts/index.js';
import { isNumericValueExpr } from '../kernel/numeric-value-expr.js';
import type { FreeOperationSequenceKeyExpr, NumericValueExpr, PlayerSel, Reference, ScopedVarNameExpr, ValueExpr, ZoneRef } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  type ConditionLoweringContext,
  type ConditionLoweringResult,
  type ConditionLoweringRuntime,
  isRecord,
  lowerScalarMembershipLiteral,
  lowerZoneSelector,
  missingCapability,
  SUPPORTED_REFERENCE_KINDS,
} from './compile-conditions-shared.js';
import { bindingShadowWarningsForScope } from './binding-diagnostics.js';
import { normalizePlayerSelector } from './compile-selectors.js';

export function createValueLowerers(
  runtime: ConditionLoweringRuntime,
): Pick<
  ConditionLoweringRuntime,
  'lowerFreeOperationSequenceKeyExpr' | 'lowerNumericValueNode' | 'lowerScopedVarNameExpr' | 'lowerValueNode' | 'lowerZoneRef'
> {
  function lowerFreeOperationSequenceKeyExpr(
    source: unknown,
    path: string,
  ): ConditionLoweringResult<FreeOperationSequenceKeyExpr> {
    if (typeof source === 'string') {
      return { value: source, diagnostics: [] };
    }
    if (!isRecord(source) || typeof source.ref !== 'string') {
      return missingCapability(path, 'free-operation sequence key', source, [
        'string',
        '{ ref: "binding", name: string }',
        '{ ref: "grantContext", key: string }',
      ]);
    }
    if (source.ref === 'binding' && typeof source.name === 'string') {
      return {
        value: { ref: 'binding', name: source.name },
        diagnostics: [],
      };
    }
    if (source.ref === 'grantContext' && typeof source.key === 'string') {
      return {
        value: { ref: 'grantContext', key: source.key },
        diagnostics: [],
      };
    }
    return missingCapability(path, 'free-operation sequence key', source, [
      'string',
      '{ ref: "binding", name: string }',
      '{ ref: "grantContext", key: string }',
    ]);
  }

  function lowerScopedVarNameExpr(
    source: unknown,
    path: string,
  ): ConditionLoweringResult<ScopedVarNameExpr> {
    if (typeof source === 'string') {
      return { value: source, diagnostics: [] };
    }
    if (!isRecord(source) || typeof source.ref !== 'string') {
      return missingCapability(path, 'scoped variable name', source, [
        'string',
        '{ ref: "binding", name: string }',
        '{ ref: "grantContext", key: string }',
      ]);
    }
    if (source.ref === 'binding' && typeof source.name === 'string') {
      return {
        value: { ref: 'binding', name: source.name, ...(typeof source.displayName === 'string' ? { displayName: source.displayName } : {}) },
        diagnostics: [],
      };
    }
    if (source.ref === 'grantContext' && typeof source.key === 'string') {
      return {
        value: { ref: 'grantContext', key: source.key },
        diagnostics: [],
      };
    }
    return missingCapability(path, 'scoped variable name', source, [
      'string',
      '{ ref: "binding", name: string }',
      '{ ref: "grantContext", key: string }',
    ]);
  }

  function lowerValueNode(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<ValueExpr> {
    if (typeof source === 'number' || typeof source === 'boolean' || typeof source === 'string') {
      return { value: source, diagnostics: [] };
    }

    if (Array.isArray(source)) {
      const loweredArray = lowerScalarMembershipLiteral(
        source,
        path,
        'value expression',
        ['homogeneous (string|number|boolean)[]'],
      );
      if (loweredArray.value === null) {
        return { value: null, diagnostics: loweredArray.diagnostics };
      }
      return {
        value: { scalarArray: loweredArray.value },
        diagnostics: loweredArray.diagnostics,
      };
    }

    if (!isRecord(source)) {
      return missingCapability(path, 'value expression', source);
    }

    if ('zoneCount' in source && typeof source.zoneCount === 'string') {
      const zone = lowerZoneSelector(source.zoneCount, context, `${path}.zoneCount`);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      return {
        value: { ref: 'zoneCount', zone: zone.value },
        diagnostics: zone.diagnostics,
      };
    }

    if ('ref' in source && typeof source.ref === 'string') {
      return lowerReference(source, context, path);
    }

    if (
      'op' in source &&
      typeof source.op === 'string' &&
      (source.op === '+'
        || source.op === '-'
        || source.op === '*'
        || source.op === '/'
        || source.op === 'floorDiv'
        || source.op === 'ceilDiv'
        || source.op === 'min'
        || source.op === 'max')
    ) {
      const left = lowerValueNode(source.left, context, `${path}.left`);
      const right = lowerValueNode(source.right, context, `${path}.right`);
      const diagnostics = [...left.diagnostics, ...right.diagnostics];
      if (left.value === null || right.value === null) {
        return { value: null, diagnostics };
      }
      return {
        value: { op: source.op, left: left.value, right: right.value },
        diagnostics,
      };
    }

    if ('aggregate' in source && isRecord(source.aggregate)) {
      return lowerAggregate(source.aggregate, context, `${path}.aggregate`);
    }

    if ('concat' in source && Array.isArray(source.concat)) {
      const children: ValueExpr[] = [];
      let diagnostics: readonly import('../kernel/diagnostics.js').Diagnostic[] = [];
      for (let i = 0; i < source.concat.length; i++) {
        const child = lowerValueNode(source.concat[i], context, `${path}.concat[${i}]`);
        diagnostics = [...diagnostics, ...child.diagnostics];
        if (child.value === null) {
          return { value: null, diagnostics };
        }
        children.push(child.value);
      }
      return { value: { concat: children }, diagnostics };
    }

    if ('if' in source && isRecord(source.if)) {
      const ifNode = source.if;
      const when = runtime.lowerConditionNode(ifNode.when, context, `${path}.if.when`);
      const then = lowerValueNode(ifNode.then, context, `${path}.if.then`);
      const elseVal = lowerValueNode(ifNode.else, context, `${path}.if.else`);
      const diagnostics = [...when.diagnostics, ...then.diagnostics, ...elseVal.diagnostics];
      if (when.value === null || then.value === null || elseVal.value === null) {
        return { value: null, diagnostics };
      }
      return {
        value: { if: { when: when.value, then: then.value, else: elseVal.value } },
        diagnostics,
      };
    }

    return missingCapability(path, 'value expression', source, [
      'number',
      'boolean',
      'string',
      'homogeneous (string|number|boolean)[]',
      '{ ref: ... }',
      '{ op: "+|-|*|/|floorDiv|ceilDiv|min|max", left, right }',
      '{ aggregate: { op: "count", query } }',
      '{ aggregate: { op: "sum"|"min"|"max", query, bind, valueExpr } }',
      '{ concat: ValueExpr[] }',
      '{ if: { when, then, else } }',
    ]);
  }

  function lowerZoneRef(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<ZoneRef> {
    if (typeof source === 'string') {
      const zone = lowerZoneSelector(source, context, path);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      return {
        value: zone.value,
        diagnostics: zone.diagnostics,
      };
    }

    if (!isRecord(source) || !('zoneExpr' in source)) {
      return {
        value: null,
        diagnostics: [
          {
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
            path,
            severity: 'error',
            message: 'Zone selector must be a string or { zoneExpr: <ValueExpr> }.',
            suggestion: 'Use "zoneBase:qualifier" for static selectors, or wrap dynamic selectors in { zoneExpr: ... }.',
          },
        ],
      };
    }

    const valueResult = lowerValueNode(source.zoneExpr, context, `${path}.zoneExpr`);
    if (valueResult.value === null) {
      return { value: null, diagnostics: valueResult.diagnostics };
    }
    return { value: { zoneExpr: valueResult.value }, diagnostics: valueResult.diagnostics };
  }

  function lowerNumericValueNode(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<NumericValueExpr> {
    const lowered = lowerValueNode(source, context, path);
    if (lowered.value === null) {
      return { value: null, diagnostics: lowered.diagnostics };
    }
    if (!isNumericValueExpr(lowered.value)) {
      return missingCapability(path, 'numeric value expression', source, [
        'number',
        '{ ref: ... }',
        '{ op: "+"|"-"|"*"|"/"|"floorDiv"|"ceilDiv"|"min"|"max", left: <numeric>, right: <numeric> }',
        '{ aggregate: { op: "count", query: <OptionsQuery> } }',
        '{ aggregate: { op: "sum"|"min"|"max", query: <OptionsQuery>, bind: string, valueExpr: <NumericValueExpr> } }',
        '{ if: { when: <ConditionAST>, then: <numeric>, else: <numeric> } }',
      ]);
    }
    return { value: lowered.value, diagnostics: lowered.diagnostics };
  }

  function lowerAggregate(
    source: Record<string, unknown>,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<ValueExpr> {
    const op = source.op;
    if (op !== 'sum' && op !== 'count' && op !== 'min' && op !== 'max') {
      return missingCapability(path, 'aggregate op', op, ['sum', 'count', 'min', 'max']);
    }
    const query = runtime.lowerQueryNode(source.query, context, `${path}.query`);
    if (query.value === null) {
      return { value: null, diagnostics: query.diagnostics };
    }

    if (op === 'count') {
      if (source.bind !== undefined) {
        return missingCapability(`${path}.bind`, 'aggregate bind for count', source.bind, ['omit bind when op is "count"']);
      }
      if (source.valueExpr !== undefined) {
        return missingCapability(`${path}.valueExpr`, 'aggregate valueExpr for count', source.valueExpr, ['omit valueExpr when op is "count"']);
      }
      if (source.prop !== undefined) {
        return missingCapability(`${path}.prop`, 'aggregate prop', source.prop, ['prop is not supported; use bind + valueExpr for non-count aggregates']);
      }
      return {
        value: {
          aggregate: {
            op,
            query: query.value,
          },
        },
        diagnostics: query.diagnostics,
      };
    }

    if (typeof source.bind !== 'string' || source.bind.length === 0) {
      return missingCapability(`${path}.bind`, 'aggregate bind', source.bind, ['non-empty string']);
    }
    if (!isCanonicalBindingIdentifier(source.bind)) {
      return {
        value: null,
        diagnostics: [{
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_DECLARATION_NON_CANONICAL,
          path: `${path}.bind`,
          severity: 'error',
          message: `aggregate.bind "${source.bind}" must be a canonical "$name" token.`,
          suggestion: 'Use a canonical binding token like "$n".',
        }],
      };
    }
    if (source.prop !== undefined) {
      return missingCapability(`${path}.prop`, 'aggregate prop', source.prop, ['use aggregate.bind + aggregate.valueExpr']);
    }

    const valueExpr = lowerNumericValueNode(
      source.valueExpr,
      {
        ...context,
        bindingScope: [...(context.bindingScope ?? []), source.bind],
      },
      `${path}.valueExpr`,
    );
    const diagnostics = [...query.diagnostics, ...bindingShadowWarningsForScope(source.bind, `${path}.bind`, context.bindingScope), ...valueExpr.diagnostics];
    if (valueExpr.value === null) {
      return { value: null, diagnostics };
    }

    return {
      value: {
        aggregate: {
          op,
          query: query.value,
          bind: source.bind,
          valueExpr: valueExpr.value,
        },
      },
      diagnostics,
    };
  }

  function lowerReference(
    source: Record<string, unknown>,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<Reference> {
    switch (source.ref) {
      case 'gvar':
        {
          const variable = lowerScopedVarNameExpr(source.var, `${path}.var`);
          if (variable.value !== null) {
            return { value: { ref: 'gvar', var: variable.value }, diagnostics: variable.diagnostics };
          }
        }
        return missingCapability(path, 'gvar reference', source, [
          '{ ref: "gvar", var: string | { ref: "binding", name: string } | { ref: "grantContext", key: string } }',
        ]);
      case 'pvar': {
        const variable = lowerScopedVarNameExpr(source.var, `${path}.var`);
        if (variable.value === null) {
          return missingCapability(path, 'pvar reference', source, [
            '{ ref: "pvar", player: <PlayerSel>, var: string | { ref: "binding", name: string } | { ref: "grantContext", key: string } }',
          ]);
        }
        const player = normalizePlayerSelector(source.player, `${path}.player`, context.seatIds);
        if (player.value === null) {
          return { value: null, diagnostics: player.diagnostics };
        }
        return {
          value: { ref: 'pvar', player: player.value as PlayerSel, var: variable.value },
          diagnostics: [...variable.diagnostics, ...player.diagnostics],
        };
      }
      case 'zoneCount': {
        const zone = lowerZoneSelector(source.zone, context, `${path}.zone`);
        if (zone.value === null) {
          return { value: null, diagnostics: zone.diagnostics };
        }
        return {
          value: { ref: 'zoneCount', zone: zone.value },
          diagnostics: zone.diagnostics,
        };
      }
      case 'tokenProp':
        if (typeof source.token === 'string' && typeof source.prop === 'string') {
          return {
            value: { ref: 'tokenProp', token: source.token, prop: source.prop },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'tokenProp reference', source, ['{ ref: "tokenProp", token: string, prop: string }']);
      case 'assetField':
        if (typeof source.row === 'string' && typeof source.tableId === 'string' && typeof source.field === 'string') {
          if (context.bindingScope !== undefined && !hasBindingIdentifier(source.row, context.bindingScope)) {
            return {
              value: null,
              diagnostics: [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_UNBOUND,
                  path: `${path}.row`,
                  severity: 'error',
                  message: `Unbound binding reference "${source.row}".`,
                  suggestion: 'Use a row binding declared by action params or an in-scope effect binder.',
                  alternatives: rankBindingIdentifierAlternatives(source.row, context.bindingScope),
                },
              ],
            };
          }
          return {
            value: { ref: 'assetField', row: source.row, tableId: source.tableId, field: source.field },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'assetField reference', source, ['{ ref: "assetField", row: string, tableId: string, field: string }']);
      case 'markerState': {
        if (typeof source.marker !== 'string') {
          return missingCapability(path, 'markerState reference', source, ['{ ref: "markerState", space: <ZoneSel>, marker: string }']);
        }
        const space = lowerZoneSelector(source.space, context, `${path}.space`);
        if (space.value === null) {
          return { value: null, diagnostics: space.diagnostics };
        }
        return {
          value: { ref: 'markerState', space: space.value, marker: source.marker },
          diagnostics: space.diagnostics,
        };
      }
      case 'globalMarkerState':
        if (typeof source.marker === 'string') {
          return {
            value: { ref: 'globalMarkerState', marker: source.marker },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'globalMarkerState reference', source, ['{ ref: "globalMarkerState", marker: string }']);
      case 'tokenZone':
        if (typeof source.token === 'string') {
          return {
            value: { ref: 'tokenZone', token: source.token },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'tokenZone reference', source, ['{ ref: "tokenZone", token: string }']);
      case 'zoneProp': {
        if (typeof source.prop !== 'string') {
          return missingCapability(path, 'zoneProp reference', source, ['{ ref: "zoneProp", zone: <ZoneSel>, prop: string }']);
        }
        const zonePropZone = lowerZoneSelector(source.zone, context, `${path}.zone`);
        if (zonePropZone.value === null) {
          return { value: null, diagnostics: zonePropZone.diagnostics };
        }
        return {
          value: { ref: 'zoneProp', zone: zonePropZone.value, prop: source.prop },
          diagnostics: zonePropZone.diagnostics,
        };
      }
      case 'zoneVar': {
        const variable = lowerScopedVarNameExpr(source.var, `${path}.var`);
        if (variable.value === null) {
          return missingCapability(path, 'zoneVar reference', source, [
            '{ ref: "zoneVar", zone: <ZoneSel>, var: string | { ref: "binding", name: string } | { ref: "grantContext", key: string } }',
          ]);
        }
        const zoneVarZone = lowerZoneSelector(source.zone, context, `${path}.zone`);
        if (zoneVarZone.value === null) {
          return { value: null, diagnostics: zoneVarZone.diagnostics };
        }
        return {
          value: { ref: 'zoneVar', zone: zoneVarZone.value, var: variable.value },
          diagnostics: [...variable.diagnostics, ...zoneVarZone.diagnostics],
        };
      }
      case 'activePlayer':
        return { value: { ref: 'activePlayer' }, diagnostics: [] };
      case 'activeSeat':
        return { value: { ref: 'activeSeat' }, diagnostics: [] };
      case 'binding':
        if (typeof source.name === 'string') {
          if (context.bindingScope !== undefined && !hasBindingIdentifier(source.name, context.bindingScope)) {
            return {
              value: null,
              diagnostics: [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_UNBOUND,
                  path: `${path}.name`,
                  severity: 'error',
                  message: `Unbound binding reference "${source.name}".`,
                  suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
                  alternatives: rankBindingIdentifierAlternatives(source.name, context.bindingScope),
                },
              ],
            };
          }
          return {
            value: { ref: 'binding', name: source.name },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'binding reference', source, ['{ ref: "binding", name: string }']);
      case 'grantContext':
        if (typeof source.key === 'string') {
          return {
            value: { ref: 'grantContext', key: source.key },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'grantContext reference', source, ['{ ref: "grantContext", key: string }']);
      case 'capturedSequenceZones': {
        const loweredKey = lowerFreeOperationSequenceKeyExpr(source.key, `${path}.key`);
        if (loweredKey.value === null) {
          return { value: null, diagnostics: loweredKey.diagnostics };
        }
        return {
          value: { ref: 'capturedSequenceZones', key: loweredKey.value },
          diagnostics: loweredKey.diagnostics,
        };
      }
      default:
        return missingCapability(path, 'reference kind', source.ref, SUPPORTED_REFERENCE_KINDS);
    }
  }

  return {
    lowerFreeOperationSequenceKeyExpr,
    lowerNumericValueNode,
    lowerScopedVarNameExpr,
    lowerValueNode,
    lowerZoneRef,
  };
}
