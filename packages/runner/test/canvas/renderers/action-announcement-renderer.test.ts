import { asPlayerId } from '@ludoforge/engine/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createActionAnnouncementRenderer } from '../../../src/canvas/renderers/action-announcement-renderer.js';
import type { PresentationActionAnnouncementSpec } from '../../../src/presentation/action-announcement-presentation.js';

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

  return {
    MockContainer: MockContainerClass,
    MockText: MockTextClass,
    timelineInstances: [] as Array<{
      killed: boolean;
      onComplete: (() => void) | undefined;
      to: () => unknown;
      kill: () => void;
      complete: () => void;
    }>,
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

function makeSpec(overrides: Partial<PresentationActionAnnouncementSpec> = {}): PresentationActionAnnouncementSpec {
  return {
    queueKey: String(asPlayerId(1)),
    actorId: asPlayerId(1),
    text: 'Tick',
    anchor: { x: 120, y: 152 },
    sequence: 1,
    signature: '1|1|Tick|120|152',
    ...overrides,
  };
}

describe('createActionAnnouncementRenderer', () => {
  beforeEach(() => {
    timelineInstances.length = 0;
  });

  it('renders an announcement spec and removes it on completion', () => {
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      parentContainer: parent as never,
    });

    renderer.enqueue(makeSpec());

    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Tick');

    timelineInstances[0]?.complete();
    expect(parent.children).toHaveLength(0);

    renderer.destroy();
  });

  it('queues rapid same-player announcement specs and displays them in order', () => {
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      parentContainer: parent as never,
    });

    renderer.enqueue(makeSpec({ sequence: 1, text: 'Tick' }));
    renderer.enqueue(makeSpec({ sequence: 2, text: 'Raise (200)', signature: '2|1|Raise (200)|120|152' }));

    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Tick');

    timelineInstances[0]?.complete();
    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Raise (200)');

    timelineInstances[1]?.complete();
    expect(parent.children).toHaveLength(0);

    renderer.destroy();
  });

  it('renders different players independently', () => {
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      parentContainer: parent as never,
    });

    renderer.enqueue(makeSpec({ queueKey: '1', actorId: asPlayerId(1), text: 'Tick' }));
    renderer.enqueue(makeSpec({
      queueKey: '2',
      actorId: asPlayerId(2),
      text: 'Raise',
      anchor: { x: 200, y: 120 },
      sequence: 2,
      signature: '2|2|Raise|200|120',
    }));

    expect(parent.children).toHaveLength(2);
    expect((parent.children[0] as unknown as { text: string }).text).toBe('Tick');
    expect((parent.children[1] as unknown as { text: string }).text).toBe('Raise');

    renderer.destroy();
  });

  it('kills active timelines and clears display objects on destroy', () => {
    const parent = new MockContainer();
    const renderer = createActionAnnouncementRenderer({
      parentContainer: parent as never,
    });

    renderer.enqueue(makeSpec());

    expect(parent.children).toHaveLength(1);
    renderer.destroy();
    expect(parent.children).toHaveLength(0);
    expect(timelineInstances[0]?.killed).toBe(true);
  });
});
