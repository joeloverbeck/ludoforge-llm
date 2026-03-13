import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, PlayerSel, TokenFilterExpr, ValueExpr } from '../kernel/types.js';
import {
  lowerConditionNode,
  lowerTokenFilterExpr,
  lowerValueNode,
} from './compile-conditions.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import {
  formatValue,
  isInteger,
  isRecord,
  lowerPlayerSelector,
  lowerZoneSelector,
  makeConditionContext,
  missingCapability,
  validateBindingReference,
  validatePrefixedBindingReference,
} from './compile-effects-utils.js';
import {
  moveToken as moveTokenBuilder,
  moveAll as moveAllBuilder,
  moveTokenAdjacent as moveTokenAdjacentBuilder,
  draw as drawBuilder,
  reveal as revealBuilder,
  conceal as concealBuilder,
  shuffle as shuffleBuilder,
  createToken as createTokenBuilder,
  destroyToken as destroyTokenBuilder,
  setTokenProp as setTokenPropBuilder,
} from '../kernel/ast-builders.js';

function validateCanonicalTokenBindingField(
  effectKind: 'moveToken' | 'moveTokenAdjacent' | 'destroyToken' | 'setTokenProp',
  token: unknown,
  scope: BindingScope,
  path: string,
): readonly Diagnostic[] {
  if (typeof token !== 'string') {
    return [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: `${effectKind}.token must be a canonical token binding string like "$token", but received ${formatValue(token)}.`,
        suggestion: 'Bind the token with chooseOne, chooseN, or forEach, then reference it directly as token: $token.',
        alternatives: ['$token'],
      },
    ];
  }
  return validateBindingReference(token, scope, path);
}

export function lowerMoveTokenEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const token = source.token;
  if (token === undefined) {
    return missingCapability(path, 'moveToken effect', source, ['{ moveToken: { token, from, to, position? } }']);
  }

  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const position =
    source.position === undefined || source.position === 'top' || source.position === 'bottom' || source.position === 'random'
      ? source.position
      : null;

  const diagnostics = [
    ...from.diagnostics,
    ...to.diagnostics,
    ...validateCanonicalTokenBindingField('moveToken', token, scope, `${path}.token`),
  ];
  if (position === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path: `${path}.position`,
      severity: 'error',
      message: `Cannot lower moveToken.position to kernel AST: ${formatValue(source.position)}.`,
      suggestion: 'Use one of: top, bottom, random.',
      alternatives: ['top', 'bottom', 'random'],
    });
  }
  if (
    diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    || typeof token !== 'string'
    || from.value === null
    || to.value === null
    || position === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: moveTokenBuilder({
      token,
      from: from.value,
      to: to.value,
      ...(position === undefined ? {} : { position }),
    }),
    diagnostics,
  };
}

export function lowerMoveAllEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const filter =
    source.filter === undefined
      ? ({ value: undefined, diagnostics: [] } as const)
      : lowerConditionNode(source.filter, makeConditionContext(context, scope), `${path}.filter`);
  const diagnostics = [...from.diagnostics, ...to.diagnostics, ...filter.diagnostics];
  if (from.value === null || to.value === null || filter.value === null) {
    return { value: null, diagnostics };
  }
  return {
    value: moveAllBuilder({
      from: from.value,
      to: to.value,
      ...(filter.value === undefined ? {} : { filter: filter.value }),
    }),
    diagnostics,
  };
}

export function lowerMoveTokenAdjacentEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const token = source.token;
  if (token === undefined) {
    return missingCapability(path, 'moveTokenAdjacent effect', source, ['{ moveTokenAdjacent: { token, from, direction? } }']);
  }

  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const directionValue = source.direction;
  const diagnostics = [...from.diagnostics, ...validateCanonicalTokenBindingField('moveTokenAdjacent', token, scope, `${path}.token`)];

  if (directionValue !== undefined && typeof directionValue !== 'string') {
    diagnostics.push(...missingCapability(`${path}.direction`, 'moveTokenAdjacent direction', directionValue, ['string']).diagnostics);
  }
  if (typeof directionValue === 'string') {
    diagnostics.push(...validatePrefixedBindingReference(directionValue, scope, `${path}.direction`));
  }
  if (
    diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    || typeof token !== 'string'
    || from.value === null
    || (directionValue !== undefined && typeof directionValue !== 'string')
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: moveTokenAdjacentBuilder({
      token,
      from: from.value,
      ...(directionValue === undefined ? {} : { direction: directionValue }),
    }),
    diagnostics,
  };
}

