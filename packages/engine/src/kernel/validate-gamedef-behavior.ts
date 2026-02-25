import type { Diagnostic } from './diagnostics.js';
import type {
  ConditionAST,
  EffectAST,
  GameDef,
  NumericValueExpr,
  OptionsQuery,
  Reference,
  TokenFilterPredicate,
  ValueExpr,
  ZoneRef,
} from './types.js';
import { isNumericValueExpr } from './numeric-value-expr.js';
import { isCanonicalBindingIdentifier } from './binding-identifier-contract.js';
import {
  type ValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateZoneSelector,
} from './validate-gamedef-structure.js';
import {
  areSourceAndAnchorShapesCompatible,
  dedupeQueryRuntimeShapes,
  dedupeValueRuntimeShapes,
  inferQueryRuntimeShapes,
  inferValueRuntimeShapes,
} from './query-shape-inference.js';

function validateStaticMapSpaceSelector(
  diagnostics: Diagnostic[],
  zoneSelector: string,
  path: string,
  context: ValidationContext,
): void {
  if (context.mapSpaceZoneCandidates.length === 0) {
    return;
  }

  if (zoneSelector.startsWith('$')) {
    return;
  }

  if (!zoneSelector.includes(':')) {
    return;
  }

  if (context.mapSpaceZoneNames.has(zoneSelector)) {
    return;
  }

  pushMissingReferenceDiagnostic(
    diagnostics,
    'REF_MAP_SPACE_MISSING',
    path,
    `Zone "${zoneSelector}" is not a declared map space.`,
    zoneSelector,
    context.mapSpaceZoneCandidates,
  );
}

function validateMapSpacePropertyReference(
  diagnostics: Diagnostic[],
  zoneSelector: string,
  prop: string,
  path: string,
  context: ValidationContext,
  expectedKind: 'scalar' | 'array',
): void {
  if (context.mapSpaceZoneCandidates.length === 0) {
    return;
  }

  validateStaticMapSpaceSelector(diagnostics, zoneSelector, `${path}.zone`, context);

  const propertyKind = context.mapSpacePropKinds.get(prop);
  if (propertyKind === undefined) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_MAP_SPACE_PROP_MISSING',
      `${path}.prop`,
      `Unknown map-space property "${prop}".`,
      prop,
      context.mapSpacePropCandidates,
    );
    return;
  }

  if (propertyKind === 'mixed' || propertyKind === expectedKind) {
    return;
  }

  diagnostics.push({
    code: 'REF_MAP_SPACE_PROP_KIND_INVALID',
    path: `${path}.prop`,
    severity: 'error',
    message:
      expectedKind === 'scalar'
        ? `Property "${prop}" is array-valued in map spaces and cannot be used with zoneProp.`
        : `Property "${prop}" is scalar-valued in map spaces and cannot be used with zonePropIncludes.`,
    suggestion:
      expectedKind === 'scalar'
        ? 'Use zonePropIncludes for array membership checks.'
        : 'Use zoneProp with comparison operators for scalar properties.',
  });
}

const validateReference = (
  diagnostics: Diagnostic[],
  reference: Reference,
  path: string,
  context: ValidationContext,
): void => {
  if (reference.ref === 'gvar' && !context.globalVarNames.has(reference.var)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_GVAR_MISSING',
      `${path}.var`,
      `Unknown global variable "${reference.var}".`,
      reference.var,
      context.globalVarCandidates,
    );
    return;
  }

  if (reference.ref === 'pvar' && !context.perPlayerVarNames.has(reference.var)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_PVAR_MISSING',
      `${path}.var`,
      `Unknown per-player variable "${reference.var}".`,
      reference.var,
      context.perPlayerVarCandidates,
    );
    return;
  }

  if (reference.ref === 'pvar') {
    validatePlayerSelector(diagnostics, reference.player, `${path}.player`, context);
  }

  if (reference.ref === 'zoneCount') {
    validateZoneSelector(diagnostics, reference.zone, `${path}.zone`, context);
    return;
  }

  if (reference.ref === 'markerState') {
    validateZoneSelector(diagnostics, reference.space, `${path}.space`, context);
    if (!context.markerLatticeNames.has(reference.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.marker`,
        `Unknown marker lattice "${reference.marker}".`,
        reference.marker,
        context.markerLatticeCandidates,
      );
    }
    return;
  }

  if (reference.ref === 'globalMarkerState') {
    if (!context.globalMarkerLatticeNames.has(reference.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.marker`,
        `Unknown global marker lattice "${reference.marker}".`,
        reference.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    return;
  }

  if (reference.ref === 'zoneProp') {
    validateMapSpacePropertyReference(diagnostics, reference.zone, reference.prop, path, context, 'scalar');
    return;
  }

  if (reference.ref === 'assetField') {
    const contract = context.tableContractsById.get(reference.tableId);
    if (contract === undefined) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_RUNTIME_TABLE_MISSING',
        `${path}.tableId`,
        `Unknown runtime table "${reference.tableId}".`,
        reference.tableId,
        context.tableContractCandidates,
      );
      return;
    }

    if (!contract.fields.some((field) => field.field === reference.field)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_RUNTIME_TABLE_FIELD_MISSING',
        `${path}.field`,
        `Unknown field "${reference.field}" in runtime table "${reference.tableId}".`,
        reference.field,
        contract.fields.map((field) => field.field),
      );
    }
    return;
  }
};

const tryStaticStringValue = (valueExpr: ValueExpr): string | null => {
  if (typeof valueExpr === 'string') {
    return valueExpr;
  }

  if (typeof valueExpr === 'object' && valueExpr !== null && 'concat' in valueExpr) {
    const parts: string[] = [];
    for (const entry of valueExpr.concat) {
      const part = tryStaticStringValue(entry);
      if (part === null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  }

  return null;
};

const validateMarkerStateLiteral = (
  diagnostics: Diagnostic[],
  markerId: string,
  markerStateExpr: ValueExpr,
  path: string,
  statesByMarkerId: ReadonlyMap<string, readonly string[]>,
): void => {
  const validStates = statesByMarkerId.get(markerId);
  if (validStates === undefined) {
    return;
  }

  const markerState = tryStaticStringValue(markerStateExpr);
  if (markerState === null || validStates.includes(markerState)) {
    return;
  }

  pushMissingReferenceDiagnostic(
    diagnostics,
    'REF_MARKER_STATE_MISSING',
    path,
    `Unknown marker state "${markerState}" for marker lattice "${markerId}".`,
    markerState,
    validStates,
  );
};

export const validateValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: ValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof valueExpr === 'number' || typeof valueExpr === 'boolean' || typeof valueExpr === 'string') {
    return;
  }

  if ('ref' in valueExpr) {
    validateReference(diagnostics, valueExpr, path, context);
    return;
  }

  if ('concat' in valueExpr) {
    valueExpr.concat.forEach((child, index) => {
      validateValueExpr(diagnostics, child, `${path}.concat[${index}]`, context);
    });
    return;
  }

  if ('op' in valueExpr) {
    validateValueExpr(diagnostics, valueExpr.left, `${path}.left`, context);
    validateValueExpr(diagnostics, valueExpr.right, `${path}.right`, context);
    if (
      (valueExpr.op === '/' || valueExpr.op === 'floorDiv' || valueExpr.op === 'ceilDiv') &&
      typeof valueExpr.right === 'number' &&
      valueExpr.right === 0
    ) {
      diagnostics.push({
        code: 'VALUE_EXPR_DIVISION_BY_ZERO_STATIC',
        path: `${path}.right`,
        severity: 'error',
        message: `ValueExpr "${valueExpr.op}" denominator must not be 0.`,
        suggestion: 'Use a non-zero literal denominator or guard the expression with an if condition.',
      });
    }
    return;
  }

  if ('if' in valueExpr) {
    validateConditionAst(diagnostics, valueExpr.if.when, `${path}.if.when`, context);
    validateValueExpr(diagnostics, valueExpr.if.then, `${path}.if.then`, context);
    validateValueExpr(diagnostics, valueExpr.if.else, `${path}.if.else`, context);
    return;
  }

  validateOptionsQuery(diagnostics, valueExpr.aggregate.query, `${path}.aggregate.query`, context);
  if (valueExpr.aggregate.op !== 'count') {
    validateNumericValueExpr(
      diagnostics,
      valueExpr.aggregate.valueExpr,
      `${path}.aggregate.valueExpr`,
      context,
    );
  }
};

