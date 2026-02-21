import type { Diagnostic } from '../kernel/diagnostics.js';
import { isNumericValueExpr } from '../kernel/numeric-value-expr.js';
import type {
  AssetRowsCardinality,
  AssetRowPredicate,
  ConditionAST,
  NumericValueExpr,
  OptionsQuery,
  PlayerSel,
  Reference,
  TokenFilterPredicate,
  ValueExpr,
  ZoneRef,
} from '../kernel/types.js';
import {
  hasBindingIdentifier,
  isCanonicalBindingIdentifier,
  rankBindingIdentifierAlternatives,
} from '../kernel/binding-identifier-contract.js';
import { bindingShadowWarningsForScope } from './binding-diagnostics.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';
import { areTypesCompatible, inferValueExprType, type TypeInferenceContext } from './type-inference.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface ConditionLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly bindingScope?: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
  readonly typeInference?: TypeInferenceContext;
}

export interface ConditionLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

const SUPPORTED_CONDITION_OPS = ['and', 'or', 'not', '==', '!=', '<', '<=', '>', '>=', 'in', 'adjacent', 'connected', 'zonePropIncludes'];
const SUPPORTED_QUERY_KINDS = [
  'concat',
  'tokensInZone',
  'assetRows',
  'tokensInMapSpaces',
  'nextInOrderByCondition',
  'intsInRange',
  'intsInVarRange',
  'enums',
  'globalMarkers',
  'players',
  'zones',
  'mapSpaces',
  'adjacentZones',
  'tokensInAdjacentZones',
  'connectedZones',
  'binding',
];
const SUPPORTED_REFERENCE_KINDS = [
  'gvar',
  'pvar',
  'zoneCount',
  'tokenProp',
  'assetField',
  'binding',
  'markerState',
  'globalMarkerState',
  'tokenZone',
  'zoneProp',
  'activePlayer',
];

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
      if (context.typeInference !== undefined && (source.op === '==' || source.op === '!=')) {
        const leftType = inferValueExprType(left.value, context.typeInference);
        const rightType = inferValueExprType(right.value, context.typeInference);
        if (!areTypesCompatible(leftType, rightType)) {
          diagnostics.push({
            code: 'CNL_COMPILER_CONDITION_TYPE_MISMATCH',
            path,
            severity: 'warning',
            message: `Comparison operands have incompatible types: left is ${leftType}, right is ${rightType}. Strict equality will always evaluate to ${source.op === '==' ? 'false' : 'true'}.`,
            suggestion: 'Ensure both sides of the comparison have the same type.',
          });
        }
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

  if (
    'op' in source &&
    typeof source.op === 'string' &&
    (source.op === '+' ||
      source.op === '-' ||
      source.op === '*' ||
      source.op === '/' ||
      source.op === 'floorDiv' ||
      source.op === 'ceilDiv')
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
    '{ op: "+|-|*|/|floorDiv|ceilDiv", left, right }',
    '{ aggregate: { op: "count", query } }',
    '{ aggregate: { op: "sum"|"min"|"max", query, bind, valueExpr } }',
    '{ concat: ValueExpr[] }',
    '{ if: { when, then, else } }',
  ]);
}

const SUPPORTED_TOKEN_FILTER_OPS = ['eq', 'neq', 'in', 'notIn'] as const;
const SUPPORTED_ASSET_ROW_FILTER_OPS = ['eq', 'neq', 'in', 'notIn'] as const;

