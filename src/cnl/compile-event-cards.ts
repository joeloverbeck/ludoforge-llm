import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EventCardDef, EventDeckDef, EventEligibilityOverrideDef, EventFreeOperationGrantDef } from '../kernel/types.js';
import { lowerConditionNode, lowerQueryNode } from './compile-conditions.js';
import { lowerEffectArray } from './compile-effects.js';
import { normalizeIdentifier } from './compile-lowering.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export function lowerEventCards(
  cards: readonly EventCardDef[],
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventCardDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();

  const lowered = cards.map((card, index) => {
    const cardPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(card.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_CARD_ID_DUPLICATE',
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
          code: 'CNL_COMPILER_EVENT_CARD_ORDER_AMBIGUOUS',
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
        : lowerConditionNode(card.playCondition, { ownershipByBase }, `${cardPath}.playCondition`);
    if (playCondition !== undefined) {
      diagnostics.push(...playCondition.diagnostics);
    }

    const unshaded =
      card.unshaded === undefined
        ? undefined
        : lowerEventCardSide(card.unshaded, ownershipByBase, diagnostics, `${cardPath}.unshaded`);
    const shaded =
      card.shaded === undefined
        ? undefined
        : lowerEventCardSide(card.shaded, ownershipByBase, diagnostics, `${cardPath}.shaded`);

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
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventDeckDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const lowered = decks.map((deck, index) => {
    const deckPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(deck.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_DECK_ID_DUPLICATE',
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
        cards: lowerEventCards(deck.cards, ownershipByBase, diagnostics, `${deckPath}.cards`),
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
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): NonNullable<EventCardDef['unshaded']> {
  const loweredTargets = lowerEventTargets(side.targets, ownershipByBase, diagnostics, `${pathPrefix}.targets`);
  const sideBindingScope = collectBindingScopeFromTargets(loweredTargets);

  const loweredEffects = lowerOptionalEffects(side.effects, ownershipByBase, sideBindingScope, diagnostics, `${pathPrefix}.effects`);
  const loweredFreeOperationGrants = lowerEventFreeOperationGrants(
    side.freeOperationGrants,
    ownershipByBase,
    diagnostics,
    `${pathPrefix}.freeOperationGrants`,
  );
  const loweredEligibilityOverrides = lowerEventEligibilityOverrides(side.eligibilityOverrides);
  const loweredLastingEffects = lowerEventLastingEffects(
    side.lastingEffects,
    ownershipByBase,
    sideBindingScope,
    diagnostics,
    `${pathPrefix}.lastingEffects`,
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
        code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ID_DUPLICATE',
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
          code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ORDER_AMBIGUOUS',
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
      ownershipByBase,
      diagnostics,
      `${branchPath}.targets`,
      sideBindingScope,
    );
    const branchBindingScope = [...sideBindingScope, ...collectBindingScopeFromTargets(loweredBranchTargets)];
    const loweredBranchEffects = lowerOptionalEffects(
      branch.effects,
      ownershipByBase,
      branchBindingScope,
      diagnostics,
      `${branchPath}.effects`,
    );
    const loweredBranchFreeOperationGrants = lowerEventFreeOperationGrants(
      branch.freeOperationGrants,
      ownershipByBase,
      diagnostics,
      `${branchPath}.freeOperationGrants`,
    );
    const loweredBranchEligibilityOverrides = lowerEventEligibilityOverrides(branch.eligibilityOverrides);
    const loweredBranchLastingEffects = lowerEventLastingEffects(
      branch.lastingEffects,
      ownershipByBase,
      branchBindingScope,
      diagnostics,
      `${branchPath}.lastingEffects`,
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
): readonly EventEligibilityOverrideDef[] | undefined {
  if (overrides === undefined) {
    return undefined;
  }
  return overrides.map((override) => ({
    ...override,
    target:
      override.target.kind === 'active'
        ? override.target
        : {
            ...override.target,
          },
  }));
}

function lowerEventFreeOperationGrants(
  grants: readonly EventFreeOperationGrantDef[] | undefined,
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventFreeOperationGrantDef[] | undefined {
  if (grants === undefined) {
    return undefined;
  }
  return grants.map((grant, index) => {
    const path = `${pathPrefix}.${index}`;
    if (grant.zoneFilter === undefined) {
      return grant;
    }
    const loweredZoneFilter = lowerConditionNode(grant.zoneFilter, { ownershipByBase }, `${path}.zoneFilter`);
    diagnostics.push(...loweredZoneFilter.diagnostics);
    return {
      ...grant,
      ...(loweredZoneFilter.value === null ? {} : { zoneFilter: loweredZoneFilter.value }),
    };
  });
}

function lowerEventTargets(
  targets: NonNullable<EventCardDef['unshaded']>['targets'],
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
  bindingScope?: readonly string[],
): NonNullable<EventCardDef['unshaded']>['targets'] {
  if (targets === undefined) {
    return undefined;
  }

  return targets.map((target, index) => {
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
      return target;
    }

    const selector = lowerQueryNode(
      target.selector,
      { ownershipByBase, ...(bindingScope === undefined ? {} : { bindingScope }) },
      `${targetPath}.selector`,
    );
    diagnostics.push(...selector.diagnostics);
    if (selector.value === null) {
      return target;
    }

    return {
      ...target,
      selector: selector.value,
    };
  });
}

function lowerOptionalEffects(
  effects: NonNullable<EventCardDef['unshaded']>['effects'],
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  bindingScope: readonly string[],
  diagnostics: Diagnostic[],
  path: string,
): NonNullable<EventCardDef['unshaded']>['effects'] {
  if (effects === undefined) {
    return undefined;
  }

  const lowered = lowerEffectArray(effects as readonly unknown[], { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value === null ? effects : lowered.value;
}

function lowerEventLastingEffects(
  lastingEffects: NonNullable<EventCardDef['unshaded']>['lastingEffects'],
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  bindingScope: readonly string[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
): NonNullable<EventCardDef['unshaded']>['lastingEffects'] {
  if (lastingEffects === undefined) {
    return undefined;
  }

  return lastingEffects.map((lastingEffect, index) => {
    const path = `${pathPrefix}.${index}`;
    const setup = lowerEffectArray(
      lastingEffect.setupEffects as readonly unknown[],
      { ownershipByBase, bindingScope },
      `${path}.setupEffects`,
    );
    diagnostics.push(...setup.diagnostics);

    const teardown =
      lastingEffect.teardownEffects === undefined
        ? undefined
        : lowerEffectArray(
            lastingEffect.teardownEffects as readonly unknown[],
            { ownershipByBase, bindingScope },
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

function missingCapabilityDiagnostic(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): Diagnostic {
  return {
    code: 'CNL_COMPILER_MISSING_CAPABILITY',
    path,
    severity: 'error',
    message: `Cannot lower ${construct} to kernel AST: ${formatValue(actual)}.`,
    suggestion: 'Rewrite this node to a supported kernel-compatible shape.',
    ...(alternatives === undefined ? {} : { alternatives: [...alternatives] }),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