export const validateNumericValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: NumericValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  validateValueExpr(diagnostics, valueExpr, path, context);
  if (!isNumericValueExpr(valueExpr)) {
    diagnostics.push({
      code: 'VALUE_EXPR_NUMERIC_REQUIRED',
      path,
      severity: 'error',
      message: 'Expected a numeric value expression in this context.',
      suggestion: 'Use number, numeric refs/aggregates, arithmetic, or numeric if-expression branches.',
    });
  }
};

export const validateConditionAst = (
  diagnostics: Diagnostic[],
  condition: ConditionAST,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof condition === 'boolean') {
    return;
  }

  switch (condition.op) {
    case 'and':
    case 'or': {
      condition.args.forEach((entry, index) => {
        validateConditionAst(diagnostics, entry, `${path}.args[${index}]`, context);
      });
      return;
    }
    case 'not': {
      validateConditionAst(diagnostics, condition.arg, `${path}.arg`, context);
      return;
    }
    case 'in': {
      validateValueExpr(diagnostics, condition.item, `${path}.item`, context);
      validateValueExpr(diagnostics, condition.set, `${path}.set`, context);
      return;
    }
    case 'adjacent': {
      validateZoneSelector(diagnostics, condition.left, `${path}.left`, context);
      validateZoneSelector(diagnostics, condition.right, `${path}.right`, context);
      return;
    }
    case 'connected': {
      validateZoneSelector(diagnostics, condition.from, `${path}.from`, context);
      validateZoneSelector(diagnostics, condition.to, `${path}.to`, context);
      if (condition.via) {
        validateConditionAst(diagnostics, condition.via, `${path}.via`, context);
      }
      return;
    }
    case 'zonePropIncludes': {
      validateMapSpacePropertyReference(diagnostics, condition.zone, condition.prop, path, context, 'array');
      validateValueExpr(diagnostics, condition.value, `${path}.value`, context);
      return;
    }
    default: {
      validateValueExpr(diagnostics, condition.left, `${path}.left`, context);
      validateValueExpr(diagnostics, condition.right, `${path}.right`, context);
      if ((condition.op === '==' || condition.op === '!=') && typeof condition.left === 'object' && condition.left !== null) {
        if ('ref' in condition.left && condition.left.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.left && condition.left.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }

      if ((condition.op === '==' || condition.op === '!=') && typeof condition.right === 'object' && condition.right !== null) {
        if ('ref' in condition.right && condition.right.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.right && condition.right.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }
    }
  }
};

const validateTokenFilterPredicates = (
  diagnostics: Diagnostic[],
  filters: readonly TokenFilterPredicate[],
  path: string,
  context: ValidationContext,
): void => {
  for (let i = 0; i < filters.length; i += 1) {
    const filterValue = filters[i]!.value;
    if (!Array.isArray(filterValue)) {
      validateValueExpr(diagnostics, filterValue as ValueExpr, `${path}[${i}].value`, context);
    }
  }
};

const uniqueKeyTupleToLabel = (tuple: readonly string[]): string => `[${tuple.join(', ')}]`;

const validatesUniqueKeyConstraint = (
  wherePredicates: Extract<OptionsQuery, { readonly query: 'assetRows' }>['where'],
  uniqueBy: readonly (readonly string[])[],
): boolean => {
  if (wherePredicates === undefined || wherePredicates.length === 0) {
    return false;
  }

  const constrainedFields = new Set<string>();
  for (const predicate of wherePredicates) {
    if (predicate.op !== 'eq') {
      continue;
    }
    if (Array.isArray(predicate.value)) {
      continue;
    }
    constrainedFields.add(predicate.field);
  }

  return uniqueBy.some((tuple) => tuple.every((field) => constrainedFields.has(field)));
};

export const validateOptionsQuery = (
  diagnostics: Diagnostic[],
  query: OptionsQuery,
  path: string,
  context: ValidationContext,
): void => {
  switch (query.query) {
    case 'concat': {
      if (query.sources.length === 0) {
        diagnostics.push({
          code: 'DOMAIN_QUERY_INVALID',
          path: `${path}.sources`,
          severity: 'error',
          message: 'concat query requires at least one source query.',
          suggestion: 'Provide one or more source queries in concat.sources.',
        });
        return;
      }

      query.sources.forEach((source, index) => {
        validateOptionsQuery(diagnostics, source, `${path}.sources[${index}]`, context);
      });

      const knownShapes = query.sources
        .flatMap((source) => inferQueryRuntimeShapes(source))
        .filter((shape) => shape !== 'unknown');
      const uniqueKnownShapes = dedupeQueryRuntimeShapes(knownShapes);
      if (uniqueKnownShapes.length > 1) {
        diagnostics.push({
          code: 'DOMAIN_QUERY_SHAPE_MISMATCH',
          path: `${path}.sources`,
          severity: 'error',
          message: `concat sources must produce a single runtime item shape; found [${uniqueKnownShapes.join(', ')}].`,
          suggestion: 'Compose only shape-compatible sources (string, number, token, or object) in a single concat query.',
        });
      }
      return;
    }
    case 'tokensInZone': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      if (query.filter) {
        validateTokenFilterPredicates(diagnostics, query.filter, `${path}.filter`, context);
      }
      return;
    }
    case 'assetRows': {
      const contract = context.tableContractsById.get(query.tableId);
      if (contract === undefined) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_RUNTIME_TABLE_MISSING',
          `${path}.tableId`,
          `Unknown runtime table "${query.tableId}".`,
          query.tableId,
          context.tableContractCandidates,
        );
        return;
      }

      if (query.where !== undefined) {
        query.where.forEach((predicate, index) => {
          if (!contract.fields.some((field) => field.field === predicate.field)) {
            pushMissingReferenceDiagnostic(
              diagnostics,
              'REF_RUNTIME_TABLE_FIELD_MISSING',
              `${path}.where[${index}].field`,
              `Unknown field "${predicate.field}" in runtime table "${query.tableId}".`,
              predicate.field,
              contract.fields.map((field) => field.field),
            );
          }
          if (!Array.isArray(predicate.value)) {
            validateValueExpr(diagnostics, predicate.value as ValueExpr, `${path}.where[${index}].value`, context);
          }
        });
      }

      if (query.cardinality === 'exactlyOne') {
        const wherePath = `${path}.where`;
        if (query.where === undefined || query.where.length === 0) {
          diagnostics.push({
            code: 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_WHERE_REQUIRED',
            path: wherePath,
            severity: 'error',
            message: `assetRows query with cardinality "exactlyOne" must provide where predicates that constrain a declared unique key for table "${query.tableId}".`,
            suggestion: 'Add eq predicates for all fields in one declared uniqueBy tuple.',
          });
          return;
        }

        const uniqueBy = contract.uniqueBy ?? [];
        if (uniqueBy.length === 0) {
          diagnostics.push({
            code: 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_UNIQUE_KEY_REQUIRED',
            path: wherePath,
            severity: 'error',
            message: `assetRows query with cardinality "exactlyOne" targets table "${query.tableId}" without declared uniqueBy metadata.`,
            suggestion: 'Declare tableContracts[].uniqueBy and constrain one unique key tuple with eq predicates.',
          });
          return;
        }

        if (!validatesUniqueKeyConstraint(query.where, uniqueBy)) {
          diagnostics.push({
            code: 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_NOT_KEY_CONSTRAINED',
            path: wherePath,
            severity: 'error',
            message: `assetRows query with cardinality "exactlyOne" does not constrain a declared uniqueBy tuple for table "${query.tableId}".`,
            suggestion: `Constrain all fields in one uniqueBy tuple with eq predicates. Declared tuples: ${uniqueBy.map((tuple) => uniqueKeyTupleToLabel(tuple)).join(', ')}.`,
          });
        }
      }
      return;
    }
    case 'adjacentZones': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      return;
    }
    case 'tokensInAdjacentZones': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      if (query.filter) {
        validateTokenFilterPredicates(diagnostics, query.filter, `${path}.filter`, context);
      }
      return;
    }
    case 'connectedZones': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      if (query.via) {
        validateConditionAst(diagnostics, query.via, `${path}.via`, context);
      }
      return;
    }
    case 'intsInRange': {
      if (typeof query.min === 'number') {
        if (!Number.isSafeInteger(query.min)) {
          diagnostics.push({
            code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
            path: `${path}.min`,
            severity: 'error',
            message: 'intsInRange.min must be a safe integer literal when provided as a number.',
            suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
          });
        }
      } else {
        validateNumericValueExpr(diagnostics, query.min, `${path}.min`, context);
      }

      if (typeof query.max === 'number') {
        if (!Number.isSafeInteger(query.max)) {
          diagnostics.push({
            code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
            path: `${path}.max`,
            severity: 'error',
            message: 'intsInRange.max must be a safe integer literal when provided as a number.',
            suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
          });
        }
      } else {
        validateNumericValueExpr(diagnostics, query.max, `${path}.max`, context);
      }

      if (typeof query.min === 'number' && typeof query.max === 'number' && query.min > query.max) {
        diagnostics.push({
          code: 'DOMAIN_INTS_RANGE_INVALID',
          path,
          severity: 'error',
          message: `Invalid intsInRange domain; min (${query.min}) must be <= max (${query.max}).`,
        });
      }

      if (query.step !== undefined) {
        if (typeof query.step === 'number') {
          if (!Number.isSafeInteger(query.step)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_STEP_INVALID',
              path: `${path}.step`,
              severity: 'error',
              message: 'intsInRange.step must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal > 0, or a ValueExpr that evaluates to an integer.',
            });
          } else if (query.step <= 0) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_STEP_INVALID',
              path: `${path}.step`,
              severity: 'error',
              message: 'intsInRange.step must be > 0.',
              suggestion: 'Set step to an integer greater than 0.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.step, `${path}.step`, context);
        }
      }

      if (query.alwaysInclude !== undefined) {
        for (let index = 0; index < query.alwaysInclude.length; index += 1) {
          const candidate = query.alwaysInclude[index];
          if (candidate === undefined) {
            continue;
          }
          if (typeof candidate === 'number') {
            if (!Number.isSafeInteger(candidate)) {
              diagnostics.push({
                code: 'DOMAIN_INTS_RANGE_ALWAYS_INCLUDE_INVALID',
                path: `${path}.alwaysInclude[${index}]`,
                severity: 'error',
                message: 'intsInRange.alwaysInclude values must be safe integer literals when provided as numbers.',
                suggestion: 'Use integer literals, or ValueExpr entries that evaluate to integers.',
              });
            }
          } else {
            validateNumericValueExpr(diagnostics, candidate, `${path}.alwaysInclude[${index}]`, context);
          }
        }
      }

      if (query.maxResults !== undefined) {
        if (typeof query.maxResults === 'number') {
          if (!Number.isSafeInteger(query.maxResults)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInRange.maxResults must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal >= 1, or a ValueExpr that evaluates to an integer.',
            });
          } else if (
            typeof query.min === 'number'
            && typeof query.max === 'number'
            && query.min < query.max
            && query.maxResults < 2
          ) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInRange.maxResults must be >= 2 when min < max.',
              suggestion: 'Use maxResults >= 2 when the range spans multiple values.',
            });
          } else if (query.maxResults < 1) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInRange.maxResults must be >= 1.',
              suggestion: 'Set maxResults to a positive integer.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.maxResults, `${path}.maxResults`, context);
        }
      }
      return;
    }
    case 'nextInOrderByCondition': {
      validateOptionsQuery(diagnostics, query.source, `${path}.source`, context);
      validateValueExpr(diagnostics, query.from, `${path}.from`, context);
      const sourceShapes = inferQueryRuntimeShapes(query.source);
      if (!sourceShapes.includes('unknown')) {
        const uniqueSourceShapes = dedupeQueryRuntimeShapes(sourceShapes);
        if (uniqueSourceShapes.length === 1) {
          const sourceShape = uniqueSourceShapes[0]!;
          const anchorShapes = inferValueRuntimeShapes(query.from, context);
          if (!anchorShapes.includes('unknown')) {
            const uniqueAnchorShapes = dedupeValueRuntimeShapes(anchorShapes);
            if (
              uniqueAnchorShapes.length > 0 &&
              !uniqueAnchorShapes.some((anchorShape) => areSourceAndAnchorShapesCompatible(sourceShape, anchorShape))
            ) {
              diagnostics.push({
                code: 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH',
                path: `${path}.from`,
                severity: 'error',
                message: `nextInOrderByCondition source item shape "${sourceShape}" is incompatible with anchor "from" shape [${uniqueAnchorShapes.join(', ')}].`,
                suggestion:
                  'Use an anchor value expression whose runtime shape matches the source item shape, or change the source query.',
              });
            }
          }
        }
      }
      if (!isCanonicalBindingIdentifier(query.bind)) {
        diagnostics.push({
          code: 'DOMAIN_NEXT_IN_ORDER_BIND_INVALID',
          path: `${path}.bind`,
          severity: 'error',
          message: `nextInOrderByCondition.bind "${query.bind}" must be a canonical "$name" token.`,
          suggestion: 'Use a canonical binding token like "$seatCandidate".',
        });
      }
      validateConditionAst(diagnostics, query.where, `${path}.where`, context);
      return;
    }
    case 'intsInVarRange': {
      const scope = query.scope ?? 'global';
      const varTypesByName = scope === 'global' ? context.globalVarTypesByName : context.perPlayerVarTypesByName;
      const varCandidates = scope === 'global' ? context.globalVarCandidates : context.perPlayerVarCandidates;
      const declaredType = varTypesByName.get(query.var);

      if (declaredType === undefined) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'DOMAIN_INTS_VAR_RANGE_SOURCE_MISSING',
          `${path}.var`,
          `Unknown ${scope === 'global' ? 'global' : 'per-player'} variable "${query.var}" for intsInVarRange source.`,
          query.var,
          varCandidates,
        );
      } else if (declaredType !== 'int') {
        diagnostics.push({
          code: 'DOMAIN_INTS_VAR_RANGE_SOURCE_TYPE_INVALID',
          path: `${path}.var`,
          severity: 'error',
          message: `intsInVarRange source variable "${query.var}" must be an int variable.`,
          suggestion: 'Use an int variable declaration, or switch to a non-derived domain query.',
        });
      }

      if (query.min !== undefined) {
        if (typeof query.min === 'number') {
          if (!Number.isSafeInteger(query.min)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
              path: `${path}.min`,
              severity: 'error',
              message: 'intsInVarRange.min must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.min, `${path}.min`, context);
        }
      }

      if (query.max !== undefined) {
        if (typeof query.max === 'number') {
          if (!Number.isSafeInteger(query.max)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
              path: `${path}.max`,
              severity: 'error',
              message: 'intsInVarRange.max must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.max, `${path}.max`, context);
        }
      }

      if (
        query.min !== undefined &&
        query.max !== undefined &&
        typeof query.min === 'number' &&
        typeof query.max === 'number' &&
        query.min > query.max
      ) {
        diagnostics.push({
          code: 'DOMAIN_INTS_RANGE_INVALID',
          path,
          severity: 'error',
          message: `Invalid intsInVarRange domain; min (${query.min}) must be <= max (${query.max}).`,
        });
      }

      if (query.step !== undefined) {
        if (typeof query.step === 'number') {
          if (!Number.isSafeInteger(query.step)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_VAR_RANGE_STEP_INVALID',
              path: `${path}.step`,
              severity: 'error',
              message: 'intsInVarRange.step must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal > 0, or a ValueExpr that evaluates to an integer.',
            });
          } else if (query.step <= 0) {
            diagnostics.push({
              code: 'DOMAIN_INTS_VAR_RANGE_STEP_INVALID',
              path: `${path}.step`,
              severity: 'error',
              message: 'intsInVarRange.step must be > 0.',
              suggestion: 'Set step to an integer greater than 0.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.step, `${path}.step`, context);
        }
      }

      if (query.alwaysInclude !== undefined) {
        for (let index = 0; index < query.alwaysInclude.length; index += 1) {
          const candidate = query.alwaysInclude[index];
          if (candidate === undefined) {
            continue;
          }
          if (typeof candidate === 'number') {
            if (!Number.isSafeInteger(candidate)) {
              diagnostics.push({
                code: 'DOMAIN_INTS_VAR_RANGE_ALWAYS_INCLUDE_INVALID',
                path: `${path}.alwaysInclude[${index}]`,
                severity: 'error',
                message: 'intsInVarRange.alwaysInclude values must be safe integer literals when provided as numbers.',
                suggestion: 'Use integer literals, or ValueExpr entries that evaluate to integers.',
              });
            }
          } else {
            validateNumericValueExpr(diagnostics, candidate, `${path}.alwaysInclude[${index}]`, context);
          }
        }
      }

      if (query.maxResults !== undefined) {
        if (typeof query.maxResults === 'number') {
          if (!Number.isSafeInteger(query.maxResults)) {
            diagnostics.push({
              code: 'DOMAIN_INTS_VAR_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInVarRange.maxResults must be a safe integer literal when provided as a number.',
              suggestion: 'Use an integer literal >= 1, or a ValueExpr that evaluates to an integer.',
            });
          } else if (
            query.min !== undefined &&
            query.max !== undefined &&
            typeof query.min === 'number' &&
            typeof query.max === 'number' &&
            query.min < query.max &&
            query.maxResults < 2
          ) {
            diagnostics.push({
              code: 'DOMAIN_INTS_VAR_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInVarRange.maxResults must be >= 2 when min < max.',
              suggestion: 'Use maxResults >= 2 when the range spans multiple values.',
            });
          } else if (query.maxResults < 1) {
            diagnostics.push({
              code: 'DOMAIN_INTS_VAR_RANGE_MAX_RESULTS_INVALID',
              path: `${path}.maxResults`,
              severity: 'error',
              message: 'intsInVarRange.maxResults must be >= 1.',
              suggestion: 'Set maxResults to a positive integer.',
            });
          }
        } else {
          validateNumericValueExpr(diagnostics, query.maxResults, `${path}.maxResults`, context);
        }
      }
      return;
    }
    case 'zones':
    case 'mapSpaces': {
      if (query.filter?.owner) {
        validatePlayerSelector(diagnostics, query.filter.owner, `${path}.filter.owner`, context);
      }
      if (query.filter?.condition) {
        validateConditionAst(diagnostics, query.filter.condition, `${path}.filter.condition`, context);
      }
      return;
    }
    case 'enums':
    case 'players': {
      return;
    }
    case 'globalMarkers': {
      query.markers?.forEach((markerId, index) => {
        if (!context.globalMarkerLatticeNames.has(markerId)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_GLOBAL_MARKER_LATTICE_MISSING',
            `${path}.markers[${index}]`,
            `Unknown global marker lattice "${markerId}".`,
            markerId,
            context.globalMarkerLatticeCandidates,
          );
        }
      });

      if (query.states !== undefined && query.markers !== undefined) {
        query.markers.forEach((markerId) => {
          const validStates = context.globalMarkerLatticeStatesById.get(markerId);
          if (validStates === undefined) {
            return;
          }
          query.states?.forEach((state, index) => {
            if (!validStates.includes(state)) {
              pushMissingReferenceDiagnostic(
                diagnostics,
                'REF_MARKER_STATE_MISSING',
                `${path}.states[${index}]`,
                `Unknown marker state "${state}" for marker lattice "${markerId}".`,
                state,
                validStates,
              );
            }
          });
        });
      }
      return;
    }
  }
};

