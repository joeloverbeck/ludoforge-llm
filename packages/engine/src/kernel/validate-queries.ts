import type { Diagnostic } from './diagnostics.js';
import type { EventTargetDef, OptionsQuery, TokenFilterExpr, TokenFilterPredicate, ValueExpr } from './types.js';
import { buildChoiceOptionsRuntimeShapeDiagnostic, CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES } from './choice-options-runtime-shape-diagnostic.js';
import { hasErrorDiagnosticAtPathSince } from './diagnostic-path-policy.js';
import {
  appendQueryConditionSurfacePath,
  CONDITION_SURFACE_SUFFIX,
  isAllowedTokenFilterProp,
  tokenFilterPropAlternatives,
  isPredicateOp,
  PREDICATE_OPERATORS,
} from '../contracts/index.js';
import { type ValidationContext, pushMissingReferenceDiagnostic, validatePlayerSelector } from './validate-gamedef-structure.js';
import {
  areSourceAndAnchorShapesCompatible,
  dedupeQueryRuntimeShapes,
  dedupeValueRuntimeShapes,
  inferQueryRuntimeShapes,
  inferValueRuntimeShapes,
} from './query-shape-inference.js';
import { inferTransformSourceIncompatibleRuntimeShapes } from './query-kind-contract.js';
import { getLeafOptionsQueryTransformContract, type LeafOptionsQueryTransformKind } from './query-kind-map.js';
import {
  normalizeTokenFilterTraversalError,
  type TokenFilterTraversalError,
  isTokenFilterPredicateExpr,
  tokenFilterPathSuffix,
  walkTokenFilterExprRecovering,
} from './token-filter-expr-utils.js';
import { tokenFilterTraversalValidatorMessage, tokenFilterTraversalValidatorSuggestion } from './token-filter-validator-boundary.js';
import { validateCanonicalBinding } from './validate-behavior-shared.js';
import { validateValueExpr, validateNumericValueExpr, validateZoneRef } from './validate-values.js';
import { validateConditionAst } from './validate-conditions.js';

// ---------------------------------------------------------------------------
// Token filter validation
// ---------------------------------------------------------------------------

const validateTokenFilterPredicate = (
  diagnostics: Diagnostic[],
  predicate: TokenFilterPredicate,
  path: string,
  context: ValidationContext,
): void => {
  if (!isPredicateOp(predicate.op)) {
    diagnostics.push({
      code: 'DOMAIN_QUERY_INVALID',
      path: `${path}.op`,
      severity: 'error',
      message: `Unsupported token filter predicate operator "${String(predicate.op)}".`,
      suggestion: `Use one of: ${PREDICATE_OPERATORS.join(', ')}.`,
    });
  }

  if (!isAllowedTokenFilterProp(predicate.prop, context.tokenFilterPropCandidates)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_TOKEN_FILTER_PROP_MISSING',
      `${path}.prop`,
      `Unknown token filter prop "${predicate.prop}".`,
      predicate.prop,
      tokenFilterPropAlternatives(context.tokenFilterPropCandidates),
    );
  }

  const filterValue = predicate.value;
  if (!Array.isArray(filterValue)) {
    validateValueExpr(diagnostics, filterValue as ValueExpr, `${path}.value`, context);
  }
};

const validateTokenFilterExpr = (
  diagnostics: Diagnostic[],
  filter: TokenFilterExpr,
  path: string,
  context: ValidationContext,
): void => {
  const pushTraversalDiagnostic = (error: TokenFilterTraversalError): void => {
    const normalizedError = normalizeTokenFilterTraversalError(error);
    const entryPath = `${path}${normalizedError.entryPathSuffix}`;
    const errorPath = `${entryPath}${normalizedError.errorFieldSuffix}`;
    diagnostics.push({
      code: 'DOMAIN_QUERY_INVALID',
      path: errorPath,
      severity: 'error',
      message: tokenFilterTraversalValidatorMessage(normalizedError),
      suggestion: tokenFilterTraversalValidatorSuggestion(normalizedError),
    });
  };

  walkTokenFilterExprRecovering(
    filter,
    (entry, entryPathSegments) => {
      const entryPath = `${path}${tokenFilterPathSuffix(entryPathSegments)}`;
      if (isTokenFilterPredicateExpr(entry)) {
        validateTokenFilterPredicate(diagnostics, entry, entryPath, context);
      }
    },
    pushTraversalDiagnostic,
  );
};

export const validateTokenFilter = (
  diagnostics: Diagnostic[],
  filter: TokenFilterExpr | undefined,
  path: string,
  context: ValidationContext,
): void => {
  if (filter !== undefined) {
    validateTokenFilterExpr(diagnostics, filter, path, context);
  }
};

// ---------------------------------------------------------------------------
// Choice options helpers
// ---------------------------------------------------------------------------

const validateChoiceOptionsRuntimeShape = (
  diagnostics: Diagnostic[],
  query: OptionsQuery,
  path: string,
  effectName: 'chooseOne' | 'chooseN',
): void => {
  const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
    code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator,
    path,
    effectName,
    query,
  });
  if (diagnostic === null) {
    return;
  }
  diagnostics.push(diagnostic);
};