export function lowerDrawEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const diagnostics = [...from.diagnostics, ...to.diagnostics];
  if (!isInteger(source.count) || source.count < 0) {
    diagnostics.push(...missingCapability(`${path}.count`, 'draw count', source.count, ['non-negative integer']).diagnostics);
  }
  if (from.value === null || to.value === null || !isInteger(source.count) || source.count < 0) {
    return { value: null, diagnostics };
  }
  return {
    value: drawBuilder({
      from: from.value,
      to: to.value,
      count: source.count,
    }),
    diagnostics,
  };
}

export function lowerRevealEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  let to: 'all' | PlayerSel;
  if (source.to === 'all') {
    to = 'all';
  } else {
    const loweredTo = lowerPlayerSelector(source.to, scope, `${path}.to`, context.seatIds);
    diagnostics.push(...loweredTo.diagnostics);
    if (loweredTo.value === null) {
      return { value: null, diagnostics };
    }
    to = loweredTo.value;
  }

  let filter: TokenFilterExpr | undefined;
  if (source.filter !== undefined) {
    const loweredFilter = lowerTokenFilterExpr(source.filter, makeConditionContext(context, scope), `${path}.filter`);
    diagnostics.push(...loweredFilter.diagnostics);
    if (loweredFilter.value === null) {
      return { value: null, diagnostics };
    }
    filter = loweredFilter.value;
  }

  return {
    value: revealBuilder({
      zone: zone.value,
      to,
      ...(filter === undefined ? {} : { filter }),
    }),
    diagnostics,
  };
}

export function lowerConcealEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  let from: 'all' | PlayerSel | undefined;
  if (source.from === 'all') {
    from = 'all';
  } else if (source.from !== undefined) {
    const loweredFrom = lowerPlayerSelector(source.from, scope, `${path}.from`, context.seatIds);
    diagnostics.push(...loweredFrom.diagnostics);
    if (loweredFrom.value === null) {
      return { value: null, diagnostics };
    }
    from = loweredFrom.value;
  }

  let filter: TokenFilterExpr | undefined;
  if (source.filter !== undefined) {
    const loweredFilter = lowerTokenFilterExpr(source.filter, makeConditionContext(context, scope), `${path}.filter`);
    diagnostics.push(...loweredFilter.diagnostics);
    if (loweredFilter.value === null) {
      return { value: null, diagnostics };
    }
    filter = loweredFilter.value;
  }

  return {
    value: concealBuilder({
      zone: zone.value,
      ...(from === undefined ? {} : { from }),
      ...(filter === undefined ? {} : { filter }),
    }),
    diagnostics,
  };
}

export function lowerShuffleEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  if (zone.value === null) {
    return { value: null, diagnostics: zone.diagnostics };
  }
  return {
    value: shuffleBuilder({ zone: zone.value }),
    diagnostics: zone.diagnostics,
  };
}

export function lowerCreateTokenEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.type !== 'string') {
    return missingCapability(path, 'createToken effect', source, ['{ createToken: { type, zone, props? } }']);
  }

  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  if (source.props !== undefined && !isRecord(source.props)) {
    return {
      value: null,
      diagnostics: [
        ...diagnostics,
        ...missingCapability(`${path}.props`, 'createToken props', source.props, ['record of value expressions']).diagnostics,
      ],
    };
  }

  const props: Record<string, ValueExpr> = {};
  if (isRecord(source.props)) {
    Object.entries(source.props).forEach(([propName, propValue]) => {
      const lowered = lowerValueNode(propValue, makeConditionContext(context, scope), `${path}.props.${propName}`);
      diagnostics.push(...lowered.diagnostics);
      if (lowered.value !== null) {
        props[propName] = lowered.value;
      }
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: createTokenBuilder({
      type: source.type,
      zone: zone.value,
      ...(Object.keys(props).length === 0 ? {} : { props }),
    }),
    diagnostics,
  };
}

export function lowerDestroyTokenEffect(
  source: Record<string, unknown>,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const token = source.token;
  if (token === undefined) {
    return missingCapability(path, 'destroyToken effect', source, ['{ destroyToken: { token } }']);
  }
  const diagnostics = validateCanonicalTokenBindingField('destroyToken', token, scope, `${path}.token`);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || typeof token !== 'string') {
    return { value: null, diagnostics };
  }
  return {
    value: destroyTokenBuilder({ token }),
    diagnostics,
  };
}

export function lowerSetTokenPropEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const token = source.token;
  if (token === undefined || typeof source.prop !== 'string') {
    return missingCapability(path, 'setTokenProp effect', source, ['{ setTokenProp: { token, prop, value } }']);
  }

  const bindingDiagnostics = validateCanonicalTokenBindingField('setTokenProp', token, scope, `${path}.token`);
  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...bindingDiagnostics, ...value.diagnostics];

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || typeof token !== 'string' || value.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: setTokenPropBuilder({ token, prop: source.prop, value: value.value }),
    diagnostics,
  };
}
