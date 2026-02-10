import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, PlayerSel, ValueExpr } from '../kernel/types.js';
import {
  lowerConditionNode,
  lowerQueryNode,
  lowerValueNode,
  type ConditionLoweringContext,
} from './compile-conditions.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

const SUPPORTED_EFFECT_KINDS = [
  'setVar',
  'addVar',
  'moveToken',
  'moveAll',
  'moveTokenAdjacent',
  'draw',
  'shuffle',
  'createToken',
  'destroyToken',
  'if',
  'forEach',
  'let',
  'chooseOne',
  'chooseN',
] as const;

export interface EffectLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly bindingScope?: readonly string[];
}

export interface EffectLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function lowerEffectArray(
  source: readonly unknown[],
  context: EffectLoweringContext,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  const diagnostics: Diagnostic[] = [];
  const values: EffectAST[] = [];
  const scope = new BindingScope(context.bindingScope ?? []);

  source.forEach((entry, index) => {
    const lowered = lowerEffectNode(entry, context, scope, `${path}.${index}`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value !== null) {
      values.push(lowered.value);
    }
  });

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') && values.length !== source.length) {
    return { value: null, diagnostics };
  }

  return { value: values, diagnostics };
}

function lowerEffectNode(
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!isRecord(source)) {
    return missingCapability(path, 'effect node', source, SUPPORTED_EFFECT_KINDS);
  }

  if (isRecord(source.setVar)) {
    return lowerSetVarEffect(source.setVar, context, scope, `${path}.setVar`);
  }
  if (isRecord(source.addVar)) {
    return lowerAddVarEffect(source.addVar, context, scope, `${path}.addVar`);
  }
  if (isRecord(source.moveToken)) {
    return lowerMoveTokenEffect(source.moveToken, context, scope, `${path}.moveToken`);
  }
  if (isRecord(source.moveAll)) {
    return lowerMoveAllEffect(source.moveAll, context, scope, `${path}.moveAll`);
  }
  if (isRecord(source.moveTokenAdjacent)) {
    return lowerMoveTokenAdjacentEffect(source.moveTokenAdjacent, context, scope, `${path}.moveTokenAdjacent`);
  }
  if (isRecord(source.draw)) {
    return lowerDrawEffect(source.draw, context, scope, `${path}.draw`);
  }
  if (isRecord(source.shuffle)) {
    return lowerShuffleEffect(source.shuffle, context, scope, `${path}.shuffle`);
  }
  if (isRecord(source.createToken)) {
    return lowerCreateTokenEffect(source.createToken, context, scope, `${path}.createToken`);
  }
  if (isRecord(source.destroyToken)) {
    return lowerDestroyTokenEffect(source.destroyToken, scope, `${path}.destroyToken`);
  }
  if (isRecord(source.if)) {
    return lowerIfEffect(source.if, context, scope, `${path}.if`);
  }
  if (isRecord(source.forEach)) {
    return lowerForEachEffect(source.forEach, context, scope, `${path}.forEach`);
  }
  if (isRecord(source.let)) {
    return lowerLetEffect(source.let, context, scope, `${path}.let`);
  }
  if (isRecord(source.chooseOne)) {
    return lowerChooseOneEffect(source.chooseOne, context, scope, `${path}.chooseOne`);
  }
  if (isRecord(source.chooseN)) {
    return lowerChooseNEffect(source.chooseN, context, scope, `${path}.chooseN`);
  }

  return missingCapability(path, 'effect node', source, SUPPORTED_EFFECT_KINDS);
}

function lowerSetVarEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const scopeValue = source.scope;
  const varName = source.var;
  if ((scopeValue !== 'global' && scopeValue !== 'pvar') || typeof varName !== 'string') {
    return missingCapability(path, 'setVar effect', source);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics];
  if (value.value === null) {
    return { value: null, diagnostics };
  }

  if (scopeValue === 'global') {
    return {
      value: {
        setVar: {
          scope: 'global',
          var: varName,
          value: value.value,
        },
      },
      diagnostics,
    };
  }

  const player = lowerPlayerSelector(source.player, scope, `${path}.player`);
  diagnostics.push(...player.diagnostics);
  if (player.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setVar: {
        scope: 'pvar',
        player: player.value,
        var: varName,
        value: value.value,
      },
    },
    diagnostics,
  };
}

function lowerAddVarEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const scopeValue = source.scope;
  const varName = source.var;
  if ((scopeValue !== 'global' && scopeValue !== 'pvar') || typeof varName !== 'string') {
    return missingCapability(path, 'addVar effect', source);
  }

  const delta = lowerValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...delta.diagnostics];
  if (delta.value === null) {
    return { value: null, diagnostics };
  }

  if (scopeValue === 'global') {
    return {
      value: {
        addVar: {
          scope: 'global',
          var: varName,
          delta: delta.value,
        },
      },
      diagnostics,
    };
  }

  const player = lowerPlayerSelector(source.player, scope, `${path}.player`);
  diagnostics.push(...player.diagnostics);
  if (player.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      addVar: {
        scope: 'pvar',
        player: player.value,
        var: varName,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerMoveTokenEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
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
    ...validateBindingLikeString(source.token, scope, `${path}.token`),
  ];
  if (position === null) {
    diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path: `${path}.position`,
      severity: 'error',
      message: `Cannot lower moveToken.position to kernel AST: ${formatValue(source.position)}.`,
      suggestion: 'Use one of: top, bottom, random.',
      alternatives: ['top', 'bottom', 'random'],
    });
  }
  if (from.value === null || to.value === null || position === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      moveToken: {
        token: source.token,
        from: from.value,
        to: to.value,
        ...(position === undefined ? {} : { position }),
      },
    },
    diagnostics,
  };
}

function lowerMoveAllEffect(
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
    value: {
      moveAll: {
        from: from.value,
        to: to.value,
        ...(filter.value === undefined ? {} : { filter: filter.value }),
      },
    },
    diagnostics,
  };
}

function lowerMoveTokenAdjacentEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
    return missingCapability(path, 'moveTokenAdjacent effect', source, ['{ moveTokenAdjacent: { token, from, direction? } }']);
  }

  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const directionValue = source.direction;
  const diagnostics = [...from.diagnostics, ...validateBindingLikeString(source.token, scope, `${path}.token`)];

  if (directionValue !== undefined && typeof directionValue !== 'string') {
    diagnostics.push(...missingCapability(`${path}.direction`, 'moveTokenAdjacent direction', directionValue, ['string']).diagnostics);
  }
  if (typeof directionValue === 'string') {
    diagnostics.push(...validateBindingLikeString(directionValue, scope, `${path}.direction`));
  }
  if (from.value === null || (directionValue !== undefined && typeof directionValue !== 'string')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      moveTokenAdjacent: {
        token: source.token,
        from: from.value,
        ...(directionValue === undefined ? {} : { direction: directionValue }),
      },
    },
    diagnostics,
  };
}

function lowerDrawEffect(
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
    value: {
      draw: {
        from: from.value,
        to: to.value,
        count: source.count,
      },
    },
    diagnostics,
  };
}

function lowerShuffleEffect(
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
    value: { shuffle: { zone: zone.value } },
    diagnostics: zone.diagnostics,
  };
}

function lowerCreateTokenEffect(
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
    value: {
      createToken: {
        type: source.type,
        zone: zone.value,
        ...(Object.keys(props).length === 0 ? {} : { props }),
      },
    },
    diagnostics,
  };
}

function lowerDestroyTokenEffect(
  source: Record<string, unknown>,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
    return missingCapability(path, 'destroyToken effect', source, ['{ destroyToken: { token } }']);
  }
  const diagnostics = validateBindingLikeString(source.token, scope, `${path}.token`);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }
  return {
    value: { destroyToken: { token: source.token } },
    diagnostics,
  };
}

function lowerIfEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!Array.isArray(source.then)) {
    return missingCapability(path, 'if effect', source, ['{ if: { when, then: [], else?: [] } }']);
  }
  if (source.else !== undefined && !Array.isArray(source.else)) {
    return missingCapability(path, 'if.else effect list', source.else, ['array']);
  }

  const when = lowerConditionNode(source.when, makeConditionContext(context, scope), `${path}.when`);
  const thenEffects = lowerNestedEffects(source.then, context, scope, `${path}.then`);
  const elseEffects =
    source.else === undefined
      ? ({ value: undefined, diagnostics: [] as readonly Diagnostic[] } as const)
      : lowerNestedEffects(source.else, context, scope, `${path}.else`);
  const diagnostics = [...when.diagnostics, ...thenEffects.diagnostics, ...elseEffects.diagnostics];
  if (when.value === null || thenEffects.value === null || elseEffects.value === null) {
    return { value: null, diagnostics };
  }
  return {
    value: {
      if: {
        when: when.value,
        then: thenEffects.value,
        ...(elseEffects.value === undefined ? {} : { else: elseEffects.value }),
      },
    },
    diagnostics,
  };
}

function lowerForEachEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.effects)) {
    return missingCapability(path, 'forEach effect', source, ['{ forEach: { bind, over, effects, limit? } }']);
  }

  const over = lowerQueryNode(source.over, makeConditionContext(context, scope), `${path}.over`);
  const diagnostics = [...over.diagnostics];
  if (source.limit !== undefined && (!isInteger(source.limit) || source.limit < 0)) {
    diagnostics.push(...missingCapability(`${path}.limit`, 'forEach limit', source.limit, ['non-negative integer']).diagnostics);
  }

  diagnostics.push(...scope.shadowWarning(source.bind, `${path}.bind`));
  const loweredEffects = scope.withBinding(source.bind, () =>
    lowerNestedEffects(source.effects as readonly unknown[], context, scope, `${path}.effects`),
  );
  diagnostics.push(...loweredEffects.diagnostics);
  if (over.value === null || loweredEffects.value === null || (source.limit !== undefined && (!isInteger(source.limit) || source.limit < 0))) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      forEach: {
        bind: source.bind,
        over: over.value,
        effects: loweredEffects.value,
        ...(source.limit === undefined ? {} : { limit: source.limit }),
      },
    },
    diagnostics,
  };
}

function lowerLetEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.in)) {
    return missingCapability(path, 'let effect', source, ['{ let: { bind, value, in } }']);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  const inEffects = scope.withBinding(source.bind, () => lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`));
  diagnostics.push(...inEffects.diagnostics);

  if (value.value === null || inEffects.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      let: {
        bind: source.bind,
        value: value.value,
        in: inEffects.value,
      },
    },
    diagnostics,
  };
}

function lowerChooseOneEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseOne effect', source, ['{ chooseOne: { bind, options } }']);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  if (options.value === null) {
    return { value: null, diagnostics: options.diagnostics };
  }
  return {
    value: {
      chooseOne: {
        bind: source.bind,
        options: options.value,
      },
    },
    diagnostics: options.diagnostics,
  };
}

function lowerChooseNEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseN effect', source, ['{ chooseN: { bind, options, n } }']);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const diagnostics = [...options.diagnostics];
  if (!isInteger(source.n) || source.n < 0) {
    diagnostics.push(...missingCapability(`${path}.n`, 'chooseN n', source.n, ['non-negative integer']).diagnostics);
  }
  if (options.value === null || !isInteger(source.n) || source.n < 0) {
    return { value: null, diagnostics };
  }
  return {
    value: {
      chooseN: {
        bind: source.bind,
        options: options.value,
        n: source.n,
      },
    },
    diagnostics,
  };
}

function lowerNestedEffects(
  source: readonly unknown[],
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  const diagnostics: Diagnostic[] = [];
  const values: EffectAST[] = [];
  source.forEach((entry, index) => {
    const lowered = lowerEffectNode(entry, context, scope, `${path}.${index}`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value !== null) {
      values.push(lowered.value);
    }
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') && values.length !== source.length) {
    return { value: null, diagnostics };
  }
  return { value: values, diagnostics };
}

function lowerZoneSelector(
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<string> {
  const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path);
  if (zone.value === null) {
    return { value: null, diagnostics: zone.diagnostics };
  }
  const diagnostics = validateZoneQualifierBinding(zone.value, scope, path);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }
  return {
    value: zone.value,
    diagnostics,
  };
}

function lowerPlayerSelector(source: unknown, scope: BindingScope, path: string): EffectLoweringResult<PlayerSel> {
  const selector = normalizePlayerSelector(source, path);
  if (selector.value === null) {
    return selector;
  }
  if (typeof selector.value === 'object' && 'chosen' in selector.value) {
    const diagnostics = validateBindingLikeString(selector.value.chosen, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return {
      value: selector.value,
      diagnostics,
    };
  }
  return selector;
}

function validateZoneQualifierBinding(zoneSelector: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  const splitIndex = zoneSelector.indexOf(':');
  if (splitIndex < 0) {
    return [];
  }
  const qualifier = zoneSelector.slice(splitIndex + 1);
  return validateBindingLikeString(qualifier, scope, path);
}

function validateBindingLikeString(value: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  if (!value.startsWith('$') || scope.has(value)) {
    return [];
  }
  return [
    {
      code: 'CNL_COMPILER_BINDING_UNBOUND',
      path,
      severity: 'error',
      message: `Unbound binding reference "${value}".`,
      suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
      alternatives: scope.alternativesFor(value),
    },
  ];
}

function makeConditionContext(context: EffectLoweringContext, scope: BindingScope): ConditionLoweringContext {
  return {
    ownershipByBase: context.ownershipByBase,
    bindingScope: scope.visibleBindings(),
  };
}

function missingCapability<TValue>(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): EffectLoweringResult<TValue> {
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

class BindingScope {
  private readonly frames: string[][] = [];

  constructor(initial: readonly string[]) {
    this.frames.push([...initial]);
  }

  has(name: string): boolean {
    return this.frames.some((frame) => frame.includes(name));
  }

  visibleBindings(): readonly string[] {
    const deduped = new Set<string>();
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      for (const name of this.frames[index] ?? []) {
        deduped.add(name);
      }
    }
    return [...deduped].sort((left, right) => left.localeCompare(right));
  }

  withBinding<TValue>(name: string, callback: () => TValue): TValue {
    this.frames.push([name]);
    try {
      return callback();
    } finally {
      this.frames.pop();
    }
  }

  shadowWarning(name: string, path: string): readonly Diagnostic[] {
    if (!this.has(name)) {
      return [];
    }
    return [
      {
        code: 'CNL_COMPILER_BINDING_SHADOWED',
        path,
        severity: 'warning',
        message: `Binding "${name}" shadows an outer binding.`,
        suggestion: 'Rename the inner binding to avoid accidental capture.',
      },
    ];
  }

  alternativesFor(name: string): readonly string[] {
    return [...this.visibleBindings()]
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