function lowerTokenFilterEntry(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<TokenFilterPredicate> {
  if (!isRecord(source) || typeof source.prop !== 'string') {
    return missingCapability(path, 'token filter entry', source, ['{ prop: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }']);
  }
  const prop = source.prop;

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
    const namedSetReference = lowerNamedSetReference(rawValue);
    if (namedSetReference !== null) {
      const values = context.namedSets?.[namedSetReference.name];
      if (values === undefined) {
        return {
          value: null,
          diagnostics: [{
            code: 'CNL_COMPILER_UNKNOWN_NAMED_SET',
            path: `${path}.value.name`,
            severity: 'error',
            message: `Unknown metadata.namedSets entry "${namedSetReference.name}".`,
            suggestion: 'Declare the set under metadata.namedSets or use a literal string array.',
            ...(context.namedSets === undefined ? {} : { alternatives: Object.keys(context.namedSets).sort((left, right) => left.localeCompare(right)) }),
          }],
        };
      }
      return {
        value: { prop, op, value: [...values] },
        diagnostics: [],
      };
    }

    if (!Array.isArray(rawValue) || rawValue.some((item: unknown) => typeof item !== 'string')) {
      return missingCapability(`${path}.value`, 'token filter set value', rawValue, ['string[]']);
    }
    const stringValues = rawValue as readonly string[];
    const diagnostics = stringValues.flatMap((item, index) =>
      validateCanonicalTokenTraitLiteral(context, prop, item, `${path}.value.${index}`),
    );
    return {
      value: { prop, op, value: [...stringValues] },
      diagnostics,
    };
  }

  // For 'eq'/'neq', value is a ValueExpr (string, number, boolean, or reference)
  const loweredValue = lowerValueNode(rawValue, context, `${path}.value`);
  if (loweredValue.value === null) {
    return { value: null, diagnostics: loweredValue.diagnostics };
  }

  const canonicalDiagnostics =
    typeof loweredValue.value === 'string'
      ? validateCanonicalTokenTraitLiteral(context, prop, loweredValue.value, `${path}.value`)
      : [];

  return {
    value: { prop, op, value: loweredValue.value },
    diagnostics: [...loweredValue.diagnostics, ...canonicalDiagnostics],
  };
}

function lowerNamedSetReference(source: unknown): { readonly name: string } | null {
  if (!isRecord(source) || source.ref !== 'namedSet' || typeof source.name !== 'string' || source.name.trim() === '') {
    return null;
  }
  return { name: source.name.trim().normalize('NFC') };
}

