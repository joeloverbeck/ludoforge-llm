import type { Diagnostic } from '../kernel/diagnostics.js';
import type { AssetRowPredicate, TokenFilterExpr, TokenFilterPredicate } from '../kernel/types.js';
import {
  isAllowedTokenFilterProp,
  isPredicateOp,
  PREDICATE_OPERATORS,
  tokenFilterPropAlternatives,
} from '../contracts/index.js';
import { isTokenFilterPredicateExpr } from '../kernel/token-filter-expr-utils.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  lowerBooleanArityTuple,
  lowerScalarMembershipLiteral,
  type ConditionLoweringContext,
  type ConditionLoweringResult,
  type ConditionLoweringRuntime,
  isRecord,
  missingCapability,
  rejectPredicateAliasKeysWhenCanonicalShapePresent,
} from './compile-conditions-shared.js';
import { listCanonicalNamedSetAlternatives, normalizeNamedSetId, type NamedSetId } from './named-set-utils.js';

type LoweredTokenFilterSelector =
  | { readonly prop: string }
  | { readonly field: Extract<TokenFilterPredicate['field'], object> };

export function createTokenFilterLowerers(
  runtime: ConditionLoweringRuntime,
): Pick<ConditionLoweringRuntime, 'lowerAssetRowFilterArray' | 'lowerTokenFilterExpr'> {
  function lowerTokenFilterEntry(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<TokenFilterPredicate> {
    if (!isRecord(source)) {
      return missingCapability(path, 'token filter entry', source, [
        '{ prop: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }',
        '{ field: { kind: "prop", prop: string }|{ kind: "tokenId" }|{ kind: "tokenZone" }, op: "eq"|"neq"|"in"|"notIn", value: <value> }',
      ]);
    }
    const aliasRejection = rejectPredicateAliasKeysWhenCanonicalShapePresent(
      source,
      path,
      'token filter entry',
      '{ prop: string, op: "eq"|"neq"|"in"|"notIn", value: <value> } | { field, op, value }',
    );
    if (aliasRejection !== null) {
      return aliasRejection;
    }

    const selector = lowerTokenFilterSelector(source);
    if (selector === null) {
      return missingCapability(path, 'token filter entry', source, [
        '{ prop: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }',
        '{ field: { kind: "prop", prop: string }|{ kind: "tokenId" }|{ kind: "tokenZone" }, op: "eq"|"neq"|"in"|"notIn", value: <value> }',
      ]);
    }

    const prop = tokenFilterSelectorProp(selector);
    if (prop !== undefined) {
      const propDiagnostics = validateDeclaredTokenFilterProp(context, prop, tokenFilterSelectorPropPath(selector, path));
      if (propDiagnostics.length > 0) {
        return { value: null, diagnostics: propDiagnostics };
      }
    }

    if (!isPredicateOp(source.op)) {
      return missingCapability(path, 'token filter operator', source.op, [...PREDICATE_OPERATORS]);
    }
    const op = source.op as TokenFilterPredicate['op'];
    const rawValue = source.value;

    if (rawValue === undefined) {
      return missingCapability(path, 'token filter value', source, ['{ prop|field, op, value: <string|number|boolean|(string|number|boolean)[]|ValueExpr> }']);
    }

    if (op === 'in' || op === 'notIn') {
      const namedSetReference = lowerNamedSetReference(rawValue);
      if (namedSetReference !== null) {
        const values = context.namedSets?.get(namedSetReference.name);
        if (values === undefined) {
          return {
            value: null,
            diagnostics: [{
              code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_UNKNOWN_NAMED_SET,
              path: `${path}.value.name`,
              severity: 'error',
              message: `Unknown metadata.namedSets entry "${namedSetReference.name}".`,
              suggestion: 'Declare the set under metadata.namedSets or use a literal string array.',
              ...(context.namedSets === undefined ? {} : { alternatives: listCanonicalNamedSetAlternatives(context.namedSets) }),
            }],
          };
        }
        return {
          value: withTokenFilterSelector(selector, op, [...values]),
          diagnostics: [],
        };
      }

      if (Array.isArray(rawValue)) {
        const literalSet = lowerScalarMembershipLiteral(
          rawValue,
          `${path}.value`,
          'token filter set value',
          [
            'homogeneous (string|number|boolean)[]',
            '{ ref: "binding", name: string }',
            '{ ref: "grantContext", key: string }',
            '{ ref: "capturedSequenceZones", key: <free-operation sequence key> }',
          ],
        );
        if (literalSet.value === null) {
          return { value: null, diagnostics: literalSet.diagnostics };
        }
        const diagnostics = literalSet.value.flatMap((item, index) =>
          typeof item === 'string' && prop !== undefined
            ? validateCanonicalTokenTraitLiteral(context, prop, item, `${path}.value.${index}`)
            : [],
        );
        return {
          value: withTokenFilterSelector(selector, op, [...literalSet.value]),
          diagnostics,
        };
      }

      const loweredValue = runtime.lowerValueNode(rawValue, context, `${path}.value`);
      if (loweredValue.value === null) {
        return { value: null, diagnostics: loweredValue.diagnostics };
      }
      if (
        typeof loweredValue.value !== 'object'
        || loweredValue.value === null
        || !('ref' in loweredValue.value)
        || (
          loweredValue.value.ref !== 'binding'
          && loweredValue.value.ref !== 'grantContext'
          && loweredValue.value.ref !== 'capturedSequenceZones'
        )
      ) {
        return missingCapability(`${path}.value`, 'token filter set value', rawValue, [
          'homogeneous (string|number|boolean)[]',
          '{ ref: "binding", name: string }',
          '{ ref: "grantContext", key: string }',
          '{ ref: "capturedSequenceZones", key: <free-operation sequence key> }',
        ]);
      }

      return {
        value: withTokenFilterSelector(selector, op, loweredValue.value),
        diagnostics: loweredValue.diagnostics,
      };
    }

    const loweredValue = runtime.lowerValueNode(rawValue, context, `${path}.value`);
    if (loweredValue.value === null) {
      return { value: null, diagnostics: loweredValue.diagnostics };
    }

    const canonicalDiagnostics =
      typeof loweredValue.value === 'string' && prop !== undefined
        ? validateCanonicalTokenTraitLiteral(context, prop, loweredValue.value, `${path}.value`)
        : [];

    return {
      value: withTokenFilterSelector(selector, op, loweredValue.value),
      diagnostics: [...loweredValue.diagnostics, ...canonicalDiagnostics],
    };
  }

  function lowerAssetRowFilterEntry(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<AssetRowPredicate> {
    if (!isRecord(source) || typeof source.field !== 'string') {
      return missingCapability(path, 'assetRows where entry', source, ['{ field: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }']);
    }
    const aliasRejection = rejectPredicateAliasKeysWhenCanonicalShapePresent(
      source,
      path,
      'assetRows where entry',
      '{ field: string, op: "eq"|"neq"|"in"|"notIn", value: <value> }',
    );
    if (aliasRejection !== null) {
      return aliasRejection;
    }
    const field = source.field;
    if (!isPredicateOp(source.op)) {
      return missingCapability(path, 'assetRows where operator', source.op, [...PREDICATE_OPERATORS]);
    }
    const op = source.op as AssetRowPredicate['op'];
    const rawValue = source.value;

    if (rawValue === undefined) {
      return missingCapability(path, 'assetRows where value', source, ['{ field, op, value: <string|number|boolean|(string|number|boolean)[]|ValueExpr> }']);
    }

    if (op === 'in' || op === 'notIn') {
      if (Array.isArray(rawValue)) {
        const literalSet = lowerScalarMembershipLiteral(
          rawValue,
          `${path}.value`,
          'assetRows set value',
          ['homogeneous (string|number|boolean)[]', '{ ref: "binding", name: string }', '{ ref: "grantContext", key: string }'],
        );
        if (literalSet.value === null) {
          return { value: null, diagnostics: literalSet.diagnostics };
        }
        return {
          value: { field, op, value: [...literalSet.value] },
          diagnostics: literalSet.diagnostics,
        };
      }

      const loweredValue = runtime.lowerValueNode(rawValue, context, `${path}.value`);
      if (loweredValue.value === null) {
        return { value: null, diagnostics: loweredValue.diagnostics };
      }
      if (
        typeof loweredValue.value !== 'object'
        || loweredValue.value === null
        || !('ref' in loweredValue.value)
        || (loweredValue.value.ref !== 'binding' && loweredValue.value.ref !== 'grantContext')
      ) {
        return missingCapability(`${path}.value`, 'assetRows set value', rawValue, [
          'homogeneous (string|number|boolean)[]',
          '{ ref: "binding", name: string }',
          '{ ref: "grantContext", key: string }',
        ]);
      }

      return {
        value: { field, op, value: loweredValue.value },
        diagnostics: loweredValue.diagnostics,
      };
    }

    const loweredValue = runtime.lowerValueNode(rawValue, context, `${path}.value`);
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

  function lowerTokenFilterArray(
    source: readonly unknown[],
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<readonly TokenFilterExpr[]> {
    const diagnostics: Diagnostic[] = [];
    const values: TokenFilterExpr[] = [];

    source.forEach((entry, index) => {
      const lowered = runtime.lowerTokenFilterExpr(entry, context, `${path}.${index}`);
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

  function lowerTokenFilterExpr(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<TokenFilterExpr> {
    if (!isRecord(source)) {
      return missingCapability(path, 'token filter expression', source, [
        '{ prop, op, value }',
        '{ op: "and"|"or", args: [<TokenFilterExpr>, ...] }',
        '{ op: "not", arg: <TokenFilterExpr> }',
      ]);
    }

    if (source.op === 'and' || source.op === 'or') {
      const loweredArgs = lowerBooleanArityTuple<TokenFilterExpr>(
        { op: source.op, args: source.args },
        path,
        `token filter ${source.op}`,
        [
          `{ op: "${source.op}", args: [<TokenFilterExpr>, ...] }`,
        ],
        (args) => lowerTokenFilterArray(args, context, `${path}.args`),
      );
      if (loweredArgs.value === null) {
        return { value: null, diagnostics: loweredArgs.diagnostics };
      }
      const normalized = normalizeTokenFilterExprShape({ op: source.op, args: loweredArgs.value }, path);
      return {
        value: normalized.value,
        diagnostics: [...loweredArgs.diagnostics, ...normalized.diagnostics],
      };
    }

    if (source.op === 'not') {
      const lowered = runtime.lowerTokenFilterExpr(source.arg, context, `${path}.arg`);
      if (lowered.value === null) {
        return lowered;
      }
      const normalized = normalizeTokenFilterExprShape({ op: 'not', arg: lowered.value }, path);
      return {
        value: normalized.value,
        diagnostics: [...lowered.diagnostics, ...normalized.diagnostics],
      };
    }

    return lowerTokenFilterEntry(source, context, path);
  }

  return {
    lowerAssetRowFilterArray,
    lowerTokenFilterExpr,
  };
}

function validateDeclaredTokenFilterProp(
  context: ConditionLoweringContext,
  prop: string,
  path: string,
): readonly Diagnostic[] {
  if (isAllowedTokenFilterProp(prop, context.tokenFilterProps)) {
    return [];
  }
  const alternatives = tokenFilterPropAlternatives(context.tokenFilterProps);
  return [
    {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN,
      path,
      severity: 'error',
      message: `Token filter references undeclared prop "${prop}".`,
      suggestion: 'Use a token prop declared by selected token types/piece runtime props.',
      alternatives,
    },
  ];
}

function lowerNamedSetReference(source: unknown): { readonly name: NamedSetId } | null {
  if (!isRecord(source) || source.ref !== 'namedSet' || typeof source.name !== 'string' || source.name.trim() === '') {
    return null;
  }
  return { name: normalizeNamedSetId(source.name) };
}

function lowerTokenFilterSelector(source: Record<string, unknown>): LoweredTokenFilterSelector | null {
  if (typeof source.prop === 'string') {
    return { prop: source.prop };
  }
  if (!isRecord(source.field)) {
    return null;
  }
  if (source.field.kind === 'tokenId') {
    return { field: { kind: 'tokenId' } };
  }
  if (source.field.kind === 'tokenZone') {
    return { field: { kind: 'tokenZone' } };
  }
  if (source.field.kind === 'prop' && typeof source.field.prop === 'string') {
    return { field: { kind: 'prop', prop: source.field.prop } };
  }
  return null;
}

function tokenFilterSelectorProp(selector: LoweredTokenFilterSelector): string | undefined {
  if ('prop' in selector) {
    return selector.prop;
  }
  return selector.field.kind === 'prop' ? selector.field.prop : undefined;
}

function tokenFilterSelectorPropPath(selector: LoweredTokenFilterSelector, path: string): string {
  return 'prop' in selector ? `${path}.prop` : `${path}.field.prop`;
}

function withTokenFilterSelector(
  selector: LoweredTokenFilterSelector,
  op: TokenFilterPredicate['op'],
  value: TokenFilterPredicate['value'],
): TokenFilterPredicate {
  return 'prop' in selector
    ? { prop: selector.prop, op, value }
    : { field: selector.field, op, value };
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
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL,
      path,
      severity: 'error',
      message: `Token filter uses non-canonical value "${value}" for prop "${prop}".`,
      suggestion: 'Use a canonical value declared by piece runtime props.',
      alternatives: [...vocabulary],
    },
  ];
}

function normalizeTokenFilterExprShape(
  expr: TokenFilterExpr,
  path: string,
): ConditionLoweringResult<TokenFilterExpr> {
  if (isTokenFilterPredicateExpr(expr)) {
    return { value: expr, diagnostics: [] };
  }

  if (expr.op === 'not') {
    const normalizedArg = normalizeTokenFilterExprShape(expr.arg, `${path}.arg`);
    if (normalizedArg.value === null) {
      return normalizedArg;
    }
    return {
      value: {
        op: 'not',
        arg: normalizedArg.value,
      },
      diagnostics: normalizedArg.diagnostics,
    };
  }

  const diagnostics: Diagnostic[] = [];
  const normalizedArgs: TokenFilterExpr[] = [];
  expr.args.forEach((arg, index) => {
    const normalized = normalizeTokenFilterExprShape(arg, `${path}.args.${index}`);
    diagnostics.push(...normalized.diagnostics);
    if (normalized.value !== null) {
      normalizedArgs.push(normalized.value);
    }
  });
  if (normalizedArgs.length !== expr.args.length) {
    return { value: null, diagnostics };
  }

  const flattenedArgs: TokenFilterExpr[] = [];

  for (const arg of normalizedArgs) {
    if (isTokenFilterPredicateExpr(arg) || arg.op === 'not') {
      flattenedArgs.push(arg);
      continue;
    }
    if (arg.op === expr.op) {
      flattenedArgs.push(...arg.args);
      continue;
    }
    flattenedArgs.push(arg);
  }

  if (flattenedArgs.length === 1) {
    const single = flattenedArgs[0];
    if (single !== undefined) {
      return { value: single, diagnostics };
    }
  }

  if (flattenedArgs.length === 0) {
    return missingCapability(path, `token filter ${expr.op}`, expr, [
      `{ op: "${expr.op}", args: [<TokenFilterExpr>, ...] }`,
    ]);
  }

  const [first, ...rest] = flattenedArgs;
  return {
    value: {
      op: expr.op as 'and' | 'or',
      args: [first!, ...rest],
    },
    diagnostics,
  };
}
