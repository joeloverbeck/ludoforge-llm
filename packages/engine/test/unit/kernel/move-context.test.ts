import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, extractMoveContext, type Move } from '../../../src/kernel/index.js';

const makeMove = (actionId: string, params: Move['params'] = {}): Move => ({
  actionId: asActionId(actionId),
  params,
});

describe('extractMoveContext', () => {
  it('returns undefined when a move has no move-context fields', () => {
    assert.equal(extractMoveContext(makeMove('plain-action')), undefined);
  });

  it('extracts shaded event side from the action id', () => {
    assert.deepEqual(extractMoveContext(makeMove('resolve-shaded-event')), { eventSide: 'shaded' });
  });

  it('extracts unshaded event side from the action id', () => {
    assert.deepEqual(extractMoveContext(makeMove('resolve-unshaded-event')), { eventSide: 'unshaded' });
  });

  it('prefers $cardId over cardId when both are present', () => {
    assert.deepEqual(
      extractMoveContext(makeMove('event-action', { '$cardId': 'card-a', cardId: 'card-b' })),
      { currentCardId: 'card-a' },
    );
  });

  it('falls back to cardId when $cardId is absent', () => {
    assert.deepEqual(
      extractMoveContext(makeMove('event-action', { cardId: 'card-b' })),
      { currentCardId: 'card-b' },
    );
  });

  it('extracts the turn-flow window id', () => {
    assert.deepEqual(
      extractMoveContext(makeMove('event-action', { __windowId: 'window-1' })),
      { turnFlowWindow: 'window-1' },
    );
  });

  it('combines all extracted move-context fields', () => {
    assert.deepEqual(
      extractMoveContext(
        makeMove('resolve-shaded-event', {
          '$cardId': 'card-a',
          __windowId: 'window-1',
        }),
      ),
      {
        currentCardId: 'card-a',
        eventSide: 'shaded',
        turnFlowWindow: 'window-1',
      },
    );
  });
});