export const validateChoiceOptionsQueryContract = (
  diagnostics: Diagnostic[],
  query: OptionsQuery,
  path: string,
  context: ValidationContext,
  effectName: 'chooseOne' | 'chooseN',
): void => {
  const diagnosticsBeforeQueryValidation = diagnostics.length;
  validateOptionsQuery(diagnostics, query, path, context);
  if (!hasErrorDiagnosticAtPathSince(diagnostics, diagnosticsBeforeQueryValidation, path)) {
    validateChoiceOptionsRuntimeShape(diagnostics, query, path, effectName);
  }
};

export const eventTargetChoiceEffectName = (target: EventTargetDef): 'chooseOne' | 'chooseN' => {
  const cardinality = target.cardinality;
  return ('n' in cardinality && cardinality.n === 1)
    || (!('n' in cardinality) && cardinality.max === 1)
    ? 'chooseOne'
    : 'chooseN';
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

// ---------------------------------------------------------------------------
// Options query validation
// ---------------------------------------------------------------------------

export const validateOptionsQuery = (
  diagnostics: Diagnostic[],
  query: OptionsQuery,
  path: string,
  context: ValidationContext,
): void => {
  const validateLeafTransformSourceAndOptions = <Kind extends LeafOptionsQueryTransformKind>(
    kind: Kind,
    transformQuery: Extract<OptionsQuery, { readonly query: Kind }>,
  ): void => {
    const transformContract = getLeafOptionsQueryTransformContract(kind);
    const transformQueryRecord = transformQuery as Record<string, unknown>;
    const sourceQuery = (transformQuery as { readonly source: OptionsQuery }).source;
    for (const optionPolicy of transformContract.optionalBooleanOptions ?? []) {
      const optionValue = transformQueryRecord[optionPolicy.field];
      if (optionValue !== undefined && typeof optionValue !== 'boolean') {
        diagnostics.push({
          code: optionPolicy.diagnosticCode,
          path: `${path}.${optionPolicy.field}`,
          severity: 'error',
          message: optionPolicy.message,
          suggestion: optionPolicy.suggestion,
        });
      }
    }

    validateOptionsQuery(diagnostics, sourceQuery, `${path}.source`, context);
    const sourceShapes = inferQueryRuntimeShapes(sourceQuery);
    const uniqueSourceShapes = dedupeQueryRuntimeShapes(sourceShapes);
    const incompatibleShapes = inferTransformSourceIncompatibleRuntimeShapes(kind, uniqueSourceShapes);
    if (incompatibleShapes.length > 0) {
      diagnostics.push({
        code: transformContract.sourceShapePolicy.mismatchDiagnosticCode,
        path: `${path}.source`,
        severity: 'error',
        message: `${kind} source must produce ${transformContract.sourceShapePolicy.allowedSourceShapes.join(' or ')} items; found [${incompatibleShapes.join(', ')}].`,
        suggestion: transformContract.sourceShapePolicy.mismatchSuggestion,
      });
    }
  };
  const validateLeafTransformQueryByKind: {
    readonly [Kind in LeafOptionsQueryTransformKind]: (
      transformQuery: Extract<OptionsQuery, { readonly query: Kind }>,
    ) => void;
  } = {
    tokenZones: (transformQuery) => validateLeafTransformSourceAndOptions('tokenZones', transformQuery),
  };

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
    case 'tokenZones': {
      validateLeafTransformQueryByKind.tokenZones(query);
      return;
    }
    case 'tokensInZone': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      validateTokenFilter(diagnostics, query.filter, `${path}.filter`, context);
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
      validateTokenFilter(diagnostics, query.filter, `${path}.filter`, context);
      return;
    }
    case 'tokensInMapSpaces': {
      if (query.spaceFilter?.owner) {
        validatePlayerSelector(diagnostics, query.spaceFilter.owner, `${path}.spaceFilter.owner`, context);
      }
      if (query.spaceFilter?.condition) {
        validateConditionAst(
          diagnostics,
          query.spaceFilter.condition,
          appendQueryConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.query.spaceFilterCondition),
          context,
        );
      }
      validateTokenFilter(diagnostics, query.filter, `${path}.filter`, context);
      return;
    }
    case 'connectedZones': {
      validateZoneRef(diagnostics, query.zone, `${path}.zone`, context);
      if (query.via) {
        validateConditionAst(
          diagnostics,
          query.via,
          appendQueryConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.query.via),
          context,
        );
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
      validateCanonicalBinding(
        diagnostics,
        query.bind,
        `${path}.bind`,
        'DOMAIN_NEXT_IN_ORDER_BIND_INVALID',
        'nextInOrderByCondition.bind',
      );
      validateConditionAst(
        diagnostics,
        query.where,
        appendQueryConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.query.where),
        context,
      );
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
        validateConditionAst(
          diagnostics,
          query.filter.condition,
          appendQueryConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.query.filterCondition),
          context,
        );
      }
      return;
    }
    case 'enums':
    case 'players':
    case 'grantContext':
    case 'capturedSequenceZones': {
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