const validateZoneRef = (
  diagnostics: Diagnostic[],
  zoneRef: ZoneRef,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof zoneRef === 'string') {
    validateZoneSelector(diagnostics, zoneRef, path, context);
    return;
  }
  validateValueExpr(diagnostics, zoneRef.zoneExpr, `${path}.zoneExpr`, context);
};

export const validateEffectAst = (
  diagnostics: Diagnostic[],
  effect: EffectAST,
  path: string,
  context: ValidationContext,
): void => {
  if ('setVar' in effect) {
    if (effect.setVar.scope === 'global' && !context.globalVarNames.has(effect.setVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GVAR_MISSING',
        `${path}.setVar.var`,
        `Unknown global variable "${effect.setVar.var}".`,
        effect.setVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.setVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.setVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.setVar.var`,
        `Unknown per-player variable "${effect.setVar.var}".`,
        effect.setVar.var,
        context.perPlayerVarCandidates,
      );
    }

    if (effect.setVar.player) {
      validatePlayerSelector(diagnostics, effect.setVar.player, `${path}.setVar.player`, context);
    }

    validateValueExpr(diagnostics, effect.setVar.value, `${path}.setVar.value`, context);
    return;
  }

  if ('setActivePlayer' in effect) {
    validatePlayerSelector(diagnostics, effect.setActivePlayer.player, `${path}.setActivePlayer.player`, context);
    return;
  }

  if ('addVar' in effect) {
    if (effect.addVar.scope === 'global' && !context.globalVarNames.has(effect.addVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GVAR_MISSING',
        `${path}.addVar.var`,
        `Unknown global variable "${effect.addVar.var}".`,
        effect.addVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.addVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.addVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.addVar.var`,
        `Unknown per-player variable "${effect.addVar.var}".`,
        effect.addVar.var,
        context.perPlayerVarCandidates,
      );
    }

    if (effect.addVar.player) {
      validatePlayerSelector(diagnostics, effect.addVar.player, `${path}.addVar.player`, context);
    }

    const varType =
      effect.addVar.scope === 'global'
        ? context.globalVarTypesByName.get(effect.addVar.var)
        : context.perPlayerVarTypesByName.get(effect.addVar.var);
    if (varType === 'boolean') {
      diagnostics.push({
        code: 'ADDVAR_BOOLEAN_TARGET_INVALID',
        path: `${path}.addVar.var`,
        severity: 'error',
        message: `addVar cannot target boolean variable "${effect.addVar.var}".`,
        suggestion: 'Use setVar with a boolean value expression for boolean variables.',
      });
    }

    validateNumericValueExpr(diagnostics, effect.addVar.delta, `${path}.addVar.delta`, context);
    return;
  }

  if ('transferVar' in effect) {
    const transferEndpoints = [
      { key: 'from', endpoint: effect.transferVar.from },
      { key: 'to', endpoint: effect.transferVar.to },
    ] as const;

    for (const { key, endpoint } of transferEndpoints) {
      const endpointPath = `${path}.transferVar.${key}`;
      const playerPath = `${endpointPath}.player`;
      const zonePath = `${endpointPath}.zone`;
      const varPath = `${endpointPath}.var`;

      if (endpoint.scope === 'global') {
        if (!context.globalVarNames.has(endpoint.var)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_GVAR_MISSING',
            varPath,
            `Unknown global variable "${endpoint.var}".`,
            endpoint.var,
            context.globalVarCandidates,
          );
        }
        if (context.globalVarTypesByName.get(endpoint.var) === 'boolean') {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID',
            path: varPath,
            severity: 'error',
            message: `transferVar cannot target boolean variable "${endpoint.var}".`,
            suggestion: 'Use integer variables for transferVar source and destination.',
          });
        }
        if (endpoint.player !== undefined) {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_GLOBAL_SCOPE_PLAYER_FORBIDDEN',
            path: playerPath,
            severity: 'error',
            message: `transferVar.${key}.player must be omitted when transferVar.${key}.scope is "global".`,
            suggestion: `Remove transferVar.${key}.player or use transferVar.${key}.scope "pvar".`,
          });
        }
        if (endpoint.zone !== undefined) {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_NON_ZONE_SCOPE_ZONE_FORBIDDEN',
            path: zonePath,
            severity: 'error',
            message: `transferVar.${key}.zone must be omitted when transferVar.${key}.scope is "global".`,
            suggestion: `Remove transferVar.${key}.zone or use transferVar.${key}.scope "zoneVar".`,
          });
        }
        continue;
      }

      if (endpoint.scope === 'pvar') {
        if (!context.perPlayerVarNames.has(endpoint.var)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_PVAR_MISSING',
            varPath,
            `Unknown per-player variable "${endpoint.var}".`,
            endpoint.var,
            context.perPlayerVarCandidates,
          );
        }
        if (context.perPlayerVarTypesByName.get(endpoint.var) === 'boolean') {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID',
            path: varPath,
            severity: 'error',
            message: `transferVar cannot target boolean variable "${endpoint.var}".`,
            suggestion: 'Use integer variables for transferVar source and destination.',
          });
        }
        if (endpoint.player === undefined) {
          diagnostics.push({
            code: key === 'from' ? 'EFFECT_TRANSFER_VAR_FROM_PLAYER_REQUIRED' : 'EFFECT_TRANSFER_VAR_TO_PLAYER_REQUIRED',
            path: playerPath,
            severity: 'error',
            message: `transferVar.${key}.player is required when transferVar.${key}.scope is "pvar".`,
            suggestion: `Provide a player selector for transferVar.${key}.player when targeting a per-player variable.`,
          });
        } else {
          validatePlayerSelector(diagnostics, endpoint.player, playerPath, context);
        }
        if (endpoint.zone !== undefined) {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_NON_ZONE_SCOPE_ZONE_FORBIDDEN',
            path: zonePath,
            severity: 'error',
            message: `transferVar.${key}.zone must be omitted when transferVar.${key}.scope is "pvar".`,
            suggestion: `Remove transferVar.${key}.zone or use transferVar.${key}.scope "zoneVar".`,
          });
        }
        continue;
      }

      if (!context.zoneVarNames.has(endpoint.var)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_ZONEVAR_MISSING',
          varPath,
          `Unknown zone variable "${endpoint.var}".`,
          endpoint.var,
          context.zoneVarCandidates,
        );
      }
      if (context.zoneVarTypesByName.get(endpoint.var) === 'boolean') {
        diagnostics.push({
          code: 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID',
          path: varPath,
          severity: 'error',
          message: `transferVar cannot target boolean variable "${endpoint.var}".`,
          suggestion: 'Use integer variables for transferVar source and destination.',
        });
      }
      if (endpoint.zone === undefined) {
        diagnostics.push({
          code: key === 'from' ? 'EFFECT_TRANSFER_VAR_FROM_ZONE_REQUIRED' : 'EFFECT_TRANSFER_VAR_TO_ZONE_REQUIRED',
          path: zonePath,
          severity: 'error',
          message: `transferVar.${key}.zone is required when transferVar.${key}.scope is "zoneVar".`,
          suggestion: `Provide a zone selector for transferVar.${key}.zone when targeting a zone variable.`,
        });
      } else {
        validateZoneRef(diagnostics, endpoint.zone, zonePath, context);
      }
      if (endpoint.player !== undefined) {
        diagnostics.push({
          code: 'EFFECT_TRANSFER_VAR_ZONE_SCOPE_PLAYER_FORBIDDEN',
          path: playerPath,
          severity: 'error',
          message: `transferVar.${key}.player must be omitted when transferVar.${key}.scope is "zoneVar".`,
          suggestion: `Remove transferVar.${key}.player or use transferVar.${key}.scope "pvar".`,
        });
      }
    }

    validateNumericValueExpr(diagnostics, effect.transferVar.amount, `${path}.transferVar.amount`, context);
    if (effect.transferVar.min !== undefined) {
      validateNumericValueExpr(diagnostics, effect.transferVar.min, `${path}.transferVar.min`, context);
    }
    if (effect.transferVar.max !== undefined) {
      validateNumericValueExpr(diagnostics, effect.transferVar.max, `${path}.transferVar.max`, context);
    }
    return;
  }

  if ('moveToken' in effect) {
    validateZoneRef(diagnostics, effect.moveToken.from, `${path}.moveToken.from`, context);
    validateZoneRef(diagnostics, effect.moveToken.to, `${path}.moveToken.to`, context);
    return;
  }

  if ('moveAll' in effect) {
    validateZoneRef(diagnostics, effect.moveAll.from, `${path}.moveAll.from`, context);
    validateZoneRef(diagnostics, effect.moveAll.to, `${path}.moveAll.to`, context);

    if (effect.moveAll.filter) {
      validateConditionAst(diagnostics, effect.moveAll.filter, `${path}.moveAll.filter`, context);
    }
    return;
  }

  if ('moveTokenAdjacent' in effect) {
    validateZoneRef(diagnostics, effect.moveTokenAdjacent.from, `${path}.moveTokenAdjacent.from`, context);
    return;
  }

  if ('draw' in effect) {
    validateZoneRef(diagnostics, effect.draw.from, `${path}.draw.from`, context);
    validateZoneRef(diagnostics, effect.draw.to, `${path}.draw.to`, context);
    return;
  }

  if ('reveal' in effect) {
    validateZoneRef(diagnostics, effect.reveal.zone, `${path}.reveal.zone`, context);
    if (effect.reveal.to !== 'all') {
      validatePlayerSelector(diagnostics, effect.reveal.to, `${path}.reveal.to`, context);
    }
    if (effect.reveal.filter !== undefined) {
      validateTokenFilterPredicates(diagnostics, effect.reveal.filter, `${path}.reveal.filter`, context);
    }
    return;
  }

  if ('conceal' in effect) {
    validateZoneRef(diagnostics, effect.conceal.zone, `${path}.conceal.zone`, context);
    if (effect.conceal.from !== undefined && effect.conceal.from !== 'all') {
      validatePlayerSelector(diagnostics, effect.conceal.from, `${path}.conceal.from`, context);
    }
    if (effect.conceal.filter !== undefined) {
      validateTokenFilterPredicates(diagnostics, effect.conceal.filter, `${path}.conceal.filter`, context);
    }
    return;
  }

  if ('shuffle' in effect) {
    validateZoneRef(diagnostics, effect.shuffle.zone, `${path}.shuffle.zone`, context);
    return;
  }

  if ('createToken' in effect) {
    if (!context.tokenTypeNames.has(effect.createToken.type)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_TOKEN_TYPE_MISSING',
        `${path}.createToken.type`,
        `Unknown token type "${effect.createToken.type}".`,
        effect.createToken.type,
        context.tokenTypeCandidates,
      );
    }

    validateZoneRef(diagnostics, effect.createToken.zone, `${path}.createToken.zone`, context);
    if (effect.createToken.props) {
      Object.entries(effect.createToken.props).forEach(([propName, propValue]) => {
        validateValueExpr(diagnostics, propValue, `${path}.createToken.props.${propName}`, context);
      });
    }
    return;
  }

  if ('destroyToken' in effect) {
    return;
  }

  if ('if' in effect) {
    validateConditionAst(diagnostics, effect.if.when, `${path}.if.when`, context);
    effect.if.then.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.if.then[${index}]`, context);
    });
    effect.if.else?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.if.else[${index}]`, context);
    });
    return;
  }

  if ('forEach' in effect) {
    validateOptionsQuery(diagnostics, effect.forEach.over, `${path}.forEach.over`, context);
    effect.forEach.effects.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.forEach.effects[${index}]`, context);
    });
    if (effect.forEach.limit !== undefined) {
      validateNumericValueExpr(diagnostics, effect.forEach.limit, `${path}.forEach.limit`, context);
    }
    effect.forEach.in?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.forEach.in[${index}]`, context);
    });
    return;
  }

  if ('reduce' in effect) {
    validateOptionsQuery(diagnostics, effect.reduce.over, `${path}.reduce.over`, context);
    validateValueExpr(diagnostics, effect.reduce.initial, `${path}.reduce.initial`, context);
    validateValueExpr(diagnostics, effect.reduce.next, `${path}.reduce.next`, context);
    if (effect.reduce.limit !== undefined) {
      validateNumericValueExpr(diagnostics, effect.reduce.limit, `${path}.reduce.limit`, context);
    }
    if (
      effect.reduce.itemBind === effect.reduce.accBind
      || effect.reduce.itemBind === effect.reduce.resultBind
      || effect.reduce.accBind === effect.reduce.resultBind
    ) {
      diagnostics.push({
        code: 'REDUCE_BINDING_CONFLICT',
        path: `${path}.reduce`,
        severity: 'error',
        message: 'reduce requires distinct itemBind, accBind, and resultBind identifiers.',
        suggestion: 'Use unique binding names for item, accumulator, and reduced result.',
      });
    }
    effect.reduce.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.reduce.in[${index}]`, context);
    });
    return;
  }

  if ('evaluateSubset' in effect) {
    validateOptionsQuery(diagnostics, effect.evaluateSubset.source, `${path}.evaluateSubset.source`, context);
    validateNumericValueExpr(diagnostics, effect.evaluateSubset.subsetSize, `${path}.evaluateSubset.subsetSize`, context);
    effect.evaluateSubset.compute.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.evaluateSubset.compute[${index}]`, context);
    });
    validateNumericValueExpr(diagnostics, effect.evaluateSubset.scoreExpr, `${path}.evaluateSubset.scoreExpr`, context);
    effect.evaluateSubset.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.evaluateSubset.in[${index}]`, context);
    });
    return;
  }

  if ('removeByPriority' in effect) {
    validateNumericValueExpr(diagnostics, effect.removeByPriority.budget, `${path}.removeByPriority.budget`, context);

    effect.removeByPriority.groups.forEach((group, index) => {
      const groupPath = `${path}.removeByPriority.groups[${index}]`;
      validateOptionsQuery(diagnostics, group.over, `${groupPath}.over`, context);
      validateZoneRef(diagnostics, group.to, `${groupPath}.to`, context);
      if (group.from !== undefined) {
        validateZoneRef(diagnostics, group.from, `${groupPath}.from`, context);
      }
    });

    effect.removeByPriority.in?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.removeByPriority.in[${index}]`, context);
    });
    return;
  }

  if ('let' in effect) {
    validateValueExpr(diagnostics, effect.let.value, `${path}.let.value`, context);
    effect.let.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.let.in[${index}]`, context);
    });
    return;
  }

  if ('bindValue' in effect) {
    validateValueExpr(diagnostics, effect.bindValue.value, `${path}.bindValue.value`, context);
    return;
  }

  if ('chooseOne' in effect) {
    validateOptionsQuery(diagnostics, effect.chooseOne.options, `${path}.chooseOne.options`, context);
    return;
  }

  if ('setTokenProp' in effect) {
    validateValueExpr(diagnostics, effect.setTokenProp.value, `${path}.setTokenProp.value`, context);
    return;
  }

  if ('rollRandom' in effect) {
    validateNumericValueExpr(diagnostics, effect.rollRandom.min, `${path}.rollRandom.min`, context);
    validateNumericValueExpr(diagnostics, effect.rollRandom.max, `${path}.rollRandom.max`, context);
    effect.rollRandom.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.rollRandom.in[${index}]`, context);
    });
    return;
  }

  if ('setMarker' in effect) {
    validateZoneRef(diagnostics, effect.setMarker.space, `${path}.setMarker.space`, context);
    if (!context.markerLatticeNames.has(effect.setMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.setMarker.marker`,
        `Unknown marker lattice "${effect.setMarker.marker}".`,
        effect.setMarker.marker,
        context.markerLatticeCandidates,
      );
    }
    validateMarkerStateLiteral(
      diagnostics,
      effect.setMarker.marker,
      effect.setMarker.state,
      `${path}.setMarker.state`,
      context.markerLatticeStatesById,
    );
    validateValueExpr(diagnostics, effect.setMarker.state, `${path}.setMarker.state`, context);
    return;
  }

  if ('shiftMarker' in effect) {
    validateZoneRef(diagnostics, effect.shiftMarker.space, `${path}.shiftMarker.space`, context);
    if (!context.markerLatticeNames.has(effect.shiftMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.shiftMarker.marker`,
        `Unknown marker lattice "${effect.shiftMarker.marker}".`,
        effect.shiftMarker.marker,
        context.markerLatticeCandidates,
      );
    }
    validateNumericValueExpr(diagnostics, effect.shiftMarker.delta, `${path}.shiftMarker.delta`, context);
    return;
  }

  if ('setGlobalMarker' in effect) {
    if (!context.globalMarkerLatticeNames.has(effect.setGlobalMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.setGlobalMarker.marker`,
        `Unknown global marker lattice "${effect.setGlobalMarker.marker}".`,
        effect.setGlobalMarker.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    validateMarkerStateLiteral(
      diagnostics,
      effect.setGlobalMarker.marker,
      effect.setGlobalMarker.state,
      `${path}.setGlobalMarker.state`,
      context.globalMarkerLatticeStatesById,
    );
    validateValueExpr(diagnostics, effect.setGlobalMarker.state, `${path}.setGlobalMarker.state`, context);
    return;
  }

  if ('flipGlobalMarker' in effect) {
    const staticMarkerId = tryStaticStringValue(effect.flipGlobalMarker.marker);
    if (staticMarkerId !== null) {
      if (!context.globalMarkerLatticeNames.has(staticMarkerId)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_GLOBAL_MARKER_LATTICE_MISSING',
          `${path}.flipGlobalMarker.marker`,
          `Unknown global marker lattice "${staticMarkerId}".`,
          staticMarkerId,
          context.globalMarkerLatticeCandidates,
        );
      } else {
        validateMarkerStateLiteral(
          diagnostics,
          staticMarkerId,
          effect.flipGlobalMarker.stateA,
          `${path}.flipGlobalMarker.stateA`,
          context.globalMarkerLatticeStatesById,
        );
        validateMarkerStateLiteral(
          diagnostics,
          staticMarkerId,
          effect.flipGlobalMarker.stateB,
          `${path}.flipGlobalMarker.stateB`,
          context.globalMarkerLatticeStatesById,
        );
      }
    }

    const staticStateA = tryStaticStringValue(effect.flipGlobalMarker.stateA);
    const staticStateB = tryStaticStringValue(effect.flipGlobalMarker.stateB);
    if (staticStateA !== null && staticStateB !== null && staticStateA === staticStateB) {
      diagnostics.push({
        code: 'EFFECT_FLIP_GLOBAL_MARKER_STATE_INVALID',
        path: `${path}.flipGlobalMarker`,
        severity: 'error',
        message: 'flipGlobalMarker.stateA and flipGlobalMarker.stateB must be distinct.',
        suggestion: 'Provide two different marker states to flip between.',
      });
    }

    validateValueExpr(diagnostics, effect.flipGlobalMarker.marker, `${path}.flipGlobalMarker.marker`, context);
    validateValueExpr(diagnostics, effect.flipGlobalMarker.stateA, `${path}.flipGlobalMarker.stateA`, context);
    validateValueExpr(diagnostics, effect.flipGlobalMarker.stateB, `${path}.flipGlobalMarker.stateB`, context);
    return;
  }

  if ('shiftGlobalMarker' in effect) {
    if (!context.globalMarkerLatticeNames.has(effect.shiftGlobalMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.shiftGlobalMarker.marker`,
        `Unknown global marker lattice "${effect.shiftGlobalMarker.marker}".`,
        effect.shiftGlobalMarker.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    validateNumericValueExpr(diagnostics, effect.shiftGlobalMarker.delta, `${path}.shiftGlobalMarker.delta`, context);
    return;
  }

  if ('grantFreeOperation' in effect) {
    const grant = effect.grantFreeOperation;
    if (
      grant.operationClass !== 'pass' &&
      grant.operationClass !== 'event' &&
      grant.operationClass !== 'operation' &&
      grant.operationClass !== 'limitedOperation' &&
      grant.operationClass !== 'operationPlusSpecialActivity'
    ) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_CLASS_INVALID',
        path: `${path}.grantFreeOperation.operationClass`,
        severity: 'error',
        message: `grantFreeOperation.operationClass is invalid: \"${grant.operationClass}\".`,
        suggestion: 'Use one of pass|event|operation|limitedOperation|operationPlusSpecialActivity.',
      });
    }
    if (grant.uses !== undefined && (!Number.isSafeInteger(grant.uses) || grant.uses <= 0)) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_USES_INVALID',
        path: `${path}.grantFreeOperation.uses`,
        severity: 'error',
        message: 'grantFreeOperation.uses must be a positive integer.',
        suggestion: 'Set uses to an integer >= 1.',
      });
    }
    if (
      grant.sequence !== undefined &&
      (!Number.isSafeInteger(grant.sequence.step) || grant.sequence.step < 0)
    ) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_INVALID',
        path: `${path}.grantFreeOperation.sequence.step`,
        severity: 'error',
        message: 'grantFreeOperation.sequence.step must be a non-negative integer.',
        suggestion: 'Set sequence.step to an integer >= 0.',
      });
    }
    if (grant.zoneFilter !== undefined) {
      validateConditionAst(diagnostics, grant.zoneFilter, `${path}.grantFreeOperation.zoneFilter`, context);
    }
    return;
  }

  if ('gotoPhaseExact' in effect) {
    if (!context.turnPhaseNames.has(effect.gotoPhaseExact.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.gotoPhaseExact.phase`,
        `Unknown turn phase "${effect.gotoPhaseExact.phase}".`,
        effect.gotoPhaseExact.phase,
        context.turnPhaseCandidates,
      );
    }
    return;
  }

  if ('advancePhase' in effect) {
    return;
  }

  if ('pushInterruptPhase' in effect) {
    if (!context.phaseNames.has(effect.pushInterruptPhase.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.pushInterruptPhase.phase`,
        `Unknown phase "${effect.pushInterruptPhase.phase}".`,
        effect.pushInterruptPhase.phase,
        context.phaseCandidates,
      );
    }
    if (!context.phaseNames.has(effect.pushInterruptPhase.resumePhase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.pushInterruptPhase.resumePhase`,
        `Unknown phase "${effect.pushInterruptPhase.resumePhase}".`,
        effect.pushInterruptPhase.resumePhase,
        context.phaseCandidates,
      );
    }
    return;
  }

  if ('popInterruptPhase' in effect) {
    return;
  }

  const chooseN = effect.chooseN;
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;

  if ((hasN && hasMax) || (!hasN && !hasMax)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN`,
      severity: 'error',
      message: 'chooseN must declare either exact n or range max/min cardinality.',
      suggestion: 'Use { n } or { max, min? }.',
    });
  }

  if (hasN && (!Number.isSafeInteger(chooseN.n) || chooseN.n < 0)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN.n`,
      severity: 'error',
      message: 'chooseN.n must be a non-negative integer.',
      suggestion: 'Set n to an integer >= 0.',
    });
  }

  if (hasMax) {
    validateNumericValueExpr(diagnostics, chooseN.max, `${path}.chooseN.max`, context);
    if (typeof chooseN.max === 'number' && (!Number.isSafeInteger(chooseN.max) || chooseN.max < 0)) {
      diagnostics.push({
        code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
        path: `${path}.chooseN.max`,
        severity: 'error',
        message: 'chooseN.max must be a non-negative integer when provided as a literal.',
        suggestion: 'Set max literal to an integer >= 0 or use a ValueExpr that evaluates to one.',
      });
    }
  }

  if (hasMin) {
    validateNumericValueExpr(diagnostics, chooseN.min, `${path}.chooseN.min`, context);
    if (typeof chooseN.min === 'number' && (!Number.isSafeInteger(chooseN.min) || chooseN.min < 0)) {
      diagnostics.push({
        code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
        path: `${path}.chooseN.min`,
        severity: 'error',
        message: 'chooseN.min must be a non-negative integer when provided as a literal.',
        suggestion: 'Set min literal to an integer >= 0 or use a ValueExpr that evaluates to one.',
      });
    }
  }

  if (hasMax && hasMin && typeof chooseN.max === 'number' && typeof chooseN.min === 'number' && chooseN.min > chooseN.max) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN`,
      severity: 'error',
      message: 'chooseN.min cannot exceed chooseN.max.',
      suggestion: 'Set min <= max.',
    });
  }

  validateOptionsQuery(diagnostics, effect.chooseN.options, `${path}.chooseN.options`, context);
};

