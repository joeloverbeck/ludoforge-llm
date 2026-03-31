import type { Diagnostic } from '../kernel/diagnostics.js';
import { hasBindingIdentifier, rankBindingIdentifierAlternatives } from '../contracts/index.js';
import type {
  CompiledCardMetadataEntry,
  CompiledCardMetadataIndex,
  EventCardDef,
  EventDeckDef,
  EventEligibilityOverrideDef,
  EventFreeOperationGrantDef,
  EventTargetDef,
} from '../kernel/types.js';
import { lowerConditionNode, lowerQueryNode } from './compile-conditions.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  lowerEffectArray,
  lowerFreeOperationExecutionContextNode,
  lowerFreeOperationTokenInterpretationsNode,
} from './compile-effects.js';
import {
  buildConditionLoweringContext,
  buildEffectLoweringContext,
  type ConditionLoweringSharedContext,
  type EffectLoweringSharedContext,
  missingCapabilityDiagnostic,
} from './compile-lowering.js';
import { normalizeIdentifier } from './identifier-utils.js';

export function lowerEventCards(
  cards: readonly EventCardDef[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: EffectLoweringSharedContext,
): readonly EventCardDef[] {
  const conditionContext: ConditionLoweringSharedContext = context;
  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();

  const lowered = cards.map((card, index) => {
    const cardPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(card.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_EVENT_CARD_ID_DUPLICATE,
        path: `${cardPath}.id`,
        severity: 'error',
        message: `Duplicate event card id "${card.id}".`,
        suggestion: 'Use unique event card ids inside one event deck.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (card.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(card.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_EVENT_CARD_ORDER_AMBIGUOUS,
          path: `${cardPath}.order`,
          severity: 'error',
          message: `Event card order ${card.order} is declared more than once in the same event deck.`,
          suggestion: 'Use unique order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(card.order, index);
      }
    }

    const playCondition =
      card.playCondition === undefined
        ? undefined
        : lowerConditionNode(
            card.playCondition,
            buildConditionLoweringContext(conditionContext),
            `${cardPath}.playCondition`,
          );
    if (playCondition !== undefined) {
      diagnostics.push(...playCondition.diagnostics);
    }

    const unshaded =
      card.unshaded === undefined
        ? undefined
        : lowerEventCardSide(
            card.unshaded,
            diagnostics,
            `${cardPath}.unshaded`,
            context,
          );
    const shaded =
      card.shaded === undefined
        ? undefined
        : lowerEventCardSide(
            card.shaded,
            diagnostics,
            `${cardPath}.shaded`,
            context,
          );

    return {
      index,
      card: {
        ...card,
        ...(playCondition === undefined || playCondition.value === null ? {} : { playCondition: playCondition.value }),
        ...(unshaded === undefined ? {} : { unshaded }),
        ...(shaded === undefined ? {} : { shaded }),
      },
    };
  });

  lowered.sort((left, right) => {
    const leftOrder = left.card.order;
    const rightOrder = right.card.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.card.id).localeCompare(normalizeIdentifier(right.card.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return lowered.map((entry) => entry.card);
}

export function lowerEventDecks(
  decks: readonly EventDeckDef[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: EffectLoweringSharedContext,
): readonly EventDeckDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const lowered = decks.map((deck, index) => {
    const deckPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(deck.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_EVENT_DECK_ID_DUPLICATE,
        path: `${deckPath}.id`,
        severity: 'error',
        message: `Duplicate event deck id "${deck.id}".`,
        suggestion: 'Use unique event deck ids within eventDecks.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    return {
      index,
      deck: {
        ...deck,
        cards: lowerEventCards(
          deck.cards,
          diagnostics,
          `${deckPath}.cards`,
          context,
        ),
      },
    };
  });

  lowered.sort((left, right) => {
    const byId = normalizeIdentifier(left.deck.id).localeCompare(normalizeIdentifier(right.deck.id));
    if (byId !== 0) {
      return byId;
    }
    return left.index - right.index;
  });

  return lowered.map((entry) => entry.deck);
}

export function lowerEventCardSide(
  side: NonNullable<EventCardDef['unshaded']>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: EffectLoweringSharedContext,
): NonNullable<EventCardDef['unshaded']> {
  const loweredTargets = lowerEventTargets(
    side.targets,
    diagnostics,
    `${pathPrefix}.targets`,
    context,
  );
  const sideBindingScope = collectBindingScopeFromTargets(loweredTargets);

  const loweredEffects = lowerOptionalEffects(
    side.effects,
    diagnostics,
    `${pathPrefix}.effects`,
    context,
    sideBindingScope,
  );
  const loweredFreeOperationGrants = lowerEventFreeOperationGrants(
    side.freeOperationGrants,
    diagnostics,
    `${pathPrefix}.freeOperationGrants`,
    context,
  );
  const loweredEligibilityOverrides = lowerEventEligibilityOverrides(
    side.eligibilityOverrides,
    diagnostics,
    `${pathPrefix}.eligibilityOverrides`,
    context,
  );
  const loweredLastingEffects = lowerEventLastingEffects(
    side.lastingEffects,
    diagnostics,
    `${pathPrefix}.lastingEffects`,
    context,
    sideBindingScope,
  );

  if (side.branches === undefined) {
    return {
      ...side,
      ...(loweredTargets === undefined ? {} : { targets: loweredTargets }),
      ...(loweredFreeOperationGrants === undefined ? {} : { freeOperationGrants: loweredFreeOperationGrants }),
      ...(loweredEligibilityOverrides === undefined ? {} : { eligibilityOverrides: loweredEligibilityOverrides }),
      ...(loweredEffects === undefined ? {} : { effects: loweredEffects }),
      ...(loweredLastingEffects === undefined ? {} : { lastingEffects: loweredLastingEffects }),
    };
  }

  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();
  const loweredBranches = side.branches.map((branch, index) => {
    const branchPath = `${pathPrefix}.branches.${index}`;
    const normalizedId = normalizeIdentifier(branch.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_EVENT_CARD_BRANCH_ID_DUPLICATE,
        path: `${branchPath}.id`,
        severity: 'error',
        message: `Duplicate event card branch id "${branch.id}" within one side.`,
        suggestion: 'Use unique branch ids inside each event card side.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (branch.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(branch.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_EVENT_CARD_BRANCH_ORDER_AMBIGUOUS,
          path: `${branchPath}.order`,
          severity: 'error',
          message: `Event card branch order ${branch.order} is declared more than once within one side.`,
          suggestion: 'Use unique branch order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(branch.order, index);
      }
    }

    const loweredBranchTargets = lowerEventTargets(
      branch.targets,
      diagnostics,
      `${branchPath}.targets`,
      context,
      sideBindingScope,
    );
    const branchBindingScope = [...sideBindingScope, ...collectBindingScopeFromTargets(loweredBranchTargets)];
    const loweredBranchEffects = lowerOptionalEffects(
      branch.effects,
      diagnostics,
      `${branchPath}.effects`,
      context,
      branchBindingScope,
    );
    const loweredBranchFreeOperationGrants = lowerEventFreeOperationGrants(
      branch.freeOperationGrants,
      diagnostics,
      `${branchPath}.freeOperationGrants`,
      context,
    );
    const loweredBranchEligibilityOverrides = lowerEventEligibilityOverrides(
      branch.eligibilityOverrides,
      diagnostics,
      `${branchPath}.eligibilityOverrides`,
      context,
    );
    const loweredBranchLastingEffects = lowerEventLastingEffects(
      branch.lastingEffects,
      diagnostics,
      `${branchPath}.lastingEffects`,
      context,
      branchBindingScope,
    );

    return {
      index,
      branch: {
        ...branch,
        ...(loweredBranchTargets === undefined ? {} : { targets: loweredBranchTargets }),
        ...(loweredBranchFreeOperationGrants === undefined ? {} : { freeOperationGrants: loweredBranchFreeOperationGrants }),
        ...(loweredBranchEligibilityOverrides === undefined ? {} : { eligibilityOverrides: loweredBranchEligibilityOverrides }),
        ...(loweredBranchEffects === undefined ? {} : { effects: loweredBranchEffects }),
        ...(loweredBranchLastingEffects === undefined ? {} : { lastingEffects: loweredBranchLastingEffects }),
      },
    };
  });

  loweredBranches.sort((left, right) => {
    const leftOrder = left.branch.order;
    const rightOrder = right.branch.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.branch.id).localeCompare(normalizeIdentifier(right.branch.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return {
    ...side,
    ...(loweredTargets === undefined ? {} : { targets: loweredTargets }),
    ...(loweredFreeOperationGrants === undefined ? {} : { freeOperationGrants: loweredFreeOperationGrants }),
    ...(loweredEligibilityOverrides === undefined ? {} : { eligibilityOverrides: loweredEligibilityOverrides }),
    ...(loweredEffects === undefined ? {} : { effects: loweredEffects }),
    ...(loweredLastingEffects === undefined ? {} : { lastingEffects: loweredLastingEffects }),
    branches: loweredBranches.map((entry) => entry.branch),
  };
}

function lowerEventEligibilityOverrides(
  overrides: readonly EventEligibilityOverrideDef[] | undefined,
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: ConditionLoweringSharedContext,
): readonly EventEligibilityOverrideDef[] | undefined {
  if (overrides === undefined) {
    return undefined;
  }
  return overrides.map((override, index) => {
    const loweredWhen = override.when === undefined
      ? undefined
      : lowerConditionNode(
        override.when,
        buildConditionLoweringContext(context),
        `${pathPrefix}.${index}.when`,
      );
    diagnostics.push(...(loweredWhen?.diagnostics ?? []));
    return {
      ...override,
      target:
        override.target.kind === 'active'
          ? override.target
          : {
              ...override.target,
            },
      ...(loweredWhen?.value === undefined || loweredWhen.value === null ? {} : { when: loweredWhen.value }),
    };
  });
}

function lowerEventFreeOperationGrants(
  grants: readonly EventFreeOperationGrantDef[] | undefined,
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: ConditionLoweringSharedContext,
): readonly EventFreeOperationGrantDef[] | undefined {
  if (grants === undefined) {
    return undefined;
  }
  return grants.map((grant, index) => {
    const path = `${pathPrefix}.${index}`;
    const loweringContext = buildConditionLoweringContext(context);
    const loweredZoneFilter = grant.zoneFilter === undefined
      ? undefined
      : lowerConditionNode(
        grant.zoneFilter,
        loweringContext,
        `${path}.zoneFilter`,
      );
    const loweredExecutionContext = grant.executionContext === undefined
      ? undefined
      : lowerFreeOperationExecutionContextNode(
        grant.executionContext,
        loweringContext,
        `${path}.executionContext`,
      );
    const loweredTokenInterpretations = grant.tokenInterpretations === undefined
      ? undefined
      : lowerFreeOperationTokenInterpretationsNode(
        grant.tokenInterpretations,
        loweringContext,
        `${path}.tokenInterpretations`,
      );
    diagnostics.push(...(loweredZoneFilter?.diagnostics ?? []));
    diagnostics.push(...(loweredExecutionContext?.diagnostics ?? []));
    diagnostics.push(...(loweredTokenInterpretations?.diagnostics ?? []));
    if (
      loweredZoneFilter === undefined
      && loweredExecutionContext === undefined
      && loweredTokenInterpretations === undefined
    ) {
      return grant;
    }
    return {
      ...grant,
      ...(loweredZoneFilter === undefined || loweredZoneFilter.value === null ? {} : { zoneFilter: loweredZoneFilter.value }),
      ...(loweredExecutionContext === undefined || loweredExecutionContext.value === null
        ? {}
        : { executionContext: loweredExecutionContext.value }),
      ...(loweredTokenInterpretations === undefined || loweredTokenInterpretations.value === null
        ? {}
        : { tokenInterpretations: loweredTokenInterpretations.value }),
    };
  });
}

function lowerEventTargets(
  targets: NonNullable<EventCardDef['unshaded']>['targets'],
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: EffectLoweringSharedContext,
  bindingScope?: readonly string[],
): NonNullable<EventCardDef['unshaded']>['targets'] {
  if (targets === undefined) {
    return undefined;
  }

  const loweredTargets: EventTargetDef[] = [];
  const accumulatedTargetBindings: string[] = [];
  for (const [index, target] of targets.entries()) {
    const targetPath = `${pathPrefix}.${index}`;
    if (typeof target.id !== 'string' || target.id.trim() === '') {
      diagnostics.push(
        missingCapabilityDiagnostic(
          `${targetPath}.id`,
          'event target id',
          target.id,
          ['non-empty string'],
        ),
      );
      loweredTargets.push(target);
      continue;
    }

    const bindingScopes = buildOrderedTargetBindingScopes(
      bindingScope,
      accumulatedTargetBindings,
      target.id,
    );
    const selector = lowerQueryNode(
      target.selector,
      buildConditionLoweringContext(context, bindingScopes.selector),
      `${targetPath}.selector`,
    );
    diagnostics.push(...selector.diagnostics);
    const selectorScopeDiagnostic = bindingQueryScopeDiagnostic(
      target.selector,
      bindingScopes.selector,
      `${targetPath}.selector`,
    );
    if (selectorScopeDiagnostic !== null) {
      diagnostics.push(selectorScopeDiagnostic);
    }
    const loweredEffects = lowerOptionalEffects(
      target.effects,
      diagnostics,
      `${targetPath}.effects`,
      context,
      bindingScopes.effects,
    );

    loweredTargets.push({
      ...target,
      ...(selector.value === null ? {} : { selector: selector.value }),
      ...(loweredEffects === undefined ? {} : { effects: loweredEffects }),
    });
    accumulatedTargetBindings.push(target.id);
  }
  return loweredTargets;
}

function buildOrderedTargetBindingScopes(
  outerScope: readonly string[] | undefined,
  priorTargetBindings: readonly string[],
  currentTargetId: string,
): {
  readonly selector: readonly string[];
  readonly effects: readonly string[];
} {
  const orderedScope = [
    ...(outerScope ?? []),
    ...priorTargetBindings,
  ];
  return {
    selector: orderedScope,
    effects: [...orderedScope, currentTargetId],
  };
}

function bindingQueryScopeDiagnostic(
  selector: unknown,
  bindingScope: readonly string[],
  path: string,
): Diagnostic | null {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) {
    return null;
  }

  const query = 'query' in selector ? selector.query : undefined;
  if (query !== 'binding') {
    return null;
  }
  const name = 'name' in selector ? selector.name : undefined;
  if (typeof name !== 'string' || hasBindingIdentifier(name, bindingScope)) {
    return null;
  }
  return {
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_UNBOUND,
    path: `${path}.name`,
    severity: 'error',
    message: `Unbound binding reference "${name}".`,
    suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
    alternatives: rankBindingIdentifierAlternatives(name, bindingScope),
  };
}

function lowerOptionalEffects(
  effects: NonNullable<EventCardDef['unshaded']>['effects'],
  diagnostics: Diagnostic[],
  path: string,
  context: EffectLoweringSharedContext,
  bindingScope: readonly string[],
): NonNullable<EventCardDef['unshaded']>['effects'] {
  if (effects === undefined) {
    return undefined;
  }

  const lowered = lowerEffectArray(
    effects as readonly unknown[],
    buildEffectLoweringContext(context, bindingScope),
    path,
  );
  diagnostics.push(...lowered.diagnostics);
  return lowered.value === null ? effects : lowered.value;
}

function lowerEventLastingEffects(
  lastingEffects: NonNullable<EventCardDef['unshaded']>['lastingEffects'],
  diagnostics: Diagnostic[],
  pathPrefix: string,
  context: EffectLoweringSharedContext,
  bindingScope: readonly string[],
): NonNullable<EventCardDef['unshaded']>['lastingEffects'] {
  if (lastingEffects === undefined) {
    return undefined;
  }

  return lastingEffects.map((lastingEffect, index) => {
    const path = `${pathPrefix}.${index}`;
    const setup = lowerEffectArray(
      lastingEffect.setupEffects as readonly unknown[],
      buildEffectLoweringContext(context, bindingScope),
      `${path}.setupEffects`,
    );
    diagnostics.push(...setup.diagnostics);

    const teardown =
      lastingEffect.teardownEffects === undefined
        ? undefined
        : lowerEffectArray(
            lastingEffect.teardownEffects as readonly unknown[],
            buildEffectLoweringContext(context, bindingScope),
            `${path}.teardownEffects`,
          );
    if (teardown !== undefined) {
      diagnostics.push(...teardown.diagnostics);
    }

    return {
      ...lastingEffect,
      setupEffects: setup.value === null ? lastingEffect.setupEffects : setup.value,
      ...(teardown === undefined
        ? {}
        : {
            teardownEffects:
              teardown.value === null ? lastingEffect.teardownEffects : teardown.value,
          }),
    };
  });
}

export function buildCardMetadataIndex(
  eventDecks: readonly EventDeckDef[],
): CompiledCardMetadataIndex {
  const entries: Record<string, CompiledCardMetadataEntry> = {};
  for (const deck of eventDecks) {
    for (const card of deck.cards) {
      const scalarMetadata: Record<string, string | number | boolean> = {};
      if (card.metadata !== undefined) {
        for (const [key, value] of Object.entries(card.metadata)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            scalarMetadata[key] = value;
          }
        }
      }
      entries[card.id] = {
        deckId: deck.id,
        cardId: card.id,
        tags: card.tags ?? [],
        metadata: scalarMetadata,
      };
    }
  }
  return { entries };
}

function collectBindingScopeFromTargets(
  targets: NonNullable<EventCardDef['unshaded']>['targets'],
): readonly string[] {
  if (targets === undefined) {
    return [];
  }
  return targets
    .map((target) => target.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
