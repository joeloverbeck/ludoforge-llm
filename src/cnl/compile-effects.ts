import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ConditionAST, EffectAST, PlayerSel, ValueExpr, ZoneRef } from '../kernel/types.js';
import { collectSequentialBindings } from './binder-surface-registry.js';
import {
  lowerConditionNode,
  lowerQueryNode,
  lowerValueNode,
  type ConditionLoweringContext,
} from './compile-conditions.js';
import { SUPPORTED_EFFECT_KINDS } from './effect-kind-registry.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface EffectLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly bindingScope?: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
}

export interface EffectLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

const toInternalDecisionId = (path: string): string => `decision:${path}`;

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
      registerSequentialBinding(lowered.value, scope);
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
  if (isRecord(source.setTokenProp)) {
    return lowerSetTokenPropEffect(source.setTokenProp, context, scope, `${path}.setTokenProp`);
  }
  if (isRecord(source.if)) {
    return lowerIfEffect(source.if, context, scope, `${path}.if`);
  }
  if (isRecord(source.forEach)) {
    return lowerForEachEffect(source.forEach, context, scope, `${path}.forEach`);
  }
  if (isRecord(source.removeByPriority)) {
    return lowerRemoveByPriorityEffect(source.removeByPriority, context, scope, `${path}.removeByPriority`);
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
  if (isRecord(source.rollRandom)) {
    return lowerRollRandomEffect(source.rollRandom, context, scope, `${path}.rollRandom`);
  }
  if (isRecord(source.setMarker)) {
    return lowerSetMarkerEffect(source.setMarker, context, scope, `${path}.setMarker`);
  }
  if (isRecord(source.shiftMarker)) {
    return lowerShiftMarkerEffect(source.shiftMarker, context, scope, `${path}.shiftMarker`);
  }
  if (isRecord(source.setGlobalMarker)) {
    return lowerSetGlobalMarkerEffect(source.setGlobalMarker, context, scope, `${path}.setGlobalMarker`);
  }
  if (isRecord(source.flipGlobalMarker)) {
    return lowerFlipGlobalMarkerEffect(source.flipGlobalMarker, context, scope, `${path}.flipGlobalMarker`);
  }
  if (isRecord(source.shiftGlobalMarker)) {
    return lowerShiftGlobalMarkerEffect(source.shiftGlobalMarker, context, scope, `${path}.shiftGlobalMarker`);
  }
  if (isRecord(source.grantFreeOperation)) {
    return lowerGrantFreeOperationEffect(source.grantFreeOperation, context, scope, `${path}.grantFreeOperation`);
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

function lowerSetTokenPropEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string' || typeof source.prop !== 'string') {
    return missingCapability(path, 'setTokenProp effect', source, ['{ setTokenProp: { token, prop, value } }']);
  }

  const bindingDiagnostics = validateBindingLikeString(source.token, scope, `${path}.token`);
  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...bindingDiagnostics, ...value.diagnostics];

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || value.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: { setTokenProp: { token: source.token, prop: source.prop, value: value.value } },
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
    return missingCapability(path, 'forEach effect', source, ['{ forEach: { bind, over, effects, limit?, countBind?, in? } }']);
  }

  const condCtx = makeConditionContext(context, scope);
  const over = lowerQueryNode(source.over, condCtx, `${path}.over`);
  const diagnostics = [...over.diagnostics];

  let loweredLimit: ValueExpr | undefined;
  if (source.limit !== undefined) {
    const limitResult = lowerValueNode(source.limit, condCtx, `${path}.limit`);
    diagnostics.push(...limitResult.diagnostics);
    if (limitResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredLimit = limitResult.value;
  }

  diagnostics.push(...scope.shadowWarning(source.bind, `${path}.bind`));
  const loweredEffects = scope.withBinding(source.bind, () =>
    lowerNestedEffects(source.effects as readonly unknown[], context, scope, `${path}.effects`),
  );
  diagnostics.push(...loweredEffects.diagnostics);

  const countBind = typeof source.countBind === 'string' ? source.countBind : undefined;
  let loweredIn: readonly EffectAST[] | undefined;
  if (countBind !== undefined && Array.isArray(source.in)) {
    diagnostics.push(...scope.shadowWarning(countBind, `${path}.countBind`));
    const inResult = scope.withBinding(countBind, () =>
      lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`),
    );
    diagnostics.push(...inResult.diagnostics);
    if (inResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredIn = inResult.value;
  }

  if (over.value === null || loweredEffects.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      forEach: {
        bind: source.bind,
        over: over.value,
        effects: loweredEffects.value,
        ...(loweredLimit !== undefined ? { limit: loweredLimit } : {}),
        ...(countBind !== undefined ? { countBind } : {}),
        ...(loweredIn !== undefined ? { in: loweredIn } : {}),
      },
    },
    diagnostics,
  };
}

function lowerRemoveByPriorityEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!Array.isArray(source.groups)) {
    return missingCapability(path, 'removeByPriority effect', source, [
      '{ removeByPriority: { budget, groups: [{ bind, over, to, from?, countBind? }...], remainingBind?, in? } }',
    ]);
  }

  const budgetResult = lowerValueNode(source.budget, makeConditionContext(context, scope), `${path}.budget`);
  const diagnostics: Diagnostic[] = [...budgetResult.diagnostics];
  const loweredGroups: Array<{
    bind: string;
    over: NonNullable<ReturnType<typeof lowerQueryNode>['value']>;
    to: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    from?: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    countBind?: string;
  }> = [];

  source.groups.forEach((entry, index) => {
    const groupPath = `${path}.groups.${index}`;
    if (!isRecord(entry) || typeof entry.bind !== 'string') {
      diagnostics.push({
        code: 'CNL_COMPILER_MISSING_CAPABILITY',
        path: groupPath,
        severity: 'error',
        message:
          'Cannot lower removeByPriority group to kernel AST: expected { bind, over, to, from?, countBind? }.',
        suggestion: 'Define each group with bind, over query, and destination zone selector.',
      });
      return;
    }

    diagnostics.push(...scope.shadowWarning(entry.bind, `${groupPath}.bind`));
    const condCtx = makeConditionContext(context, scope);
    const over = lowerQueryNode(entry.over, condCtx, `${groupPath}.over`);
    diagnostics.push(...over.diagnostics);

    const toResult = scope.withBinding(entry.bind, () => lowerZoneSelector(entry.to, context, scope, `${groupPath}.to`));
    diagnostics.push(...toResult.diagnostics);

    let fromResult: EffectLoweringResult<ZoneRef> | undefined;
    if (entry.from !== undefined) {
      fromResult = scope.withBinding(entry.bind, () => lowerZoneSelector(entry.from, context, scope, `${groupPath}.from`));
      diagnostics.push(...fromResult.diagnostics);
    }

    const countBind = typeof entry.countBind === 'string' ? entry.countBind : undefined;
    if (over.value === null || toResult.value === null || fromResult?.value === null) {
      return;
    }

    loweredGroups.push({
      bind: entry.bind,
      over: over.value,
      to: toResult.value,
      ...(fromResult?.value === undefined ? {} : { from: fromResult.value }),
      ...(countBind === undefined ? {} : { countBind }),
    });
  });

  const remainingBind = typeof source.remainingBind === 'string' ? source.remainingBind : undefined;
  if (remainingBind !== undefined) {
    diagnostics.push(...scope.shadowWarning(remainingBind, `${path}.remainingBind`));
  }

  let loweredIn: readonly EffectAST[] | undefined;
  if (Array.isArray(source.in)) {
    const inCallback = (): EffectLoweringResult<readonly EffectAST[]> => {
      const countBinds = loweredGroups.flatMap((group) => (group.countBind === undefined ? [] : [group.countBind]));

      const withCountBindings = (offset: number): EffectLoweringResult<readonly EffectAST[]> => {
        if (offset >= countBinds.length) {
          return lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`);
        }
        const bind = countBinds[offset]!;
        return scope.withBinding(bind, () => withCountBindings(offset + 1));
      };

      if (remainingBind !== undefined) {
        return scope.withBinding(remainingBind, () => withCountBindings(0));
      }
      return withCountBindings(0);
    };

    const inResult = inCallback();
    diagnostics.push(...inResult.diagnostics);
    if (inResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredIn = inResult.value;
  }

  if (budgetResult.value === null || diagnostics.some((d) => d.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      removeByPriority: {
        budget: budgetResult.value,
        groups: loweredGroups,
        ...(remainingBind === undefined ? {} : { remainingBind }),
        ...(loweredIn === undefined ? {} : { in: loweredIn }),
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

function lowerRollRandomEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.in)) {
    return missingCapability(path, 'rollRandom effect', source, ['{ rollRandom: { bind, min, max, in } }']);
  }

  const condCtx = makeConditionContext(context, scope);
  const minResult = lowerValueNode(source.min, condCtx, `${path}.min`);
  const maxResult = lowerValueNode(source.max, condCtx, `${path}.max`);
  const diagnostics = [...minResult.diagnostics, ...maxResult.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  const inEffects = scope.withBinding(source.bind, () => lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`));
  diagnostics.push(...inEffects.diagnostics);

  if (minResult.value === null || maxResult.value === null || inEffects.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      rollRandom: {
        bind: source.bind,
        min: minResult.value,
        max: maxResult.value,
        in: inEffects.value,
      },
    },
    diagnostics,
  };
}

function lowerSetMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'setMarker effect', source, ['{ setMarker: { space, marker, state } }']);
  }

  const space = lowerZoneSelector(source.space, context, scope, `${path}.space`);
  const stateResult = lowerValueNode(source.state, makeConditionContext(context, scope), `${path}.state`);
  const diagnostics = [...space.diagnostics, ...stateResult.diagnostics];

  if (space.value === null || stateResult.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setMarker: {
        space: space.value,
        marker: source.marker,
        state: stateResult.value,
      },
    },
    diagnostics,
  };
}

function lowerShiftMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftMarker effect', source, ['{ shiftMarker: { space, marker, delta } }']);
  }

  const space = lowerZoneSelector(source.space, context, scope, `${path}.space`);
  const delta = lowerValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...space.diagnostics, ...delta.diagnostics];

  if (space.value === null || delta.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      shiftMarker: {
        space: space.value,
        marker: source.marker,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerSetGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'setGlobalMarker effect', source, ['{ setGlobalMarker: { marker, state } }']);
  }

  const state = lowerValueNode(source.state, makeConditionContext(context, scope), `${path}.state`);
  const diagnostics = [...state.diagnostics];
  if (state.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setGlobalMarker: {
        marker: source.marker,
        state: state.value,
      },
    },
    diagnostics,
  };
}

function lowerFlipGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const marker = lowerValueNode(source.marker, makeConditionContext(context, scope), `${path}.marker`);
  const stateA = lowerValueNode(source.stateA, makeConditionContext(context, scope), `${path}.stateA`);
  const stateB = lowerValueNode(source.stateB, makeConditionContext(context, scope), `${path}.stateB`);
  const diagnostics = [...marker.diagnostics, ...stateA.diagnostics, ...stateB.diagnostics];

  if (marker.value === null || stateA.value === null || stateB.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      flipGlobalMarker: {
        marker: marker.value,
        stateA: stateA.value,
        stateB: stateB.value,
      },
    },
    diagnostics,
  };
}

function lowerShiftGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftGlobalMarker effect', source, ['{ shiftGlobalMarker: { marker, delta } }']);
  }

  const delta = lowerValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...delta.diagnostics];
  if (delta.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      shiftGlobalMarker: {
        marker: source.marker,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerGrantFreeOperationEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.faction !== 'string') {
    return missingCapability(path, 'grantFreeOperation effect', source, [
      '{ grantFreeOperation: { faction, operationClass, actionIds?, executeAsFaction?, zoneFilter?, uses?, id?, sequence? } }',
    ]);
  }
  if (
    source.operationClass !== 'pass' &&
    source.operationClass !== 'event' &&
    source.operationClass !== 'operation' &&
    source.operationClass !== 'limitedOperation' &&
    source.operationClass !== 'operationPlusSpecialActivity'
  ) {
    return missingCapability(`${path}.operationClass`, 'grantFreeOperation operationClass', source.operationClass, [
      'pass',
      'event',
      'operation',
      'limitedOperation',
      'operationPlusSpecialActivity',
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  let effectId: string | undefined;
  if (source.id !== undefined && typeof source.id !== 'string') {
    diagnostics.push(...missingCapability(`${path}.id`, 'grantFreeOperation id', source.id, ['string']).diagnostics);
  } else if (typeof source.id === 'string') {
    effectId = source.id;
  }
  let executeAsFaction: string | undefined;
  if (source.executeAsFaction !== undefined && typeof source.executeAsFaction !== 'string') {
    diagnostics.push(
      ...missingCapability(`${path}.executeAsFaction`, 'grantFreeOperation executeAsFaction', source.executeAsFaction, ['string'])
        .diagnostics,
    );
  } else if (typeof source.executeAsFaction === 'string') {
    executeAsFaction = source.executeAsFaction;
  }
  let actionIds: string[] | undefined;
  if (source.actionIds !== undefined && (!Array.isArray(source.actionIds) || source.actionIds.some((entry) => typeof entry !== 'string'))) {
    diagnostics.push(...missingCapability(`${path}.actionIds`, 'grantFreeOperation actionIds', source.actionIds, ['string[]']).diagnostics);
  } else if (Array.isArray(source.actionIds)) {
    actionIds = [...source.actionIds] as string[];
  }
  let uses: number | undefined;
  if (
    source.uses !== undefined &&
    (!isInteger(source.uses) || source.uses <= 0)
  ) {
    diagnostics.push(
      ...missingCapability(`${path}.uses`, 'grantFreeOperation uses', source.uses, ['positive integer']).diagnostics,
    );
  } else if (isInteger(source.uses) && source.uses > 0) {
    uses = source.uses;
  }

  let loweredZoneFilter: ConditionAST | undefined;
  if (source.zoneFilter !== undefined) {
    const lowered = lowerConditionNode(source.zoneFilter, makeConditionContext(context, scope), `${path}.zoneFilter`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value === null) {
      return { value: null, diagnostics };
    }
    loweredZoneFilter = lowered.value;
  }

  let loweredSequence: { readonly chain: string; readonly step: number } | undefined;
  if (source.sequence !== undefined) {
    if (!isRecord(source.sequence) || typeof source.sequence.chain !== 'string' || !isInteger(source.sequence.step) || source.sequence.step < 0) {
      diagnostics.push(
        ...missingCapability(`${path}.sequence`, 'grantFreeOperation sequence', source.sequence, [
          '{ chain: string, step: non-negative integer }',
        ]).diagnostics,
      );
    } else {
      loweredSequence = {
        chain: source.sequence.chain,
        step: source.sequence.step,
      };
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      grantFreeOperation: {
        faction: source.faction,
        operationClass: source.operationClass,
        ...(effectId === undefined ? {} : { id: effectId }),
        ...(executeAsFaction === undefined ? {} : { executeAsFaction }),
        ...(actionIds === undefined ? {} : { actionIds }),
        ...(loweredZoneFilter === undefined ? {} : { zoneFilter: loweredZoneFilter }),
        ...(uses === undefined ? {} : { uses }),
        ...(loweredSequence === undefined ? {} : { sequence: loweredSequence }),
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
        internalDecisionId: toInternalDecisionId(path),
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
    return missingCapability(path, 'chooseN effect', source, [
      '{ chooseN: { bind, options, n } }',
      '{ chooseN: { bind, options, max, min? } }',
    ]);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const condCtx = makeConditionContext(context, scope);
  const diagnostics = [...options.diagnostics];

  const hasN = source.n !== undefined;
  const hasMin = source.min !== undefined;
  const hasMax = source.max !== undefined;

  if (hasN && (hasMin || hasMax)) {
    diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
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

  let loweredMin: ValueExpr | undefined;
  let loweredMax: ValueExpr | undefined;

  if (hasN && (!isInteger(source.n) || source.n < 0)) {
    diagnostics.push(...missingCapability(`${path}.n`, 'chooseN n', source.n, ['non-negative integer']).diagnostics);
  }
  if (hasMax) {
    const maxResult = lowerValueNode(source.max, condCtx, `${path}.max`);
    diagnostics.push(...maxResult.diagnostics);
    if (maxResult.value !== null) {
      loweredMax = maxResult.value;
      if (typeof loweredMax === 'number' && (!isInteger(loweredMax) || loweredMax < 0)) {
        diagnostics.push(...missingCapability(`${path}.max`, 'chooseN max', source.max, ['non-negative integer']).diagnostics);
      }
    }
  }
  if (hasMin) {
    const minResult = lowerValueNode(source.min, condCtx, `${path}.min`);
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
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path,
      severity: 'error',
      message: 'chooseN min cannot exceed max.',
      suggestion: 'Set chooseN.min <= chooseN.max.',
    });
  }

  if (options.value === null || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  const cardinality =
    hasN && isInteger(source.n)
      ? { n: source.n }
      : {
          max: loweredMax as ValueExpr,
          ...(loweredMin === undefined ? {} : { min: loweredMin }),
        };
  return {
    value: {
      chooseN: {
        internalDecisionId: toInternalDecisionId(path),
        bind: source.bind,
        options: options.value,
        ...cardinality,
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
      registerSequentialBinding(lowered.value, scope);
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
): EffectLoweringResult<ZoneRef> {
  if (typeof source === 'string') {
    const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path);
    if (zone.value === null) {
      return { value: null, diagnostics: zone.diagnostics };
    }

    const diagnostics = validateZoneQualifierBinding(zone.value, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return { value: zone.value, diagnostics };
  }

  if (!isRecord(source)) {
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

  if (!('zoneExpr' in source)) {
    return {
      value: null,
      diagnostics: [
        {
          code: 'CNL_COMPILER_ZONE_SELECTOR_INVALID',
          path,
          severity: 'error',
          message: 'Dynamic zone selectors must use explicit { zoneExpr: <ValueExpr> }.',
          suggestion: 'Wrap dynamic zone selectors in { zoneExpr: ... }.',
        },
      ],
    };
  }

  const valueResult = lowerValueNode(source.zoneExpr, makeConditionContext(context, scope), `${path}.zoneExpr`);
  if (valueResult.value === null) {
    return { value: null, diagnostics: valueResult.diagnostics };
  }
  return { value: { zoneExpr: valueResult.value }, diagnostics: valueResult.diagnostics };
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
    ...(context.tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary: context.tokenTraitVocabulary }),
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

  /** Permanently add a binding to the top frame (for sequential effects). */
  register(name: string): void {
    const top = this.frames[this.frames.length - 1];
    if (top !== undefined) {
      top.push(name);
    }
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

/**
 * After a choice/random effect is lowered, register its `bind` name in the
 * scope so subsequent effects in the same array can reference it.
 */
function registerSequentialBinding(effect: EffectAST, scope: BindingScope): void {
  const bindings = collectSequentialBindings(effect);
  for (const binding of bindings) {
    scope.register(binding);
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