export const validatePostAdjacencyBehavior = (
  diagnostics: Diagnostic[],
  def: GameDef,
  context: ValidationContext,
  phaseCandidates: readonly string[],
  actionCandidates: readonly string[],
): void => {
  def.turnStructure.phases.forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });
  (def.turnStructure.interrupts ?? []).forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });

  def.triggers.forEach((trigger, triggerIndex) => {
    if (trigger.event.type === 'phaseEnter' || trigger.event.type === 'phaseExit') {
      if (!phaseCandidates.includes(trigger.event.phase)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_PHASE_MISSING',
          `triggers[${triggerIndex}].event.phase`,
          `Unknown phase "${trigger.event.phase}".`,
          trigger.event.phase,
          phaseCandidates,
        );
      }
    }

    if (trigger.event.type === 'actionResolved' && trigger.event.action) {
      if (!actionCandidates.includes(trigger.event.action)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_ACTION_MISSING',
          `triggers[${triggerIndex}].event.action`,
          `Unknown action "${trigger.event.action}".`,
          trigger.event.action,
          actionCandidates,
        );
      }
    }

    if (trigger.event.type === 'tokenEntered' && trigger.event.zone) {
      validateZoneSelector(diagnostics, trigger.event.zone, `triggers[${triggerIndex}].event.zone`, context);
    }

    if (trigger.event.type === 'varChanged' && trigger.event.var) {
      const globalVarNames = def.globalVars.map((variable) => variable.name);
      const perPlayerVarNames = def.perPlayerVars.map((variable) => variable.name);
      const zoneVarNames = (def.zoneVars ?? []).map((variable) => variable.name);
      const candidateNames =
        trigger.event.scope === 'global'
          ? globalVarNames
          : trigger.event.scope === 'perPlayer'
            ? perPlayerVarNames
            : trigger.event.scope === 'zone'
              ? zoneVarNames
              : [...globalVarNames, ...perPlayerVarNames, ...zoneVarNames];
      if (!candidateNames.includes(trigger.event.var)) {
        diagnostics.push({
          code: 'REF_VAR_MISSING',
          path: `triggers[${triggerIndex}].event.var`,
          severity: 'error',
          message: `Unknown variable "${trigger.event.var}".`,
          suggestion: 'Use one of the declared globalVars/perPlayerVars/zoneVars names.',
        });
      }
    }

    if (trigger.match) {
      validateConditionAst(diagnostics, trigger.match, `triggers[${triggerIndex}].match`, context);
    }

    if (trigger.when) {
      validateConditionAst(diagnostics, trigger.when, `triggers[${triggerIndex}].when`, context);
    }

    trigger.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `triggers[${triggerIndex}].effects[${effectIndex}]`, context);
    });
  });

  const terminal = def.terminal;
  if (!terminal) {
    return;
  }

  terminal.conditions.forEach((endCondition, endConditionIndex) => {
    if (endCondition.result.type === 'win') {
      validatePlayerSelector(diagnostics, endCondition.result.player, `terminal.conditions[${endConditionIndex}].result.player`, context);
    }
    if (endCondition.result.type === 'score' && !terminal.scoring) {
      diagnostics.push({
        code: 'SCORING_REQUIRED_FOR_SCORE_RESULT',
        path: `terminal.conditions[${endConditionIndex}].result`,
        severity: 'error',
        message: 'End condition with result.type "score" requires a scoring definition.',
        suggestion: 'Add def.terminal.scoring or change end condition result.type.',
      });
    }

    validateConditionAst(diagnostics, endCondition.when, `terminal.conditions[${endConditionIndex}].when`, context);
  });

  if (terminal.scoring) {
    validateNumericValueExpr(diagnostics, terminal.scoring.value, 'terminal.scoring.value', context);
    const usesScoreResult = terminal.conditions.some((endCondition) => endCondition.result.type === 'score');
    if (!usesScoreResult) {
      diagnostics.push({
        code: 'SCORING_UNUSED',
        path: 'terminal.scoring',
        severity: 'warning',
        message: 'scoring is configured but no end condition uses result.type "score".',
        suggestion: 'Add a score-based end condition or remove scoring.',
      });
    }
  }
};
