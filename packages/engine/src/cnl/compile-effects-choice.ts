import type { EffectAST, NumericValueExpr } from '../kernel/types.js';
import { chooseOne as chooseOneBuilder, chooseN as chooseNBuilder, forEach as forEachBuilder, moveToken as moveTokenBuilder } from '../kernel/ast-builders.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  lowerNumericValueNode,
  lowerQueryNode,
} from './compile-conditions.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import { EFFECT_QUERY_DOMAIN_CONTRACTS, toInternalDecisionId } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import {
  isInteger,
  isRecord,
  makeConditionContext,
  makeSyntheticBinding,
  missingCapability,
  validateChoiceOptionsRuntimeShape,
  validateQueryDomainContract,
} from './compile-effects-utils.js';

export function lowerChooseOneEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseOne effect', source, ['{ chooseOne: { bind, options } }']);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const chooser = source.chooser === undefined
    ? { value: undefined, diagnostics: [] }
    : normalizePlayerSelector(source.chooser, `${path}.chooser`, context.seatIds);
  const diagnostics = [...options.diagnostics, ...chooser.diagnostics];
  if (options.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        options.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.chooseOneOptions,
        `${path}.options`,
      ),
    );
    diagnostics.push(
      ...validateChoiceOptionsRuntimeShape(
        options.value,
        `${path}.options`,
        'chooseOne',
      ),
    );
  }
  if (options.value === null) {
    return { value: null, diagnostics };
  }
  if (chooser.value === null) {
    return { value: null, diagnostics };
  }
  return {
    value: chooseOneBuilder({
      internalDecisionId: toInternalDecisionId(path),
      bind: source.bind,
      options: options.value,
      ...(chooser.value === undefined ? {} : { chooser: chooser.value }),
    }),
    diagnostics,
  };
}

export function lowerChooseNEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseN effect', source, [
      '{ chooseN: { bind, options, n } }',
      '{ chooseN: { bind, options, max, min? } }',
    ]);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const condCtx = makeConditionContext(context, scope);
  const chooser = source.chooser === undefined
    ? { value: undefined, diagnostics: [] }
    : normalizePlayerSelector(source.chooser, `${path}.chooser`, context.seatIds);
  const diagnostics = [...options.diagnostics, ...chooser.diagnostics];
  if (options.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        options.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.chooseNOptions,
        `${path}.options`,
      ),
    );
    diagnostics.push(
      ...validateChoiceOptionsRuntimeShape(
        options.value,
        `${path}.options`,
        'chooseN',
      ),
    );
  }

  const hasN = source.n !== undefined;
  const hasMin = source.min !== undefined;
  const hasMax = source.max !== undefined;

  if (hasN && (hasMin || hasMax)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'chooseN must use either exact "n" or range "min/max", not both.',
      suggestion: 'Use { n } for exact cardinality or { max, min? } for range cardinality.',
      alternatives: ['n', 'max'],
    });
  }

  if (!hasN && !hasMax) {
    diagnostics.push(...missingCapability(path, 'chooseN cardinality', source, ['{ n }', '{ max, min? }']).diagnostics);
  }

  let loweredMin: NumericValueExpr | undefined;
  let loweredMax: NumericValueExpr | undefined;

  if (hasN && (!isInteger(source.n) || source.n < 0)) {
    diagnostics.push(...missingCapability(`${path}.n`, 'chooseN n', source.n, ['non-negative integer']).diagnostics);
  }
  if (hasMax) {
    const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
    diagnostics.push(...maxResult.diagnostics);
    if (maxResult.value !== null) {
      loweredMax = maxResult.value;
      if (typeof loweredMax === 'number' && (!isInteger(loweredMax) || loweredMax < 0)) {
        diagnostics.push(...missingCapability(`${path}.max`, 'chooseN max', source.max, ['non-negative integer']).diagnostics);
      }
    }
  }
  if (hasMin) {
    const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
    diagnostics.push(...minResult.diagnostics);
    if (minResult.value !== null) {
      loweredMin = minResult.value;
      if (typeof loweredMin === 'number' && (!isInteger(loweredMin) || loweredMin < 0)) {
        diagnostics.push(...missingCapability(`${path}.min`, 'chooseN min', source.min, ['non-negative integer']).diagnostics);
      }
    }
  }

  if (
    loweredMax !== undefined
    && loweredMin !== undefined
    && typeof loweredMax === 'number'
    && typeof loweredMin === 'number'
    && loweredMin > loweredMax
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'chooseN min cannot exceed max.',
      suggestion: 'Set chooseN.min <= chooseN.max.',
    });
  }

  if (options.value === null || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }
  const normalizedChooser = chooser.value ?? undefined;

  const cardinality =
    hasN && isInteger(source.n)
      ? { n: source.n }
      : {
          max: loweredMax as NumericValueExpr,
          ...(loweredMin === undefined ? {} : { min: loweredMin }),
        };
  return {
    value: chooseNBuilder({
      internalDecisionId: toInternalDecisionId(path),
      bind: source.bind,
      options: options.value,
      ...(normalizedChooser === undefined ? {} : { chooser: normalizedChooser }),
      ...cardinality,
    }),
    diagnostics,
  };
}

