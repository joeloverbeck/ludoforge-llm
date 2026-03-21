import { describe, expect, it } from 'vitest';

import { resolveTooltipCompanionGroups } from '../../src/ui/tooltip-companion-actions.js';

describe('resolveTooltipCompanionGroups', () => {
  it('returns hidden actions for appendTooltipFrom classes in declaration order', () => {
    const result = resolveTooltipCompanionGroups(
      'operationPlusSpecialActivity',
      {
        synthesize: [{
          fromClass: 'operation',
          intoGroup: 'operationPlusSpecialActivity',
          appendTooltipFrom: ['specialActivity', 'bonusAction'],
        }],
        hide: ['specialActivity', 'bonusAction'],
      },
      new Map([
        ['specialActivity', [{ actionId: 'ambush', displayName: 'Ambush', isAvailable: true, actionClass: 'specialActivity' }]],
        ['bonusAction', [{ actionId: 'rally', displayName: 'Rally', isAvailable: false, actionClass: 'bonusAction' }]],
      ]),
    );

    expect(result).toEqual([
      {
        actionClass: 'specialActivity',
        groupName: 'Special Activity',
        actions: [{ actionId: 'ambush', displayName: 'Ambush', isAvailable: true, actionClass: 'specialActivity' }],
      },
      {
        actionClass: 'bonusAction',
        groupName: 'Bonus Action',
        actions: [{ actionId: 'rally', displayName: 'Rally', isAvailable: false, actionClass: 'bonusAction' }],
      },
    ]);
  });

  it('deduplicates repeated classes and ignores missing hidden-action buckets', () => {
    const result = resolveTooltipCompanionGroups(
      'operationPlusSpecialActivity',
      {
        synthesize: [{
          fromClass: 'operation',
          intoGroup: 'operationPlusSpecialActivity',
          appendTooltipFrom: ['specialActivity', 'specialActivity', 'missingClass'],
        }],
      },
      new Map([
        ['specialActivity', [{ actionId: 'ambush', displayName: 'Ambush', isAvailable: true, actionClass: 'specialActivity' }]],
      ]),
    );

    expect(result).toEqual([
      {
        actionClass: 'specialActivity',
        groupName: 'Special Activity',
        actions: [{ actionId: 'ambush', displayName: 'Ambush', isAvailable: true, actionClass: 'specialActivity' }],
      },
    ]);
  });
});
