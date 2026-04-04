import { describe, expect, it } from 'vitest';
import { asActionId, type Move } from '@ludoforge/engine/runtime';

import { deriveActionGroups } from '../../src/model/derive-runner-frame.js';

function makeMove(actionId: string, actionClass?: string): Move {
  return {
    actionId: asActionId(actionId),
    params: {},
    ...(actionClass === undefined ? {} : { actionClass }),
  };
}

describe('deriveActionGroups', () => {
  it('marks actions unavailable when the availability map says false', () => {
    const groups = deriveActionGroups(
      [
        makeMove('pivotal-event', 'event'),
        makeMove('pass'),
      ],
      new Map<string, boolean>([
        ['pivotal-event', false],
        ['pass', true],
      ]),
    );

    expect(groups).toEqual([
      {
        groupKey: 'event',
        actions: [{ actionId: 'pivotal-event', isAvailable: false, actionClass: 'event' }],
      },
      {
        groupKey: 'Actions',
        actions: [{ actionId: 'pass', isAvailable: true }],
      },
    ]);
  });

  it('defaults actions to available when no availability entry exists', () => {
    const groups = deriveActionGroups(
      [makeMove('ambush', 'specialActivity')],
      new Map<string, boolean>(),
    );

    expect(groups).toEqual([
      {
        groupKey: 'specialActivity',
        actions: [{ actionId: 'ambush', isAvailable: true, actionClass: 'specialActivity' }],
      },
    ]);
  });
});