export function lowerDistributeTokensEffects(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  if (!isRecord(source.tokens) || !isRecord(source.destinations)) {
    return missingCapability(path, 'distributeTokens effect', source, [
      '{ distributeTokens: { tokens, destinations, n } }',
      '{ distributeTokens: { tokens, destinations, max, min? } }',
    ]);
  }

  const condCtx = makeConditionContext(context, scope);
  const tokenOptions = lowerQueryNode(source.tokens, condCtx, `${path}.tokens`);
  const destinationOptions = lowerQueryNode(source.destinations, condCtx, `${path}.destinations`);
  const diagnostics = [...tokenOptions.diagnostics, ...destinationOptions.diagnostics];
  if (tokenOptions.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        tokenOptions.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.distributeTokensTokens,
        `${path}.tokens`,
      ),
    );
  }
  if (destinationOptions.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        destinationOptions.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.distributeTokensDestinations,
        `${path}.destinations`,
      ),
    );
  }

  const hasN = source.n !== undefined;
  const hasMin = source.min !== undefined;
  const hasMax = source.max !== undefined;

  if (hasN && (hasMin || hasMax)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'distributeTokens must use either exact "n" or range "min/max", not both.',
      suggestion: 'Use { n } for exact cardinality or { max, min? } for range cardinality.',
      alternatives: ['n', 'max'],
    });
  }

  if (!hasN && !hasMax) {
    diagnostics.push(...missingCapability(path, 'distributeTokens cardinality', source, ['{ n }', '{ max, min? }']).diagnostics);
  }

  let loweredMin: NumericValueExpr | undefined;
  let loweredMax: NumericValueExpr | undefined;

  if (hasN && (!isInteger(source.n) || source.n < 0)) {
    diagnostics.push(...missingCapability(`${path}.n`, 'distributeTokens n', source.n, ['non-negative integer']).diagnostics);
  }
  if (hasMax) {
    const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
    diagnostics.push(...maxResult.diagnostics);
    if (maxResult.value !== null) {
      loweredMax = maxResult.value;
      if (typeof loweredMax === 'number' && (!isInteger(loweredMax) || loweredMax < 0)) {
        diagnostics.push(...missingCapability(`${path}.max`, 'distributeTokens max', source.max, ['non-negative integer']).diagnostics);
      }
    }
  }
  if (hasMin) {
    const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
    diagnostics.push(...minResult.diagnostics);
    if (minResult.value !== null) {
      loweredMin = minResult.value;
      if (typeof loweredMin === 'number' && (!isInteger(loweredMin) || loweredMin < 0)) {
        diagnostics.push(...missingCapability(`${path}.min`, 'distributeTokens min', source.min, ['non-negative integer']).diagnostics);
      }
    }
  }

  if (
    loweredMax !== undefined
    && loweredMin !== undefined
    && typeof loweredMax === 'number'
    && typeof loweredMin === 'number'
    && loweredMin > loweredMax
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'distributeTokens min cannot exceed max.',
      suggestion: 'Set distributeTokens.min <= distributeTokens.max.',
    });
  }

  if (tokenOptions.value === null || destinationOptions.value === null || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  const selectedBind = makeSyntheticBinding(path, 'selected');
  const tokenBind = makeSyntheticBinding(path, 'token');
  const destinationBind = makeSyntheticBinding(path, 'destination');

  const cardinality =
    hasN && isInteger(source.n)
      ? { n: source.n }
      : {
          max: loweredMax as NumericValueExpr,
          ...(loweredMin === undefined ? {} : { min: loweredMin }),
        };

  return {
    value: [
      chooseNBuilder({
        internalDecisionId: toInternalDecisionId(`${path}.selectTokens`),
        bind: selectedBind,
        options: tokenOptions.value,
        ...cardinality,
      }),
      forEachBuilder({
        bind: tokenBind,
        over: {
          query: 'binding',
          name: selectedBind,
        },
        effects: [
          chooseOneBuilder({
            internalDecisionId: toInternalDecisionId(`${path}.chooseDestination`),
            bind: destinationBind,
            options: destinationOptions.value,
          }),
          moveTokenBuilder({
            token: tokenBind,
            from: { zoneExpr: { ref: 'tokenZone', token: tokenBind } },
            to: { zoneExpr: { ref: 'binding', name: destinationBind } },
          }),
        ],
      }),
    ],
    diagnostics,
  };
}
