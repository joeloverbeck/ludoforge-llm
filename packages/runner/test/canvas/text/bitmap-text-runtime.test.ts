import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

const { MockContainer, MockBitmapText } = vi.hoisted(() => {
  class MockPoint {
    x = 0;
    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
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

  class HoistedMockContainer {
    children: HoistedMockBitmapText[] = [];
    parent: HoistedMockContainer | null = null;
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;
    visible = true;
    renderable = true;
    alpha = 1;
    rotation = 0;
    scale = new MockPoint();

    addChild(...children: HoistedMockBitmapText[]): void {
      for (const child of children) {
        child.removeFromParent();
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockBitmapText[] {
      const removed = this.children;
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter(
        (child) => child !== (this as unknown as HoistedMockBitmapText),
      );
      this.parent = null;
    }
  }

  class HoistedMockBitmapText extends HoistedMockContainer {
    text: string;
    style: Record<string, unknown> | undefined;
    position = new MockPoint();
    anchor = new MockAnchor();
    destroy = vi.fn(() => {
      this.removeFromParent();
    });

    constructor(options: { text: string; style?: Record<string, unknown> }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockBitmapText: HoistedMockBitmapText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  BitmapText: MockBitmapText,
}));

import {
  createKeyedBitmapTextReconciler,
  createManagedBitmapText,
  destroyManagedBitmapText,
} from '../../../src/canvas/text/bitmap-text-runtime';

describe('createManagedBitmapText', () => {
  it('creates non-interactive BitmapText with optional parent, anchor, and position', () => {
    const parent = new MockContainer() as unknown as Container;

    const text = createManagedBitmapText({
      parent,
      text: 'Hello',
      style: { fill: '#fff', fontSize: 12 },
      anchor: { x: 0.5, y: 1 },
      position: { x: 10, y: 20 },
    }) as unknown as InstanceType<typeof MockBitmapText>;

    expect(text.text).toBe('Hello');
    expect(text.parent).toBe(parent);
    expect(text.anchor.x).toBe(0.5);
    expect(text.anchor.y).toBe(1);
    expect(text.position.x).toBe(10);
    expect(text.position.y).toBe(20);
    expect(text.eventMode).toBe('none');
    expect(text.interactiveChildren).toBe(false);
  });

  it('creates text with defaults when no options are provided', () => {
    const text = createManagedBitmapText() as unknown as InstanceType<typeof MockBitmapText>;
    expect(text.text).toBe('');
    expect(text.parent).toBeNull();
  });

  it('sets visible and renderable when provided', () => {
    const text = createManagedBitmapText({
      visible: false,
      renderable: false,
    }) as unknown as InstanceType<typeof MockBitmapText>;
    expect(text.visible).toBe(false);
    expect(text.renderable).toBe(false);
  });
});

describe('destroyManagedBitmapText', () => {
  it('removes text from parent before destroying', () => {
    const parent = new MockContainer() as unknown as Container;
    const text = createManagedBitmapText({ parent, text: '42' });
    const mock = text as unknown as InstanceType<typeof MockBitmapText>;

    expect(mock.parent).toBe(parent);
    destroyManagedBitmapText(text);

    expect(mock.renderable).toBe(false);
    expect(mock.visible).toBe(false);
    expect(mock.parent).toBeNull();
  });
});

describe('createKeyedBitmapTextReconciler', () => {
  it('creates and removes BitmapText based on specs', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      { key: 'a', text: 'Alpha' },
      { key: 'b', text: 'Beta' },
    ]);

    const a = reconciler.get('a') as unknown as InstanceType<typeof MockBitmapText>;
    const b = reconciler.get('b') as unknown as InstanceType<typeof MockBitmapText>;
    expect(a?.text).toBe('Alpha');
    expect(b?.text).toBe('Beta');
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(2);

    // Remove 'b'
    reconciler.reconcile([{ key: 'a', text: 'Alpha Updated' }]);
    expect(reconciler.get('b')).toBeUndefined();
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(
      (reconciler.get('a') as unknown as InstanceType<typeof MockBitmapText>)?.text,
    ).toBe('Alpha Updated');
  });

  it('recreates text when instanceKey changes', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([{ key: 'x', text: 'v1', instanceKey: 'k1' }]);
    const first = reconciler.get('x') as unknown as InstanceType<typeof MockBitmapText>;
    expect(first.text).toBe('v1');

    reconciler.reconcile([{ key: 'x', text: 'v2', instanceKey: 'k2' }]);
    const second = reconciler.get('x') as unknown as InstanceType<typeof MockBitmapText>;
    expect(second).not.toBe(first);
    expect(second.text).toBe('v2');
  });

  it('applies alpha, rotation, and scale', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      { key: 'z', text: 'styled', alpha: 0.5, rotation: 1.2, scale: { x: 2, y: 3 } },
    ]);

    const z = reconciler.get('z') as unknown as InstanceType<typeof MockBitmapText>;
    expect(z.alpha).toBe(0.5);
    expect(z.rotation).toBe(1.2);
    expect(z.scale.x).toBe(2);
    expect(z.scale.y).toBe(3);
  });

  it('destroy cleans up all entries', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      { key: 'a', text: 'one' },
      { key: 'b', text: 'two' },
    ]);
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(2);

    reconciler.destroy();
    expect(reconciler.get('a')).toBeUndefined();
    expect(reconciler.get('b')).toBeUndefined();
  });

  it('calls apply callback when provided', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });
    const applySpy = vi.fn();

    reconciler.reconcile([{ key: 'c', text: 'custom', apply: applySpy }]);
    expect(applySpy).toHaveBeenCalledOnce();
    expect(applySpy).toHaveBeenCalledWith(reconciler.get('c'));
  });
});
