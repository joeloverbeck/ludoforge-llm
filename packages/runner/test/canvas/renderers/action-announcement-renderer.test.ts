import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { asActionId, asPlayerId, type Move } from '@ludoforge/engine/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createActionAnnouncementRenderer } from '../../../src/canvas/renderers/action-announcement-renderer.js';
import type { GameStore } from '../../../src/store/game-store.js';

const {
  MockContainer,
  MockText,
  timelineInstances,
} = vi.hoisted(() => {
  class MockPoint {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockContainerClass {
    children: MockContainerClass[] = [];

    parent: MockContainerClass | null = null;

    position = new MockPoint();

    addChild(...children: MockContainerClass[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    destroy(): void {
      this.removeFromParent();
      this.children = [];
    }
  }

  class MockAnchor {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockTextClass extends MockContainerClass {
    text: string;

    style: unknown;

    alpha = 1;

    anchor = new MockAnchor();

    constructor(options: { text: string; style: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
  }

  type OnComplete = (() => void) | undefined;
  class MockTimeline {
    readonly onComplete: OnComplete;

    killed = false;

    constructor(onComplete: OnComplete) {
      this.onComplete = onComplete;
    }

    to(): this {
      return this;
    }

    kill(): void {
      this.killed = true;
    }

    complete(): void {
      this.onComplete?.();
    }
  }

  return {
    MockContainer: MockContainerClass,
    MockText: MockTextClass,
    timelineInstances: [] as MockTimeline[],
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Text: MockText,
}));

vi.mock('gsap', () => ({
  gsap: {
    timeline: vi.fn((options?: { onComplete?: () => void }) => {
      const timeline = {
        onComplete: options?.onComplete,
        killed: false,
        to() {
          return this;
        },
        kill() {
          this.killed = true;
        },
        complete() {
          this.onComplete?.();
        },
      };
      timelineInstances.push(timeline);
      return timeline;
    }),
  },
}));

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

describe('createActionAnnouncementRenderer', () => {
  beforeEach(() => {
    timelineInstances.length = 0;
  });

  it('renders a floating label for AI applied-move events and removes it on completion', () => {
    const store = createRuntimeStore(makeRenderModel());
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      store: store as unknown as StoreApi<GameStore>,
      positionStore: {
        getSnapshot: () => ({
          zoneIDs: ['zone:player-1'],
          positions: new Map([['zone:player-1', { x: 120, y: 80 }]]),
          bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
        }),
      } as never,
      parentContainer: parent as never,
    });
    renderer.start();

    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: { actionId: asActionId('tick'), params: {} },
      },
    });

    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Tick');

    timelineInstances[0]?.complete();
    expect(parent.children).toHaveLength(0);

    renderer.destroy();
  });

  it('ignores human applied-move events', () => {
    const store = createRuntimeStore(makeRenderModel());
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      store: store as unknown as StoreApi<GameStore>,
      positionStore: {
        getSnapshot: () => ({
          zoneIDs: ['zone:player-1'],
          positions: new Map([['zone:player-1', { x: 120, y: 80 }]]),
          bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
        }),
      } as never,
      parentContainer: parent as never,
    });
    renderer.start();

    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'human',
        move: { actionId: asActionId('tick'), params: {} },
      },
    });

    expect(parent.children).toHaveLength(0);
    renderer.destroy();
  });

  it('queues rapid same-player AI events and displays them in order', () => {
    const store = createRuntimeStore(makeRenderModel());
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      store: store as unknown as StoreApi<GameStore>,
      positionStore: {
        getSnapshot: () => ({
          zoneIDs: ['zone:player-1'],
          positions: new Map([['zone:player-1', { x: 120, y: 80 }]]),
          bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
        }),
      } as never,
      parentContainer: parent as never,
    });
    renderer.start();

    const firstMove: Move = { actionId: asActionId('tick'), params: {} };
    const secondMove: Move = { actionId: asActionId('raise'), params: { amount: 200 } };
    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: firstMove,
      },
    });
    store.setState({
      appliedMoveEvent: {
        sequence: 2,
        actorId: asPlayerId(1),
        actorSeat: 'ai-random',
        move: secondMove,
      },
    });

    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Tick');

    timelineInstances[0]?.complete();
    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Raise (200)');

    timelineInstances[1]?.complete();
    expect(parent.children).toHaveLength(0);

    renderer.destroy();
  });

  it('kills active timelines and clears display objects on destroy', () => {
    const store = createRuntimeStore(makeRenderModel());
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      store: store as unknown as StoreApi<GameStore>,
      positionStore: {
        getSnapshot: () => ({
          zoneIDs: ['zone:player-1'],
          positions: new Map([['zone:player-1', { x: 120, y: 80 }]]),
          bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 },
        }),
      } as never,
      parentContainer: parent as never,
    });
    renderer.start();

    store.setState({
      appliedMoveEvent: {
        sequence: 1,
        actorId: asPlayerId(1),
        actorSeat: 'ai-greedy',
        move: { actionId: asActionId('tick'), params: {} },
      },
    });

    expect(parent.children).toHaveLength(1);
    renderer.destroy();
    expect(parent.children).toHaveLength(0);
    expect(timelineInstances[0]?.killed).toBe(true);
  });
});
