import type { Diagnostic } from '../kernel/diagnostics.js';
import type { AssetRowsCardinality, ConditionAST, NumericValueExpr, OptionsQuery, PlayerSel } from '../kernel/types.js';
import { isCanonicalBindingIdentifier } from '../contracts/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  type ConditionLoweringContext,
  type ConditionLoweringResult,
  type ConditionLoweringRuntime,
  isRecord,
  missingCapability,
  SUPPORTED_QUERY_KINDS,
} from './compile-conditions-shared.js';
import { bindingShadowWarningsForScope } from './binding-diagnostics.js';
import { normalizePlayerSelector } from './compile-selectors.js';

export function createQueryLowerers(
  runtime: ConditionLoweringRuntime,
): Pick<ConditionLoweringRuntime, 'lowerQueryNode'> {
  function lowerQueryNode(
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
          const lowered = runtime.lowerQueryNode(entry, context, `${path}.sources[${index}]`);
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
      case 'prioritized': {
        if (!Array.isArray(source.tiers) || source.tiers.length === 0) {
          return missingCapability(path, 'prioritized query', source, [
            '{ query: "prioritized", tiers: [<OptionsQuery>, ...], qualifierKey?: string }',
          ]);
        }
        if (source.qualifierKey !== undefined && typeof source.qualifierKey !== 'string') {
          return missingCapability(`${path}.qualifierKey`, 'prioritized qualifierKey', source.qualifierKey, ['string']);
        }

        const diagnostics: Diagnostic[] = [];
        const loweredTiers: OptionsQuery[] = [];

        source.tiers.forEach((entry, index) => {
          const lowered = runtime.lowerQueryNode(entry, context, `${path}.tiers[${index}]`);
          diagnostics.push(...lowered.diagnostics);
          if (lowered.value !== null) {
            loweredTiers.push(lowered.value);
          }
        });

        if (loweredTiers.length !== source.tiers.length) {
          return { value: null, diagnostics };
        }

        return {
          value: {
            query: 'prioritized',
            tiers: loweredTiers as [OptionsQuery, ...OptionsQuery[]],
            ...(source.qualifierKey === undefined ? {} : { qualifierKey: source.qualifierKey }),
          },
          diagnostics,
        };
      }
      case 'tokenZones': {
        const sourceQuery = runtime.lowerQueryNode(source.source, context, `${path}.source`);
        const diagnostics = [...sourceQuery.diagnostics];
        if (sourceQuery.value === null) {
          return { value: null, diagnostics };
        }
        if (source.dedupe !== undefined && typeof source.dedupe !== 'boolean') {
          return missingCapability(`${path}.dedupe`, 'tokenZones dedupe', source.dedupe, ['true', 'false']);
        }
        return {
          value: {
            query: 'tokenZones',
            source: sourceQuery.value,
            ...(source.dedupe === undefined ? {} : { dedupe: source.dedupe }),
          },
          diagnostics,
        };
      }
      case 'tokensInZone': {
        const zone = runtime.lowerZoneRef(source.zone, context, `${path}.zone`);
        if (zone.value === null) {
          return { value: null, diagnostics: zone.diagnostics };
        }
        if (source.filter !== undefined) {
          const loweredFilter = runtime.lowerTokenFilterExpr(source.filter, context, `${path}.filter`);
          if (loweredFilter.value === null) {
            return { value: null, diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics] };
          }
          return {
            value: {
              query: 'tokensInZone',
              zone: zone.value,
              filter: loweredFilter.value,
            },
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
          const loweredWhere = runtime.lowerAssetRowFilterArray(source.where as readonly unknown[], context, `${path}.where`);
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
            const loweredCondition = runtime.lowerConditionNode(source.spaceFilter, context, `${path}.spaceFilter`);
            diagnostics.push(...loweredCondition.diagnostics);
            if (loweredCondition.value === null) {
              return { value: null, diagnostics };
            }
            spaceFilter = { condition: loweredCondition.value };
          } else if (source.spaceFilter.owner !== undefined) {
            const owner = normalizePlayerSelector(source.spaceFilter.owner, `${path}.spaceFilter.owner`, context.seatIds);
            diagnostics.push(...owner.diagnostics);
            if (owner.value === null) {
              return { value: null, diagnostics };
            }
            const filterObj: { readonly owner: PlayerSel; readonly condition?: ConditionAST } = { owner: owner.value };
            if (source.spaceFilter.condition !== undefined) {
              const loweredCondition = runtime.lowerConditionNode(source.spaceFilter.condition, context, `${path}.spaceFilter.condition`);
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
          const loweredFilter = runtime.lowerTokenFilterExpr(source.filter, context, `${path}.filter`);
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
                code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_NEXT_IN_ORDER_BIND_INVALID,
                path: `${path}.bind`,
                severity: 'error',
                message: `nextInOrderByCondition.bind "${source.bind}" must be a canonical "$name" token.`,
                suggestion: 'Use a canonical binding token like "$seatCandidate".',
              },
            ],
          };
        }
        const sourceOrder = runtime.lowerQueryNode(source.source, context, `${path}.source`);
        const from = runtime.lowerValueNode(source.from, context, `${path}.from`);
        const where = runtime.lowerConditionNode(
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
        const min = runtime.lowerNumericValueNode(source.min, context, `${path}.min`);
        const max = runtime.lowerNumericValueNode(source.max, context, `${path}.max`);
        const step =
          source.step === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.step, context, `${path}.step`);
        const maxResults =
          source.maxResults === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.maxResults, context, `${path}.maxResults`);
        if (source.alwaysInclude !== undefined && !Array.isArray(source.alwaysInclude)) {
          return missingCapability(`${path}.alwaysInclude`, 'intsInRange alwaysInclude', source.alwaysInclude, ['number[]']);
        }
        const alwaysIncludeResults =
          source.alwaysInclude?.map((entry, index) => runtime.lowerNumericValueNode(entry, context, `${path}.alwaysInclude[${index}]`)) ?? [];
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
        const variable = runtime.lowerScopedVarNameExpr(source.var, `${path}.var`);
        if (variable.value === null) {
          return missingCapability(path, 'intsInVarRange query', source, [
            '{ query: "intsInVarRange", var: string | { ref: "binding", name: string } | { ref: "grantContext", key: string }, scope?: "global"|"perPlayer", min?: <NumericValueExpr>, max?: <NumericValueExpr>, step?: <NumericValueExpr>, alwaysInclude?: <NumericValueExpr[]>, maxResults?: <NumericValueExpr> }',
          ]);
        }

        if (source.scope !== undefined && source.scope !== 'global' && source.scope !== 'perPlayer') {
          return missingCapability(`${path}.scope`, 'intsInVarRange scope', source.scope, ['global', 'perPlayer']);
        }

        const min =
          source.min === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.min, context, `${path}.min`);
        const max =
          source.max === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.max, context, `${path}.max`);
        const step =
          source.step === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.step, context, `${path}.step`);
        const maxResults =
          source.maxResults === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerNumericValueNode(source.maxResults, context, `${path}.maxResults`);
        if (source.alwaysInclude !== undefined && !Array.isArray(source.alwaysInclude)) {
          return missingCapability(`${path}.alwaysInclude`, 'intsInVarRange alwaysInclude', source.alwaysInclude, ['number[]']);
        }
        const alwaysIncludeResults =
          source.alwaysInclude?.map((entry, index) => runtime.lowerNumericValueNode(entry, context, `${path}.alwaysInclude[${index}]`)) ?? [];
        const diagnostics = [
          ...variable.diagnostics,
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
            var: variable.value,
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

        if (typeof source.filter.op === 'string') {
          const lowered = runtime.lowerConditionNode(source.filter, context, `${path}.filter`);
          if (lowered.value === null) {
            return { value: null, diagnostics: lowered.diagnostics };
          }
          return {
            value: { query: source.query, filter: { condition: lowered.value } },
            diagnostics: lowered.diagnostics,
          };
        }

        if (source.filter.owner !== undefined) {
          const owner = normalizePlayerSelector(source.filter.owner, `${path}.filter.owner`, context.seatIds);
          if (owner.value === null) {
            return { value: null, diagnostics: owner.diagnostics };
          }
          const filterObj: { readonly owner: PlayerSel; readonly condition?: ConditionAST } = { owner: owner.value };
          if (source.filter.condition !== undefined) {
            const loweredCondition = runtime.lowerConditionNode(source.filter.condition, context, `${path}.filter.condition`);
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

        if (source.filter.condition !== undefined) {
          const loweredCondition = runtime.lowerConditionNode(source.filter.condition, context, `${path}.filter.condition`);
          if (loweredCondition.value === null) {
            return { value: null, diagnostics: loweredCondition.diagnostics };
          }
          return {
            value: { query: source.query, filter: { condition: loweredCondition.value } },
            diagnostics: loweredCondition.diagnostics,
          };
        }

        return missingCapability(`${path}.filter`, 'zones query filter', source.filter, [
          '{ condition: <ConditionAST> }',
          '{ owner: <PlayerSel> }',
          '{ op: "and"|"or"|..., args: [...] }',
        ]);
      }
      case 'adjacentZones': {
        const zone = runtime.lowerZoneRef(source.zone, context, `${path}.zone`);
        if (zone.value === null) {
          return { value: null, diagnostics: zone.diagnostics };
        }
        return {
          value: { query: 'adjacentZones', zone: zone.value },
          diagnostics: zone.diagnostics,
        };
      }
      case 'tokensInAdjacentZones': {
        const zone = runtime.lowerZoneRef(source.zone, context, `${path}.zone`);
        if (zone.value === null) {
          return { value: null, diagnostics: zone.diagnostics };
        }
        if (source.filter !== undefined) {
          const loweredFilter = runtime.lowerTokenFilterExpr(source.filter, context, `${path}.filter`);
          if (loweredFilter.value === null) {
            return { value: null, diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics] };
          }
          return {
            value: {
              query: 'tokensInAdjacentZones',
              zone: zone.value,
              filter: loweredFilter.value,
            },
            diagnostics: [...zone.diagnostics, ...loweredFilter.diagnostics],
          };
        }
        return {
          value: { query: 'tokensInAdjacentZones', zone: zone.value },
          diagnostics: zone.diagnostics,
        };
      }
      case 'connectedZones': {
        const zone = runtime.lowerZoneRef(source.zone, context, `${path}.zone`);
        const via =
          source.via === undefined
            ? { value: undefined, diagnostics: [] as readonly Diagnostic[] }
            : runtime.lowerConditionNode(source.via, context, `${path}.via`);
        const includeStart = source.includeStart;
        const includeStartValue = typeof includeStart === 'boolean' ? includeStart : undefined;
        const includeStartDiagnostic =
          includeStart === undefined || includeStartValue !== undefined
            ? []
            : [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
                  path: `${path}.includeStart`,
                  severity: 'error' as const,
                  message: 'connectedZones.includeStart must be a boolean literal.',
                  suggestion: 'Use includeStart: true or includeStart: false.',
                },
              ];
        const allowTargetOutsideVia = source.allowTargetOutsideVia;
        const allowTargetOutsideViaValue = typeof allowTargetOutsideVia === 'boolean' ? allowTargetOutsideVia : undefined;
        const allowTargetOutsideViaDiagnostic =
          allowTargetOutsideVia === undefined || allowTargetOutsideViaValue !== undefined
            ? []
            : [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
                  path: `${path}.allowTargetOutsideVia`,
                  severity: 'error' as const,
                  message: 'connectedZones.allowTargetOutsideVia must be a boolean literal.',
                  suggestion: 'Use allowTargetOutsideVia: true or allowTargetOutsideVia: false.',
                },
              ];
        const maxDepth = source.maxDepth;
        const maxDepthValue = typeof maxDepth === 'number' && Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : undefined;
        const maxDepthDiagnostic =
          maxDepth === undefined || maxDepthValue !== undefined
            ? []
            : [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
                  path: `${path}.maxDepth`,
                  severity: 'error' as const,
                  message: 'connectedZones.maxDepth must be an integer literal >= 0.',
                  suggestion: 'Use a non-negative integer literal maxDepth.',
                },
              ];
        const diagnostics = [
          ...zone.diagnostics,
          ...via.diagnostics,
          ...includeStartDiagnostic,
          ...allowTargetOutsideViaDiagnostic,
          ...maxDepthDiagnostic,
        ];
        if (
          zone.value === null
          || via.value === null
          || includeStartDiagnostic.length > 0
          || allowTargetOutsideViaDiagnostic.length > 0
          || maxDepthDiagnostic.length > 0
        ) {
          return { value: null, diagnostics };
        }
        return {
          value: {
            query: 'connectedZones',
            zone: zone.value,
            ...(via.value === undefined ? {} : { via: via.value }),
            ...(includeStartValue === undefined ? {} : { includeStart: includeStartValue }),
            ...(allowTargetOutsideViaValue === undefined ? {} : { allowTargetOutsideVia: allowTargetOutsideViaValue }),
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
      case 'grantContext':
        if (typeof source.key === 'string') {
          return {
            value: { query: 'grantContext', key: source.key },
            diagnostics: [],
          };
        }
        return missingCapability(path, 'grantContext query', source, ['{ query: "grantContext", key: string }']);
      case 'capturedSequenceZones': {
        const loweredKey = runtime.lowerFreeOperationSequenceKeyExpr(source.key, `${path}.key`);
        if (loweredKey.value === null) {
          return { value: null, diagnostics: loweredKey.diagnostics };
        }
        return {
          value: { query: 'capturedSequenceZones', key: loweredKey.value },
          diagnostics: loweredKey.diagnostics,
        };
      }
      default:
        return missingCapability(path, 'query kind', source.query, SUPPORTED_QUERY_KINDS);
    }
  }

  return { lowerQueryNode };
}
