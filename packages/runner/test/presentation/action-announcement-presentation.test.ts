import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import {
  createActionAnnouncementPresenter,
  resolveActionAnnouncementSpec,
} from '../../src/presentation/action-announcement-presentation.js';
import type { WorldLayoutModel } from '../../src/layout/world-layout-model.js';
import type { GameStore } from '../../src/store/game-store.js';

interface RuntimeState {
  readonly renderModel: GameStore['renderModel'];
  readonly worldLayout: WorldLayoutModel | null;
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
      worldLayout: makeWorldLayout(new Map([['zone:player-1', { x: 120, y: 80 }]])),
      appliedMoveEvent: null,
    })),
  );
}

function makeWorldLayout(
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): WorldLayoutModel {
  return {
    positions: new Map(positions),
    bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
    boardBounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
  };
}

describe('action-announcement-presentation', () => {
  it('resolves immutable announcement specs before renderer mutation', () => {
    const spec = resolveActionAnnouncementSpec(
      makeRenderModel(),
      makeWorldLayout(new Map([['zone:player-1', { x: 120, y: 80 }]])),
      {
        sequence: 1,
        actorId: asPlayerId(1),
        actorController: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
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
      makeWorldLayout(new Map([['zone:player-1', { x: 120, y: 80 }]])),
      {
        sequence: 1,
        actorId: asPlayerId(1),
        actorController: createHumanSeatController(),
        move: { actionId: asActionId('tick'), params: {} },
      },
    );
    const missingAnchorSpec = resolveActionAnnouncementSpec(
      makeRenderModel(),
      makeWorldLayout(new Map()),
      {
        sequence: 2,
        actorId: asPlayerId(1),
        actorController: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
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
      onAnnouncement,
    });

    presenter.start();

    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorController: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
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

  it('uses the latest store-owned world layout when publishing announcement specs', () => {
    const store = createRuntimeStore(makeRenderModel());
    const onAnnouncement = vi.fn();
    const presenter = createActionAnnouncementPresenter({
      store: store as unknown as StoreApi<GameStore>,
      onAnnouncement,
    });

    presenter.start();
    store.setState({
      worldLayout: makeWorldLayout(new Map([['zone:player-1', { x: 240, y: 20 }]])),
    });
    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: { actionId: asActionId('raise'), params: {} },
      },
    });

    expect(onAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      anchor: { x: 240, y: 92 },
    }));

    presenter.destroy();
  });
});
