import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  createActionAnnouncementPresenter,
  resolveActionAnnouncementSpec,
} from '../../src/presentation/action-announcement-presentation.js';
import type { GameStore } from '../../src/store/game-store.js';

interface RuntimeState {
  readonly renderModel: GameStore['renderModel'];
  readonly appliedMoveEvent: GameStore['appliedMoveEvent'];
}

function makeRenderModel(): NonNullable<GameStore['renderModel']> {
  return {
    zones: [
      {
        id: 'zone:player-1',
        ownerID: asPlayerId(1),
      },
    ],
    actionGroups: [
      {
        groupName: 'main',
        actions: [
          { actionId: 'tick', displayName: 'Tick', isAvailable: true },
          { actionId: 'raise', displayName: 'Raise', isAvailable: true },
        ],
      },
    ],
  } as unknown as NonNullable<GameStore['renderModel']>;
}

function createRuntimeStore(initialRenderModel: GameStore['renderModel']): StoreApi<RuntimeState> {
  return createStore<RuntimeState>()(
    subscribeWithSelector((): RuntimeState => ({
      renderModel: initialRenderModel,
      appliedMoveEvent: null,
    })),
  );
}

describe('action-announcement-presentation', () => {
  it('resolves immutable announcement specs before renderer mutation', () => {
    const spec = resolveActionAnnouncementSpec(
      makeRenderModel(),
      new Map([['zone:player-1', { x: 120, y: 80 }]]),
      {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: { actionId: asActionId('tick'), params: { amount: 200 } },
      },
    );

    expect(spec).toMatchObject({
      queueKey: '1',
      text: 'Tick (200)',
      anchor: { x: 120, y: 152 },
      sequence: 1,
    });
  });

  it('ignores human and unresolved announcement events', () => {
    const humanSpec = resolveActionAnnouncementSpec(
      makeRenderModel(),
      new Map([['zone:player-1', { x: 120, y: 80 }]]),
      {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'human',
        move: { actionId: asActionId('tick'), params: {} },
      },
    );
    const missingAnchorSpec = resolveActionAnnouncementSpec(
      makeRenderModel(),
      new Map(),
      {
        sequence: 2,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: { actionId: asActionId('tick'), params: {} },
      },
    );

    expect(humanSpec).toBeNull();
    expect(missingAnchorSpec).toBeNull();
  });

  it('publishes announcement specs from store updates through the presenter', () => {
    const store = createRuntimeStore(makeRenderModel());
    const onAnnouncement = vi.fn();
    const presenter = createActionAnnouncementPresenter({
      store: store as unknown as StoreApi<GameStore>,
      positionStore: {
        getSnapshot: () => ({
          zoneIDs: ['zone:player-1'],
          positions: new Map([['zone:player-1', { x: 120, y: 80 }]]),
          bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
        }),
      } as never,
      onAnnouncement,
    });

    presenter.start();

    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: { actionId: asActionId('raise'), params: { amount: 200 } },
      },
    });

    expect(onAnnouncement).toHaveBeenCalledTimes(1);
    expect(onAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Raise (200)',
      anchor: { x: 120, y: 152 },
      sequence: 1,
    }));

    presenter.destroy();
  });
});
