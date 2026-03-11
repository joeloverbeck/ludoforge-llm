import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, NumericValueExpr } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  lowerConditionNode,
  lowerNumericValueNode,
  lowerQueryNode,
  lowerValueNode,
} from './compile-conditions.js';
import { collectSequentialBindings } from './binder-surface-registry.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import { EFFECT_QUERY_DOMAIN_CONTRACTS } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import {
  conditionFingerprint,
  isRecord,
  lowerNestedEffects,
  lowerZoneSelector,
  makeConditionContext,
  missingCapability,
  readMacroOrigin,
  validateQueryDomainContract,
} from './compile-effects-utils.js';

export function lowerIfEffect(
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
  const conditionKey = when.value === null ? null : conditionFingerprint(when.value);
  const guardedThenBindings = conditionKey === null ? [] : scope.guardedBindingsFor(conditionKey);
  const baseBindings = new Set(scope.visibleBindings());
  const effectiveBaseBindings = new Set([...baseBindings, ...guardedThenBindings]);

  const thenScope = scope.clone();
  for (const binding of guardedThenBindings) {
    thenScope.register(binding);
  }
  const thenEffects = lowerNestedEffects(source.then as readonly unknown[], context, thenScope, `${path}.then`);
  const thenBindings = new Set(thenScope.visibleBindings());

  const elseScope = scope.clone();
  const elseEffects =
    source.else === undefined
      ? ({ value: undefined, diagnostics: [] as readonly Diagnostic[] } as const)
      : lowerNestedEffects(source.else as readonly unknown[], context, elseScope, `${path}.else`);
  const elseBindings = source.else === undefined ? baseBindings : new Set(elseScope.visibleBindings());

  const diagnostics = [...when.diagnostics, ...thenEffects.diagnostics, ...elseEffects.diagnostics];
  if (when.value === null || thenEffects.value === null || elseEffects.value === null) {
    return { value: null, diagnostics };
  }

  const guaranteedPostIfBindings = [...thenBindings]
    .filter((binding) => elseBindings.has(binding) && !effectiveBaseBindings.has(binding))
    .sort((left, right) => left.localeCompare(right));
  for (const binding of guaranteedPostIfBindings) {
    scope.register(binding);
  }

  if (conditionKey !== null) {
    const conditionallyAvailableBindings = [...thenBindings]
      .filter((binding) => !elseBindings.has(binding) && !effectiveBaseBindings.has(binding))
      .sort((left, right) => left.localeCompare(right));
    for (const binding of conditionallyAvailableBindings) {
      scope.registerGuarded(conditionKey, binding);
    }
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

export function lowerForEachEffect(
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
  if (over.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        over.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.forEachOver,
        `${path}.over`,
      ),
    );
  }

  let loweredLimit: NumericValueExpr | undefined;
  if (source.limit !== undefined) {
    const limitResult = lowerNumericValueNode(source.limit, condCtx, `${path}.limit`);
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
  const macroOrigin = readMacroOrigin(source.macroOrigin, source, `${path}.macroOrigin`);
  diagnostics.push(...macroOrigin.diagnostics);
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

  if (
    over.value === null
    || loweredEffects.value === null
    || macroOrigin.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      forEach: {
        bind: source.bind,
        ...(macroOrigin.value === undefined ? {} : { macroOrigin: macroOrigin.value }),
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

export function lowerReduceEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (
    typeof source.itemBind !== 'string'
    || typeof source.accBind !== 'string'
    || typeof source.resultBind !== 'string'
    || !Array.isArray(source.in)
  ) {
    return missingCapability(path, 'reduce effect', source, [
      '{ reduce: { itemBind, accBind, over, initial, next, limit?, resultBind, in } }',
    ]);
  }
  const itemBind = source.itemBind;
  const accBind = source.accBind;
  const resultBind = source.resultBind;

  if (Object.prototype.hasOwnProperty.call(source, 'macroOrigin')) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED,
        path: `${path}.macroOrigin`,
        severity: 'error',
        message: 'reduce.macroOrigin has been removed and is no longer accepted.',
        suggestion: 'Remove reduce.macroOrigin from authored YAML; compiler emits item/acc/result binder provenance fields.',
      }],
    };
  }

  const itemMacroOrigin = readMacroOrigin(source.itemMacroOrigin, source, `${path}.itemMacroOrigin`);
  const accMacroOrigin = readMacroOrigin(source.accMacroOrigin, source, `${path}.accMacroOrigin`);
  const resultMacroOrigin = readMacroOrigin(source.resultMacroOrigin, source, `${path}.resultMacroOrigin`);

  const duplicateBindings = new Set<string>();
  if (itemBind === accBind) {
    duplicateBindings.add(itemBind);
  }
  if (itemBind === resultBind) {
    duplicateBindings.add(itemBind);
  }
  if (accBind === resultBind) {
    duplicateBindings.add(accBind);
  }
  if (duplicateBindings.size > 0) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: 'reduce binders itemBind, accBind, and resultBind must be distinct.',
        suggestion: 'Rename reduce binders so each role uses a unique binding identifier.',
      }],
    };
  }

  const condCtx = makeConditionContext(context, scope);
  const over = lowerQueryNode(source.over, condCtx, `${path}.over`);
  const initial = lowerValueNode(source.initial, condCtx, `${path}.initial`);
  const diagnostics = [
    ...itemMacroOrigin.diagnostics,
    ...accMacroOrigin.diagnostics,
    ...resultMacroOrigin.diagnostics,
    ...over.diagnostics,
    ...initial.diagnostics,
    ...scope.shadowWarning(itemBind, `${path}.itemBind`),
    ...scope.shadowWarning(accBind, `${path}.accBind`),
    ...scope.shadowWarning(resultBind, `${path}.resultBind`),
  ];
  if (over.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        over.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.reduceOver,
        `${path}.over`,
      ),
    );
  }

  let loweredLimit: NumericValueExpr | undefined;
  if (source.limit !== undefined) {
    const limitResult = lowerNumericValueNode(source.limit, condCtx, `${path}.limit`);
    diagnostics.push(...limitResult.diagnostics);
    if (limitResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredLimit = limitResult.value;
  }

  const next = scope.withBinding(itemBind, () =>
    scope.withBinding(accBind, () =>
      lowerValueNode(source.next, makeConditionContext(context, scope), `${path}.next`),
    ),
  );
  diagnostics.push(...next.diagnostics);

  const loweredIn = scope.withBinding(resultBind, () =>
    lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`),
  );
  diagnostics.push(...loweredIn.diagnostics);

  if (
    over.value === null
    || initial.value === null
    || next.value === null
    || loweredIn.value === null
    || itemMacroOrigin.value === null
    || accMacroOrigin.value === null
    || resultMacroOrigin.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      reduce: {
        itemBind,
        accBind,
        ...(itemMacroOrigin.value === undefined ? {} : { itemMacroOrigin: itemMacroOrigin.value }),
        ...(accMacroOrigin.value === undefined ? {} : { accMacroOrigin: accMacroOrigin.value }),
        over: over.value,
        initial: initial.value,
        next: next.value,
        ...(loweredLimit === undefined ? {} : { limit: loweredLimit }),
        resultBind,
        ...(resultMacroOrigin.value === undefined ? {} : { resultMacroOrigin: resultMacroOrigin.value }),
        in: loweredIn.value,
      },
    },
    diagnostics,
  };
}

export function lowerRemoveByPriorityEffect(
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

  const budgetResult = lowerNumericValueNode(source.budget, makeConditionContext(context, scope), `${path}.budget`);
  const diagnostics: Diagnostic[] = [...budgetResult.diagnostics];
  const macroOrigin = readMacroOrigin(source.macroOrigin, source, `${path}.macroOrigin`);
  diagnostics.push(...macroOrigin.diagnostics);

  const loweredGroups: Array<{
    bind: string;
    over: NonNullable<ReturnType<typeof lowerQueryNode>['value']>;
    to: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    from?: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    countBind?: string;
    macroOrigin?: import('../kernel/types.js').MacroOrigin;
  }> = [];

  source.groups.forEach((entry: unknown, index: number) => {
    const groupPath = `${path}.groups.${index}`;
    if (!isRecord(entry) || typeof entry.bind !== 'string') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
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

    let fromResult: EffectLoweringResult<import('../kernel/types.js').ZoneRef> | undefined;
    if (entry.from !== undefined) {
      fromResult = scope.withBinding(entry.bind, () => lowerZoneSelector(entry.from, context, scope, `${groupPath}.from`));
      diagnostics.push(...fromResult.diagnostics);
    }

    const countBind = typeof entry.countBind === 'string' ? entry.countBind : undefined;
    const groupMacroOrigin = readMacroOrigin(entry.macroOrigin, entry, `${groupPath}.macroOrigin`);
    diagnostics.push(...groupMacroOrigin.diagnostics);
    if (over.value === null || toResult.value === null || fromResult?.value === null || groupMacroOrigin.value === null) {
      return;
    }

    loweredGroups.push({
      bind: entry.bind,
      over: over.value,
      to: toResult.value,
      ...(fromResult?.value === undefined ? {} : { from: fromResult.value }),
      ...(countBind === undefined ? {} : { countBind }),
      ...(groupMacroOrigin.value === undefined ? {} : { macroOrigin: groupMacroOrigin.value }),
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

  if (budgetResult.value === null || macroOrigin.value === null || diagnostics.some((d) => d.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      removeByPriority: {
        budget: budgetResult.value,
        groups: loweredGroups,
        ...(remainingBind === undefined ? {} : { remainingBind }),
        ...(loweredIn === undefined ? {} : { in: loweredIn }),
        ...(macroOrigin.value === undefined ? {} : { macroOrigin: macroOrigin.value }),
      },
    },
    diagnostics,
  };
}

export function lowerLetEffect(
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

export function lowerBindValueEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'bindValue effect', source, ['{ bindValue: { bind, value } }']);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  if (value.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      bindValue: {
        bind: source.bind,
        value: value.value,
      },
    },
    diagnostics,
  };
}

export function lowerEvaluateSubsetEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (
    typeof source.subsetBind !== 'string'
    || typeof source.resultBind !== 'string'
    || !Array.isArray(source.compute)
    || !Array.isArray(source.in)
  ) {
    return missingCapability(path, 'evaluateSubset effect', source, [
      '{ evaluateSubset: { source, subsetSize, subsetBind, compute, scoreExpr, resultBind, bestSubsetBind?, in } }',
    ]);
  }
  const condCtx = makeConditionContext(context, scope);
  const loweredSource = lowerQueryNode(source.source, condCtx, `${path}.source`);
  const loweredSubsetSize = lowerNumericValueNode(source.subsetSize, condCtx, `${path}.subsetSize`);
  const diagnostics: Diagnostic[] = [
    ...loweredSource.diagnostics,
    ...loweredSubsetSize.diagnostics,
    ...scope.shadowWarning(source.subsetBind, `${path}.subsetBind`),
    ...scope.shadowWarning(source.resultBind, `${path}.resultBind`),
  ];
  if (loweredSource.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        loweredSource.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.evaluateSubsetSource,
        `${path}.source`,
      ),
    );
  }

  const bestSubsetBind = typeof source.bestSubsetBind === 'string' ? source.bestSubsetBind : undefined;
  if (source.bestSubsetBind !== undefined && typeof source.bestSubsetBind !== 'string') {
    diagnostics.push(...missingCapability(`${path}.bestSubsetBind`, 'evaluateSubset bestSubsetBind', source.bestSubsetBind, ['string']).diagnostics);
  }
  if (bestSubsetBind !== undefined) {
    diagnostics.push(...scope.shadowWarning(bestSubsetBind, `${path}.bestSubsetBind`));
  }

  const computeAndScore = scope.withBinding(source.subsetBind, () => {
    const loweredCompute = lowerNestedEffects(source.compute as readonly unknown[], context, scope, `${path}.compute`);
    const scoreLowering = (): EffectLoweringResult<NumericValueExpr> =>
      lowerNumericValueNode(source.scoreExpr, makeConditionContext(context, scope), `${path}.scoreExpr`);
    const loweredScoreExpr =
      loweredCompute.value === null
        ? scoreLowering()
        : scope.withBindings(
            loweredCompute.value.flatMap((effect) => collectSequentialBindings(effect)),
            scoreLowering,
          );

    return {
      loweredCompute,
      loweredScoreExpr,
    };
  });
  diagnostics.push(...computeAndScore.loweredCompute.diagnostics, ...computeAndScore.loweredScoreExpr.diagnostics);

  const loweredIn = scope.withBinding(source.resultBind, () => (
    bestSubsetBind === undefined
      ? lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`)
      : scope.withBinding(bestSubsetBind, () =>
        lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`))
  ));
  diagnostics.push(...loweredIn.diagnostics);

  if (
    loweredSource.value === null
    || loweredSubsetSize.value === null
    || computeAndScore.loweredCompute.value === null
    || computeAndScore.loweredScoreExpr.value === null
    || loweredIn.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      evaluateSubset: {
        source: loweredSource.value,
        subsetSize: loweredSubsetSize.value,
        subsetBind: source.subsetBind,
        compute: computeAndScore.loweredCompute.value,
        scoreExpr: computeAndScore.loweredScoreExpr.value,
        resultBind: source.resultBind,
        ...(bestSubsetBind === undefined ? {} : { bestSubsetBind }),
        in: loweredIn.value,
      },
    },
    diagnostics,
  };
}

export function lowerRollRandomEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.in)) {
    return missingCapability(path, 'rollRandom effect', source, ['{ rollRandom: { bind, min, max, in } }']);
  }

  const condCtx = makeConditionContext(context, scope);
  const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
  const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
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

export function lowerSetMarkerEffect(
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

export function lowerShiftMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftMarker effect', source, ['{ shiftMarker: { space, marker, delta } }']);
  }

  const space = lowerZoneSelector(source.space, context, scope, `${path}.space`);
  const delta = lowerNumericValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
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

export function lowerSetGlobalMarkerEffect(
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

export function lowerFlipGlobalMarkerEffect(
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

export function lowerShiftGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftGlobalMarker effect', source, ['{ shiftGlobalMarker: { marker, delta } }']);
  }

  const delta = lowerNumericValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
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

export function lowerGotoPhaseExactEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.phase !== 'string') {
    return missingCapability(path, 'gotoPhaseExact effect', source, ['{ gotoPhaseExact: { phase: string } }']);
  }

  return {
    value: {
      gotoPhaseExact: {
        phase: source.phase,
      },
    },
    diagnostics: [],
  };
}

export function lowerAdvancePhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (Object.keys(source).length !== 0) {
    return missingCapability(path, 'advancePhase effect', source, ['{ advancePhase: {} }']);
  }

  return {
    value: {
      advancePhase: {},
    },
    diagnostics: [],
  };
}

export function lowerPushInterruptPhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.phase !== 'string' || typeof source.resumePhase !== 'string') {
    return missingCapability(path, 'pushInterruptPhase effect', source, [
      '{ pushInterruptPhase: { phase: string, resumePhase: string } }',
    ]);
  }

  return {
    value: {
      pushInterruptPhase: {
        phase: source.phase,
        resumePhase: source.resumePhase,
      },
    },
    diagnostics: [],
  };
}

export function lowerPopInterruptPhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (Object.keys(source).length !== 0) {
    return missingCapability(path, 'popInterruptPhase effect', source, ['{ popInterruptPhase: {} }']);
  }

  return {
    value: {
      popInterruptPhase: {},
    },
    diagnostics: [],
  };
}