function lowerAssetRowFilterEntry(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<AssetRowPredicate> {
  if (!isRecord(source) || typeof source.field !== 'string') {
    return missingCapability(path, 'assetRows where entry', source, ['{ field: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }']);
  }
  const field = source.field;

  const resolvedOp =
    source.op !== undefined ? source.op :
    source.eq !== undefined ? 'eq' :
    source.neq !== undefined ? 'neq' :
    source.in !== undefined ? 'in' :
    source.notIn !== undefined ? 'notIn' :
    undefined;

  if (
    typeof resolvedOp !== 'string' ||
    !SUPPORTED_ASSET_ROW_FILTER_OPS.includes(resolvedOp as typeof SUPPORTED_ASSET_ROW_FILTER_OPS[number])
  ) {
    return missingCapability(path, 'assetRows where operator', resolvedOp, [...SUPPORTED_ASSET_ROW_FILTER_OPS]);
  }

  const op = resolvedOp as AssetRowPredicate['op'];
  const rawValue =
    source.value !== undefined ? source.value :
    source.eq !== undefined ? source.eq :
    source.neq !== undefined ? source.neq :
    source.in !== undefined ? source.in :
    source.notIn !== undefined ? source.notIn :
    undefined;

  if (rawValue === undefined) {
    return missingCapability(path, 'assetRows where value', source, ['{ field, op, value: <string|string[]|ValueExpr> }']);
  }

  if (op === 'in' || op === 'notIn') {
    if (!Array.isArray(rawValue) || rawValue.some((item) => typeof item !== 'string')) {
      return missingCapability(`${path}.value`, 'assetRows set value', rawValue, ['string[]']);
    }
    return {
      value: { field, op, value: [...rawValue] },
      diagnostics: [],
    };
  }

  const loweredValue = lowerValueNode(rawValue, context, `${path}.value`);
  if (loweredValue.value === null) {
    return { value: null, diagnostics: loweredValue.diagnostics };
  }

  return {
    value: { field, op, value: loweredValue.value },
    diagnostics: loweredValue.diagnostics,
  };
}

function lowerAssetRowFilterArray(
  source: readonly unknown[],
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<readonly AssetRowPredicate[]> {
  const diagnostics: Diagnostic[] = [];
  const predicates: AssetRowPredicate[] = [];

  for (let i = 0; i < source.length; i += 1) {
    const lowered = lowerAssetRowFilterEntry(source[i], context, `${path}[${i}]`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value === null) {
      return { value: null, diagnostics };
    }
    predicates.push(lowered.value);
  }

  return { value: predicates, diagnostics };
}

function validateCanonicalTokenTraitLiteral(
  context: ConditionLoweringContext,
  prop: string,
  value: string,
  path: string,
): readonly Diagnostic[] {
  const vocabulary = context.tokenTraitVocabulary?.[prop];
  if (vocabulary === undefined || vocabulary.length === 0) {
    return [];
  }
  if (vocabulary.includes(value)) {
    return [];
  }
  return [
    {
      code: 'CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL',
      path,
      severity: 'error',
      message: `Token filter uses non-canonical value "${value}" for prop "${prop}".`,
      suggestion: 'Use a canonical value declared by piece runtime props.',
      alternatives: [...vocabulary],
    },
  ];
}

export function lowerTokenFilterArray(
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
    case 'concat': {
      if (!Array.isArray(source.sources) || source.sources.length === 0) {
        return missingCapability(path, 'concat query', source, ['{ query: "concat", sources: [<OptionsQuery>, ...] }']);
      }

      const diagnostics: Diagnostic[] = [];
      const loweredSources: OptionsQuery[] = [];

      source.sources.forEach((entry, index) => {
        const lowered = lowerQueryNode(entry, context, `${path}.sources[${index}]`);
        diagnostics.push(...lowered.diagnostics);
        if (lowered.value !== null) {
          loweredSources.push(lowered.value);
        }
      });

      if (loweredSources.length !== source.sources.length) {
        return { value: null, diagnostics };
      }

      return {
        value: {
          query: 'concat',
          sources: loweredSources as [OptionsQuery, ...OptionsQuery[]],
        },
        diagnostics,
      };
    }
    case 'tokensInZone': {
      const zone = lowerZoneRef(source.zone, context, `${path}.zone`);
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
    case 'assetRows': {
      if (typeof source.tableId !== 'string' || source.tableId.trim() === '') {
        return missingCapability(path, 'assetRows query', source, [
          '{ query: "assetRows", tableId: string, where?: [...], cardinality?: "many"|"exactlyOne"|"zeroOrOne" }',
        ]);
      }

      let cardinality: AssetRowsCardinality | undefined;
      if (source.cardinality !== undefined) {
        if (
          source.cardinality !== 'many' &&
          source.cardinality !== 'exactlyOne' &&
          source.cardinality !== 'zeroOrOne'
        ) {
          return missingCapability(`${path}.cardinality`, 'assetRows cardinality', source.cardinality, [
            'many',
            'exactlyOne',
            'zeroOrOne',
          ]);
        }
        cardinality = source.cardinality;
      }

      if (source.where !== undefined) {
        if (!Array.isArray(source.where)) {
          return missingCapability(`${path}.where`, 'assetRows where', source.where, ['Array<{ field, op, value }>']);
        }
        const loweredWhere = lowerAssetRowFilterArray(source.where as readonly unknown[], context, `${path}.where`);
        if (loweredWhere.value === null) {
          return { value: null, diagnostics: loweredWhere.diagnostics };
        }
        return {
          value: {
            query: 'assetRows',
            tableId: source.tableId,
            where: loweredWhere.value,
            ...(cardinality === undefined ? {} : { cardinality }),
          },
          diagnostics: loweredWhere.diagnostics,
        };
      }

      return {
        value: {
          query: 'assetRows',
          tableId: source.tableId,
          ...(cardinality === undefined ? {} : { cardinality }),
        },
        diagnostics: [],
      };
    }
    case 'tokensInMapSpaces': {
      const diagnostics: Diagnostic[] = [];
      let spaceFilter:
        | {
            readonly owner?: PlayerSel;
            readonly condition?: ConditionAST;
          }
        | undefined;

      if (source.spaceFilter !== undefined) {
        if (!isRecord(source.spaceFilter)) {
          return missingCapability(`${path}.spaceFilter`, 'tokensInMapSpaces spaceFilter', source.spaceFilter, [
            '{ owner: <PlayerSel> }',
            '{ op: "and"|"or"|..., args: [...] }',
          ]);
        }

        if (typeof source.spaceFilter.op === 'string') {
          const loweredCondition = lowerConditionNode(source.spaceFilter, context, `${path}.spaceFilter`);
          diagnostics.push(...loweredCondition.diagnostics);
          if (loweredCondition.value === null) {
            return { value: null, diagnostics };
          }
          spaceFilter = { condition: loweredCondition.value };
        } else if (source.spaceFilter.owner !== undefined) {
          const owner = normalizePlayerSelector(source.spaceFilter.owner, `${path}.spaceFilter.owner`);
          diagnostics.push(...owner.diagnostics);
          if (owner.value === null) {
            return { value: null, diagnostics };
          }
          const filterObj: { readonly owner: PlayerSel; readonly condition?: ConditionAST } = { owner: owner.value };
          if (source.spaceFilter.condition !== undefined) {
            const loweredCondition = lowerConditionNode(source.spaceFilter.condition, context, `${path}.spaceFilter.condition`);
            diagnostics.push(...loweredCondition.diagnostics);
            if (loweredCondition.value === null) {
              return { value: null, diagnostics };
            }
            spaceFilter = { ...filterObj, condition: loweredCondition.value };
          } else {
            spaceFilter = filterObj;
          }
        } else {
          return missingCapability(`${path}.spaceFilter`, 'tokensInMapSpaces spaceFilter', source.spaceFilter, [
            '{ owner: <PlayerSel> }',
            '{ op: "and"|"or"|..., args: [...] }',
          ]);
        }
      }

      if (source.filter !== undefined) {
        if (!Array.isArray(source.filter)) {
          return missingCapability(`${path}.filter`, 'tokensInMapSpaces filter', source.filter, ['Array<{ prop, op, value }>']);
        }
        const loweredFilter = lowerTokenFilterArray(source.filter as readonly unknown[], context, `${path}.filter`);
        diagnostics.push(...loweredFilter.diagnostics);
        if (loweredFilter.value === null) {
          return { value: null, diagnostics };
        }
        return {
          value: {
            query: 'tokensInMapSpaces',
            ...(spaceFilter === undefined ? {} : { spaceFilter }),
            filter: loweredFilter.value,
          },
          diagnostics,
        };
      }

      return {
        value: {
          query: 'tokensInMapSpaces',
          ...(spaceFilter === undefined ? {} : { spaceFilter }),
        },
        diagnostics,
      };
    }
    case 'nextInOrderByCondition': {
      if (typeof source.bind !== 'string' || source.bind.trim() === '') {
        return missingCapability(path, 'nextInOrderByCondition query', source, [
          '{ query: "nextInOrderByCondition", source: <OptionsQuery>, from: <ValueExpr>, bind: string, where: <ConditionAST>, includeFrom?: boolean }',
        ]);
      }
      if (!isCanonicalBindingIdentifier(source.bind)) {
        return {
          value: null,
          diagnostics: [
            {
              code: 'CNL_COMPILER_NEXT_IN_ORDER_BIND_INVALID',
              path: `${path}.bind`,
              severity: 'error',
              message: `nextInOrderByCondition.bind "${source.bind}" must be a canonical "$name" token.`,
              suggestion: 'Use a canonical binding token like "$seatCandidate".',
            },
          ],
        };
      }
      const sourceOrder = lowerQueryNode(source.source, context, `${path}.source`);
      const from = lowerValueNode(source.from, context, `${path}.from`);
      const where = lowerConditionNode(
        source.where,
        { ...context, bindingScope: [...(context.bindingScope ?? []), source.bind] },
        `${path}.where`,
      );
      const diagnostics = [
        ...bindingShadowWarningsForScope(source.bind, `${path}.bind`, context.bindingScope),
        ...sourceOrder.diagnostics,
        ...from.diagnostics,
        ...where.diagnostics,
      ];
      if (sourceOrder.value === null || from.value === null || where.value === null) {
        return { value: null, diagnostics };
      }
      if (source.includeFrom !== undefined && typeof source.includeFrom !== 'boolean') {
        return missingCapability(`${path}.includeFrom`, 'nextInOrderByCondition includeFrom', source.includeFrom, ['true', 'false']);
      }
      return {
        value: {
          query: 'nextInOrderByCondition',
          source: sourceOrder.value,
          from: from.value,
          bind: source.bind,
          where: where.value,
          ...(source.includeFrom === undefined ? {} : { includeFrom: source.includeFrom }),
        },
        diagnostics,
      };
    }
    case 'intsInRange': {
      const min = lowerIntDomainBound(source.min, context, `${path}.min`);
      const max = lowerIntDomainBound(source.max, context, `${path}.max`);
      const step =
        source.step === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.step, context, `${path}.step`);
      const maxResults =
        source.maxResults === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.maxResults, context, `${path}.maxResults`);
      if (source.alwaysInclude !== undefined && !Array.isArray(source.alwaysInclude)) {
        return missingCapability(`${path}.alwaysInclude`, 'intsInRange alwaysInclude', source.alwaysInclude, ['number[]']);
      }
      const alwaysIncludeResults =
        source.alwaysInclude?.map((entry, index) => lowerIntDomainBound(entry, context, `${path}.alwaysInclude[${index}]`)) ?? [];
      const diagnostics = [
        ...min.diagnostics,
        ...max.diagnostics,
        ...step.diagnostics,
        ...maxResults.diagnostics,
        ...alwaysIncludeResults.flatMap((entry) => entry.diagnostics),
      ];
      if (
        min.value === null
        || max.value === null
        || step.value === null
        || maxResults.value === null
        || alwaysIncludeResults.some((entry) => entry.value === null)
      ) {
        return { value: null, diagnostics };
      }
      const alwaysInclude: NumericValueExpr[] = alwaysIncludeResults.map((entry) => entry.value as NumericValueExpr);
      return {
        value: {
          query: 'intsInRange',
          min: min.value,
          max: max.value,
          ...(step.value === undefined ? {} : { step: step.value }),
          ...(alwaysInclude.length === 0 ? {} : { alwaysInclude }),
          ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
        },
        diagnostics,
      };
    }
    case 'intsInVarRange': {
      if (typeof source.var !== 'string' || source.var.trim() === '') {
        return missingCapability(path, 'intsInVarRange query', source, [
          '{ query: "intsInVarRange", var: string, scope?: "global"|"perPlayer", min?: <NumericValueExpr>, max?: <NumericValueExpr>, step?: <NumericValueExpr>, alwaysInclude?: <NumericValueExpr[]>, maxResults?: <NumericValueExpr> }',
        ]);
      }

      if (source.scope !== undefined && source.scope !== 'global' && source.scope !== 'perPlayer') {
        return missingCapability(`${path}.scope`, 'intsInVarRange scope', source.scope, ['global', 'perPlayer']);
      }

      const min =
        source.min === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.min, context, `${path}.min`);
      const max =
        source.max === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.max, context, `${path}.max`);
      const step =
        source.step === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.step, context, `${path}.step`);
      const maxResults =
        source.maxResults === undefined
          ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
          : lowerIntDomainBound(source.maxResults, context, `${path}.maxResults`);
      if (source.alwaysInclude !== undefined && !Array.isArray(source.alwaysInclude)) {
        return missingCapability(`${path}.alwaysInclude`, 'intsInVarRange alwaysInclude', source.alwaysInclude, ['number[]']);
      }
      const alwaysIncludeResults =
        source.alwaysInclude?.map((entry, index) => lowerIntDomainBound(entry, context, `${path}.alwaysInclude[${index}]`)) ?? [];
      const diagnostics = [
        ...min.diagnostics,
        ...max.diagnostics,
        ...step.diagnostics,
        ...maxResults.diagnostics,
        ...alwaysIncludeResults.flatMap((entry) => entry.diagnostics),
      ];
      const minValue = source.min === undefined ? undefined : min.value;
      const maxValue = source.max === undefined ? undefined : max.value;
      if (
        minValue === null
        || maxValue === null
        || step.value === null
        || maxResults.value === null
        || alwaysIncludeResults.some((entry) => entry.value === null)
      ) {
        return { value: null, diagnostics };
      }
      const alwaysInclude: NumericValueExpr[] = alwaysIncludeResults.map((entry) => entry.value as NumericValueExpr);

      return {
        value: {
          query: 'intsInVarRange',
          var: source.var,
          ...(source.scope === undefined ? {} : { scope: source.scope }),
          ...(minValue === undefined ? {} : { min: minValue }),
          ...(maxValue === undefined ? {} : { max: maxValue }),
          ...(step.value === undefined ? {} : { step: step.value }),
          ...(alwaysInclude.length === 0 ? {} : { alwaysInclude }),
          ...(maxResults.value === undefined ? {} : { maxResults: maxResults.value }),
        },
        diagnostics,
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
    case 'globalMarkers': {
      if (source.markers !== undefined && (!Array.isArray(source.markers) || source.markers.some((value) => typeof value !== 'string'))) {
        return missingCapability(path, 'globalMarkers query markers', source, [
          '{ query: "globalMarkers", markers?: string[], states?: string[] }',
        ]);
      }
      if (source.states !== undefined && (!Array.isArray(source.states) || source.states.some((value) => typeof value !== 'string'))) {
        return missingCapability(path, 'globalMarkers query states', source, [
          '{ query: "globalMarkers", markers?: string[], states?: string[] }',
        ]);
      }
      return {
        value: {
          query: 'globalMarkers',
          ...(source.markers === undefined ? {} : { markers: [...source.markers] }),
          ...(source.states === undefined ? {} : { states: [...source.states] }),
        },
        diagnostics: [],
      };
    }
    case 'players':
      return {
        value: { query: 'players' },
        diagnostics: [],
      };
    case 'zones':
    case 'mapSpaces': {
      if (source.filter === undefined) {
        return { value: { query: source.query }, diagnostics: [] };
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
          value: { query: source.query, filter: { condition: lowered.value } },
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
            value: { query: source.query, filter: { ...filterObj, condition: loweredCondition.value } },
            diagnostics: [...owner.diagnostics, ...loweredCondition.diagnostics],
          };
        }
        return {
          value: { query: source.query, filter: filterObj },
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
      const zone = lowerZoneRef(source.zone, context, `${path}.zone`);
      if (zone.value === null) {
        return { value: null, diagnostics: zone.diagnostics };
      }
      return {
        value: { query: 'adjacentZones', zone: zone.value },
        diagnostics: zone.diagnostics,
      };
    }
    case 'tokensInAdjacentZones': {
      const zone = lowerZoneRef(source.zone, context, `${path}.zone`);
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
      const zone = lowerZoneRef(source.zone, context, `${path}.zone`);
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
          code: 'CNL_COMPILER_ZONE_SELECTOR_INVALID',
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

function lowerIntDomainBound(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<NumericValueExpr> {
  return lowerNumericValueNode(source, context, path);
}

export function lowerNumericValueNode(
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
      '{ op: "+"|"-"|"*"|"/"|"floorDiv"|"ceilDiv", left: <numeric>, right: <numeric> }',
      '{ aggregate: { op: "count", query: <OptionsQuery> } }',
      '{ aggregate: { op: "sum"|"min"|"max", query: <OptionsQuery>, bind: string, valueExpr: <NumericValueExpr> } }',
      '{ if: { when: <ConditionAST>, then: <numeric>, else: <numeric> } }',
    ]);
  }
  return { value: lowered.value, diagnostics: lowered.diagnostics };
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
    case 'assetField':
      if (typeof source.row === 'string' && typeof source.tableId === 'string' && typeof source.field === 'string') {
        if (context.bindingScope !== undefined && !hasBindingIdentifier(source.row, context.bindingScope)) {
          return {
            value: null,
            diagnostics: [
              {
                code: 'CNL_COMPILER_BINDING_UNBOUND',
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
    case 'activePlayer':
      return { value: { ref: 'activePlayer' }, diagnostics: [] };
    case 'binding':
      if (typeof source.name === 'string') {
        if (context.bindingScope !== undefined && !hasBindingIdentifier(source.name, context.bindingScope)) {
          return {
            value: null,
            diagnostics: [
              {
                code: 'CNL_COMPILER_BINDING_UNBOUND',
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
