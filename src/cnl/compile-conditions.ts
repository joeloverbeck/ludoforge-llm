import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ConditionAST, OptionsQuery, PlayerSel, Reference, TokenFilterPredicate, ValueExpr } from '../kernel/types.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface ConditionLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly bindingScope?: readonly string[];
}

export interface ConditionLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

const SUPPORTED_CONDITION_OPS = ['and', 'or', 'not', '==', '!=', '<', '<=', '>', '>=', 'in', 'adjacent', 'connected', 'zonePropIncludes'];
const SUPPORTED_QUERY_KINDS = [
  'tokensInZone',
  'intsInRange',
  'enums',
  'players',
  'zones',
  'adjacentZones',
  'tokensInAdjacentZones',
  'connectedZones',
  'binding',
];
const SUPPORTED_REFERENCE_KINDS = ['gvar', 'pvar', 'zoneCount', 'tokenProp', 'binding', 'markerState', 'tokenZone', 'zoneProp', 'activePlayer'];

export function lowerConditionNode(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<ConditionAST> {
  if (typeof source === 'boolean') {
    return { value: source, diagnostics: [] };
  }
  if (!isRecord(source) || typeof source.op !== 'string') {
    return missingCapability(path, 'condition node', source, SUPPORTED_CONDITION_OPS);
  }

  switch (source.op) {
    case 'and':
    case 'or': {
      if (!Array.isArray(source.args)) {
        return missingCapability(path, `${source.op} condition`, source, ['{ op, args: [...] }']);
      }
      const loweredArgs = lowerConditionArray(source.args, context, `${path}.args`);
      if (loweredArgs.value === null) {
        return { value: null, diagnostics: loweredArgs.diagnostics };
      }
      return {
        value: { op: source.op, args: loweredArgs.value },
        diagnostics: loweredArgs.diagnostics,
      };
    }
    case 'not': {
      const loweredArg = lowerConditionNode(source.arg, context, `${path}.arg`);
      if (loweredArg.value === null) {
        return loweredArg;
      }
      return { value: { op: 'not', arg: loweredArg.value }, diagnostics: loweredArg.diagnostics };
    }
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
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
    case 'in': {
      const item = lowerValueNode(source.item, context, `${path}.item`);
      const set = lowerValueNode(source.set, context, `${path}.set`);
      const diagnostics = [...item.diagnostics, ...set.diagnostics];
      if (item.value === null || set.value === null) {
        return { value: null, diagnostics };
      }
      return {
        value: { op: 'in', item: item.value, set: set.value },
        diagnostics,
      };
    }
    case 'adjacent': {
      const left = lowerZoneSelector(source.left, context, `${path}.left`);
      const right = lowerZoneSelector(source.right, context, `${path}.right`);
      const diagnostics = [...left.diagnostics, ...right.diagnostics];
      if (left.value === null || right.value === null) {
        return { value: null, diagnostics };
      }
      return {
        value: { op: 'adjacent', left: left.value, right: right.value },
        diagnostics,
      };
    }
    case 'zonePropIncludes': {
      if (typeof source.prop !== 'string') {
        return missingCapability(path, 'zonePropIncludes condition', source, [
          '{ op: "zonePropIncludes", zone: <ZoneSel>, prop: string, value: <ValueExpr> }',
        ]);
      }
      const zpiZone = lowerZoneSelector(source.zone, context, `${path}.zone`);
      const zpiValue = lowerValueNode(source.value, context, `${path}.value`);
      const zpiDiagnostics = [...zpiZone.diagnostics, ...zpiValue.diagnostics];
      if (zpiZone.value === null || zpiValue.value === null) {
        return { value: null, diagnostics: zpiDiagnostics };
      }
      return {
        value: { op: 'zonePropIncludes', zone: zpiZone.value, prop: source.prop, value: zpiValue.value },
        diagnostics: zpiDiagnostics,
      };
    }
    case 'connected': {
      const from = lowerZoneSelector(source.from, context, `${path}.from`);
      const to = lowerZoneSelector(source.to, context, `${path}.to`);
      const via =
        source.via === undefined ? { value: undefined, diagnostics: [] as readonly Diagnostic[] } : lowerConditionNode(source.via, context, `${path}.via`);
      const maxDepth = source.maxDepth;
      const maxDepthValue = typeof maxDepth === 'number' && Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : undefined;
      const maxDepthDiagnostic =
        maxDepth === undefined || maxDepthValue !== undefined
          ? []
          : [
              {
                code: 'CNL_COMPILER_MISSING_CAPABILITY',
                path: `${path}.maxDepth`,
                severity: 'error' as const,
                message: 'connected.maxDepth must be an integer literal >= 0.',
                suggestion: 'Use a non-negative integer literal maxDepth.',
              },
            ];
      const diagnostics = [...from.diagnostics, ...to.diagnostics, ...via.diagnostics, ...maxDepthDiagnostic];
      if (from.value === null || to.value === null || via.value === null || maxDepthDiagnostic.length > 0) {
        return { value: null, diagnostics };
      }
      return {
        value: {
          op: 'connected',
          from: from.value,
          to: to.value,
          ...(via.value === undefined ? {} : { via: via.value }),
          ...(maxDepthValue === undefined ? {} : { maxDepth: maxDepthValue }),
        },
        diagnostics,
      };
    }
    default:
      return missingCapability(path, 'condition operator', source.op, SUPPORTED_CONDITION_OPS);
  }
}

export function lowerValueNode(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<ValueExpr> {
  if (typeof source === 'number' || typeof source === 'boolean' || typeof source === 'string') {
    return { value: source, diagnostics: [] };
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

  if ('op' in source && typeof source.op === 'string' && (source.op === '+' || source.op === '-' || source.op === '*' || source.op === '/')) {
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
    let diagnostics: readonly Diagnostic[] = [];
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
    const when = lowerConditionNode(ifNode.when, context, `${path}.if.when`);
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
    '{ ref: ... }',
    '{ op: "+|-|*", left, right }',
    '{ aggregate: { op, query, prop? } }',
    '{ concat: ValueExpr[] }',
    '{ if: { when, then, else } }',
  ]);
}

const SUPPORTED_TOKEN_FILTER_OPS = ['eq', 'neq', 'in', 'notIn'] as const;

function lowerTokenFilterEntry(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<TokenFilterPredicate> {
  if (!isRecord(source) || typeof source.prop !== 'string') {
    return missingCapability(path, 'token filter entry', source, ['{ prop: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }']);
  }

  // Normalize shorthand: { prop, eq: <value> } → { prop, op: 'eq', value }
  const resolvedOp =
    source.op !== undefined ? source.op :
    source.eq !== undefined ? 'eq' :
    source.neq !== undefined ? 'neq' :
    source.in !== undefined ? 'in' :
    source.notIn !== undefined ? 'notIn' :
    undefined;

  if (typeof resolvedOp !== 'string' || !SUPPORTED_TOKEN_FILTER_OPS.includes(resolvedOp as typeof SUPPORTED_TOKEN_FILTER_OPS[number])) {
    return missingCapability(path, 'token filter operator', resolvedOp, [...SUPPORTED_TOKEN_FILTER_OPS]);
  }

  const op = resolvedOp as TokenFilterPredicate['op'];

  // Resolve value: from explicit `value` key or from shorthand key
  const rawValue =
    source.value !== undefined ? source.value :
    source.eq !== undefined ? source.eq :
    source.neq !== undefined ? source.neq :
    source.in !== undefined ? source.in :
    source.notIn !== undefined ? source.notIn :
    undefined;

  if (rawValue === undefined) {
    return missingCapability(path, 'token filter value', source, ['{ prop, op, value: <string|string[]|ValueExpr> }']);
  }

  // For 'in'/'notIn', value must be a string array
  if (op === 'in' || op === 'notIn') {
    if (!Array.isArray(rawValue) || rawValue.some((item: unknown) => typeof item !== 'string')) {
      return missingCapability(`${path}.value`, 'token filter set value', rawValue, ['string[]']);
    }
    return {
      value: { prop: source.prop, op, value: [...rawValue] as readonly string[] },
      diagnostics: [],
    };
  }

  // For 'eq'/'neq', value is a ValueExpr (string, number, boolean, or reference)
  const loweredValue = lowerValueNode(rawValue, context, `${path}.value`);
  if (loweredValue.value === null) {
    return { value: null, diagnostics: loweredValue.diagnostics };
  }

  return {
    value: { prop: source.prop, op, value: loweredValue.value },
    diagnostics: loweredValue.diagnostics,
  };
}

function lowerTokenFilterArray(
  source: readonly unknown[],
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<readonly TokenFilterPredicate[]> {
  const diagnostics: Diagnostic[] = [];
  const predicates: TokenFilterPredicate[] = [];

  for (let i = 0; i < source.length; i++) {
    const lowered = lowerTokenFilterEntry(source[i], context, `${path}[${i}]`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value === null) {
      return { value: null, diagnostics };
    }
    predicates.push(lowered.value);
  }

  return { value: predicates, diagnostics };
}

export function lowerQueryNode(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<OptionsQuery> {
  if (!isRecord(source) || typeof source.query !== 'string') {
    return missingCapability(path, 'query node', source, SUPPORTED_QUERY_KINDS);
  }

  switch (source.query) {
    case 'tokensInZone': {
      const zone = lowerZoneSelector(source.zone, context, `${path}.zone`);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      if (source.filter !== undefined) {
        if (!Array.isArray(source.filter)) {
          return missingCapability(`${path}.filter`, 'tokensInZone filter', source.filter, ['Array<{ prop, op, value }>']);
        }
        const loweredFilter = lowerTokenFilterArray(source.filter as readonly unknown[], context, `${path}.filter`);
        if (loweredFilter.value === null) {
          return { value: null, diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics] };
        }
        return {
          value: { query: 'tokensInZone', zone: zone.value, filter: loweredFilter.value },
          diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics],
        };
      }
      return {
        value: { query: 'tokensInZone', zone: zone.value },
        diagnostics: zone.diagnostics,
      };
    }
    case 'intsInRange': {
      if (!isInteger(source.min) || !isInteger(source.max)) {
        return missingCapability(path, 'intsInRange query', source, ['{ query: "intsInRange", min: <int>, max: <int> }']);
      }
      return {
        value: { query: 'intsInRange', min: source.min, max: source.max },
        diagnostics: [],
      };
    }
    case 'enums': {
      if (!Array.isArray(source.values) || source.values.some((value) => typeof value !== 'string')) {
        return missingCapability(path, 'enums query', source, ['{ query: "enums", values: string[] }']);
      }
      return {
        value: { query: 'enums', values: [...source.values] },
        diagnostics: [],
      };
    }
    case 'players':
      return {
        value: { query: 'players' },
        diagnostics: [],
      };
    case 'zones': {
      if (source.filter === undefined) {
        return { value: { query: 'zones' }, diagnostics: [] };
      }
      if (!isRecord(source.filter)) {
        return missingCapability(path, 'zones query filter', source.filter, [
          '{ owner: <PlayerSel> }',
          '{ op: "and"|"or"|..., args: [...] }',
        ]);
      }

      // ConditionAST filter: has 'op' property (e.g., { op: 'and', args: [...] })
      if (typeof source.filter.op === 'string') {
        const lowered = lowerConditionNode(source.filter, context, `${path}.filter`);
        if (lowered.value === null) {
          return { value: null, diagnostics: lowered.diagnostics };
        }
        return {
          value: { query: 'zones', filter: { condition: lowered.value } },
          diagnostics: lowered.diagnostics,
        };
      }

      // Owner-based filter: { owner: <PlayerSel> }
      if (source.filter.owner !== undefined) {
        const owner = normalizePlayerSelector(source.filter.owner, `${path}.filter.owner`);
        if (owner.value === null) {
          return { value: null, diagnostics: owner.diagnostics };
        }
        const filterObj: { readonly owner: PlayerSel; readonly condition?: ConditionAST } = { owner: owner.value };
        // If condition is also present alongside owner
        if (source.filter.condition !== undefined) {
          const loweredCondition = lowerConditionNode(source.filter.condition, context, `${path}.filter.condition`);
          if (loweredCondition.value === null) {
            return { value: null, diagnostics: [...owner.diagnostics, ...loweredCondition.diagnostics] };
          }
          return {
            value: { query: 'zones', filter: { ...filterObj, condition: loweredCondition.value } },
            diagnostics: [...owner.diagnostics, ...loweredCondition.diagnostics],
          };
        }
        return {
          value: { query: 'zones', filter: filterObj },
          diagnostics: owner.diagnostics,
        };
      }

      // No recognized filter properties
      return missingCapability(`${path}.filter`, 'zones query filter', source.filter, [
        '{ owner: <PlayerSel> }',
        '{ op: "and"|"or"|..., args: [...] }',
      ]);
    }
    case 'adjacentZones': {
      const zone = lowerZoneSelector(source.zone, context, `${path}.zone`);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      return {
        value: { query: 'adjacentZones', zone: zone.value },
        diagnostics: zone.diagnostics,
      };
    }
    case 'tokensInAdjacentZones': {
      const zone = lowerZoneSelector(source.zone, context, `${path}.zone`);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      if (source.filter !== undefined) {
        if (!Array.isArray(source.filter)) {
          return missingCapability(`${path}.filter`, 'tokensInAdjacentZones filter', source.filter, ['Array<{ prop, op, value }>']);
        }
        const loweredFilter = lowerTokenFilterArray(source.filter as readonly unknown[], context, `${path}.filter`);
        if (loweredFilter.value === null) {
          return { value: null, diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics] };
        }
        return {
          value: { query: 'tokensInAdjacentZones', zone: zone.value, filter: loweredFilter.value },
          diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics],
        };
      }
      return {
        value: { query: 'tokensInAdjacentZones', zone: zone.value },
        diagnostics: zone.diagnostics,
      };
    }
    case 'connectedZones': {
      const zone = lowerZoneSelector(source.zone, context, `${path}.zone`);
      const via =
        source.via === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerConditionNode(source.via, context, `${path}.via`);
      const includeStart = source.includeStart;
      const includeStartValue = typeof includeStart === 'boolean' ? includeStart : undefined;
      const includeStartDiagnostic =
        includeStart === undefined || includeStartValue !== undefined
          ? []
          : [
              {
                code: 'CNL_COMPILER_MISSING_CAPABILITY',
                path: `${path}.includeStart`,
                severity: 'error' as const,
                message: 'connectedZones.includeStart must be a boolean literal.',
                suggestion: 'Use includeStart: true or includeStart: false.',
              },
            ];
      const maxDepth = source.maxDepth;
      const maxDepthValue = typeof maxDepth === 'number' && Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : undefined;
      const maxDepthDiagnostic =
        maxDepth === undefined || maxDepthValue !== undefined
          ? []
          : [
              {
                code: 'CNL_COMPILER_MISSING_CAPABILITY',
                path: `${path}.maxDepth`,
                severity: 'error' as const,
                message: 'connectedZones.maxDepth must be an integer literal >= 0.',
                suggestion: 'Use a non-negative integer literal maxDepth.',
              },
            ];
      const diagnostics = [...zone.diagnostics, ...via.diagnostics, ...includeStartDiagnostic, ...maxDepthDiagnostic];
      if (zone.value === null || via.value === null || includeStartDiagnostic.length > 0 || maxDepthDiagnostic.length > 0) {
        return { value: null, diagnostics };
      }
      return {
        value: {
          query: 'connectedZones',
          zone: zone.value,
          ...(via.value === undefined ? {} : { via: via.value }),
          ...(includeStartValue === undefined ? {} : { includeStart: includeStartValue }),
          ...(maxDepthValue === undefined ? {} : { maxDepth: maxDepthValue }),
        },
        diagnostics,
      };
    }
    case 'binding': {
      if (typeof source.name !== 'string') {
        return missingCapability(path, 'binding query', source, ['{ query: "binding", name: "$bindingName" }']);
      }
      return {
        value: { query: 'binding', name: source.name },
        diagnostics: [],
      };
    }
    default:
      return missingCapability(path, 'query kind', source.query, SUPPORTED_QUERY_KINDS);
  }
}

function lowerConditionArray(
  source: readonly unknown[],
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<readonly ConditionAST[]> {
  const diagnostics: Diagnostic[] = [];
  const values: ConditionAST[] = [];

  source.forEach((entry, index) => {
    const lowered = lowerConditionNode(entry, context, `${path}.${index}`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value !== null) {
      values.push(lowered.value);
    }
  });

  if (diagnostics.length > 0 && values.length !== source.length) {
    return { value: null, diagnostics };
  }

  return { value: values, diagnostics };
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
  const query = lowerQueryNode(source.query, context, `${path}.query`);
  if (query.value === null) {
    return { value: null, diagnostics: query.diagnostics };
  }
  if (source.prop !== undefined && typeof source.prop !== 'string') {
    return missingCapability(`${path}.prop`, 'aggregate prop', source.prop, ['string']);
  }
  return {
    value: {
      aggregate: {
        op,
        query: query.value,
        ...(source.prop === undefined ? {} : { prop: source.prop }),
      },
    },
    diagnostics: query.diagnostics,
  };
}

function lowerReference(
  source: Record<string, unknown>,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<Reference> {
  switch (source.ref) {
    case 'gvar':
      if (typeof source.var === 'string') {
        return { value: { ref: 'gvar', var: source.var }, diagnostics: [] };
      }
      return missingCapability(path, 'gvar reference', source, ['{ ref: "gvar", var: string }']);
    case 'pvar': {
      if (typeof source.var !== 'string') {
        return missingCapability(path, 'pvar reference', source, ['{ ref: "pvar", player: <PlayerSel>, var: string }']);
      }
      const player = normalizePlayerSelector(source.player, `${path}.player`);
      if (player.value === null) {
        return { value: null, diagnostics: player.diagnostics };
      }
      return {
        value: { ref: 'pvar', player: player.value as PlayerSel, var: source.var },
        diagnostics: player.diagnostics,
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
    case 'activePlayer':
      return { value: { ref: 'activePlayer' }, diagnostics: [] };
    case 'binding':
      if (typeof source.name === 'string') {
        if (context.bindingScope !== undefined && !context.bindingScope.includes(source.name)) {
          return {
            value: null,
            diagnostics: [
              {
                code: 'CNL_COMPILER_BINDING_UNBOUND',
                path: `${path}.name`,
                severity: 'error',
                message: `Unbound binding reference "${source.name}".`,
                suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
                alternatives: rankBindingAlternatives(source.name, context.bindingScope),
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
    default:
      return missingCapability(path, 'reference kind', source.ref, SUPPORTED_REFERENCE_KINDS);
  }
}

function lowerZoneSelector(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<string> {
  const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path);
  if (zone.value === null) {
    return { value: null, diagnostics: zone.diagnostics };
  }
  return {
    value: zone.value,
    diagnostics: zone.diagnostics,
  };
}

function missingCapability<TValue>(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): ConditionLoweringResult<TValue> {
  return {
    value: null,
    diagnostics: [
      {
        code: 'CNL_COMPILER_MISSING_CAPABILITY',
        path,
        severity: 'error',
        message: `Cannot lower ${construct} to kernel AST: ${formatValue(actual)}.`,
        suggestion: 'Rewrite this node to a supported kernel-compatible shape.',
        ...(alternatives === undefined ? {} : { alternatives: [...alternatives] }),
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function rankBindingAlternatives(name: string, inScope: readonly string[]): readonly string[] {
  return [...new Set(inScope)]
    .sort((left, right) => {
      const leftDistance = levenshteinDistance(name, left);
      const rightDistance = levenshteinDistance(name, right);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.localeCompare(right);
    })
    .slice(0, 5);
}

function levenshteinDistance(left: string, right: string): number {
  const width = right.length + 1;
  const dp = new Array<number>((left.length + 1) * width);
  for (let row = 0; row <= left.length; row += 1) {
    dp[row * width] = row;
  }
  for (let col = 0; col <= right.length; col += 1) {
    dp[col] = col;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const offset = row * width + col;
      const insertion = (dp[offset - 1] ?? Number.MAX_SAFE_INTEGER) + 1;
      const deletion = (dp[offset - width] ?? Number.MAX_SAFE_INTEGER) + 1;
      const substitution = (dp[offset - width - 1] ?? Number.MAX_SAFE_INTEGER) + substitutionCost;
      dp[offset] = Math.min(insertion, deletion, substitution);
    }
  }

  return dp[left.length * width + right.length] ?? Number.MAX_SAFE_INTEGER;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
