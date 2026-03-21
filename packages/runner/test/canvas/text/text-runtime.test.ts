import { describe, expect, it, vi } from 'vitest';
import type { Container, Text } from 'pixi.js';

const { MockContainer, MockText } = vi.hoisted(() => {
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
    children: HoistedMockText[] = [];
    parent: HoistedMockContainer | null = null;
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;
    visible = true;
    renderable = true;
    alpha = 1;
    rotation = 0;
    scale = new MockPoint();

    addChild(...children: HoistedMockText[]): void {
      for (const child of children) {
        child.removeFromParent();
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockText[] {
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
      this.parent.children = this.parent.children.filter((child) => child !== this as unknown as HoistedMockText);
      this.parent = null;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;
    private _style: Record<string, unknown> | undefined;
    styleAssignments = 0;
    position = new MockPoint();
    anchor = new MockAnchor();
    destroy = vi.fn(() => {
      this.removeFromParent();
    });

    constructor(options: { text: string; style?: Record<string, unknown> }) {
      super();
      this.text = options.text;
      if (options.style !== undefined) {
        this.style = options.style;
      }
    }

    get style(): Record<string, unknown> | undefined {
      return this._style;
    }

    set style(value: Record<string, unknown> | undefined) {
      this._style = value;
      this.styleAssignments += 1;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Text: MockText,
}));

import {
  createKeyedTextReconciler,
  createManagedText,
  destroyManagedText,
} from '../../../src/canvas/text/text-runtime';

describe('createManagedText', () => {
  it('creates non-interactive text nodes with optional parent, anchor, and position', () => {
    const parent = new MockContainer() as unknown as Container;

    const text = createManagedText({
      parent,
      text: 'Hello',
      style: { fill: '#fff', fontSize: 12 },
      anchor: { x: 0.5, y: 1 },
      position: { x: 10, y: 20 },
    }) as unknown as InstanceType<typeof MockText>;

    expect(text.text).toBe('Hello');
    expect(text.parent).toBe(parent);
    expect(text.anchor.x).toBe(0.5);
    expect(text.anchor.y).toBe(1);
    expect(text.position.x).toBe(10);
    expect(text.position.y).toBe(20);
    expect(text.eventMode).toBe('none');
    expect(text.interactiveChildren).toBe(false);
  });
});

describe('destroyManagedText', () => {
  it('removes text from its parent before destroying it', () => {
    const parent = new MockContainer() as unknown as Container;
    const text = createManagedText({ parent, text: 'Hello' }) as unknown as InstanceType<typeof MockText>;

    destroyManagedText(text as unknown as Text);

    expect(text.parent).toBeNull();
    expect(text.destroy).toHaveBeenCalledTimes(1);
  });

  it('sets renderable and visible to false before removeFromParent()', () => {
    const parent = new MockContainer() as unknown as Container;
    const text = createManagedText({ parent, text: 'Hello' }) as unknown as InstanceType<typeof MockText>;
    const statesSeenByRemove: Array<{ renderable: boolean; visible: boolean }> = [];
    const originalRemoveFromParent = text.removeFromParent.bind(text);

    text.removeFromParent = vi.fn(() => {
      statesSeenByRemove.push({
        renderable: text.renderable,
        visible: text.visible,
      });
      originalRemoveFromParent();
    });

    destroyManagedText(text as unknown as Text);

    expect(statesSeenByRemove[0]).toEqual({ renderable: false, visible: false });
    expect(statesSeenByRemove).not.toHaveLength(0);
  });

  it('reaches destroy() with renderable and visible already false', () => {
    const parent = new MockContainer() as unknown as Container;
    const text = createManagedText({ parent, text: 'Hello' }) as unknown as InstanceType<typeof MockText>;
    const statesSeenByDestroy: Array<{ renderable: boolean; visible: boolean }> = [];
    const originalDestroy = text.destroy;

    text.destroy = vi.fn(() => {
      statesSeenByDestroy.push({
        renderable: text.renderable,
        visible: text.visible,
      });
      originalDestroy();
    });

    destroyManagedText(text as unknown as Text);

    expect(statesSeenByDestroy).toEqual([{ renderable: false, visible: false }]);
  });
});

describe('createKeyedTextReconciler', () => {
  it('creates and updates text by semantic key', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{
      key: 'pot',
      text: 'Pot: 10',
      style: { fill: '#fff', fontSize: 12 },
      position: { x: 10, y: 20 },
    }]);

    const first = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;

    runtime.reconcile([{
      key: 'pot',
      text: 'Pot: 20',
      style: { fill: '#000', fontSize: 14 },
      position: { x: 30, y: 40 },
    }]);

    const second = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;
    expect(second).toBe(first);
    expect(second.text).toBe('Pot: 20');
    expect(second.style).toMatchObject({ fill: '#000', fontSize: 14 });
    expect(second.position.x).toBe(30);
    expect(second.position.y).toBe(40);
    expect(first.destroy).not.toHaveBeenCalled();
  });

  it('replaces a text node when the explicit instance key changes', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{ key: 'title', text: 'A', instanceKey: 'v1' }]);
    const first = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;

    runtime.reconcile([{ key: 'title', text: 'B', instanceKey: 'v2' }]);
    const second = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;

    expect(second).not.toBe(first);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.text).toBe('B');
  });

  it('retires text nodes that are removed from the spec set', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
    ]);

    const removed = (parent as unknown as InstanceType<typeof MockContainer>).children[1]!;
    runtime.reconcile([{ key: 'a', text: 'A' }]);

    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(removed.destroy).toHaveBeenCalledTimes(1);
  });

  it('applies advanced properties and custom post-update hooks', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{
      key: 'label',
      text: 'Label',
      alpha: 0.25,
      rotation: Math.PI / 4,
      scale: { x: 2, y: 3 },
      apply: (text) => {
        text.position.set(5, 6);
      },
    }]);

    const label = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;
    expect(label.alpha).toBe(0.25);
    expect(label.rotation).toBe(Math.PI / 4);
    expect(label.scale.x).toBe(2);
    expect(label.scale.y).toBe(3);
    expect(label.position.x).toBe(5);
    expect(label.position.y).toBe(6);
  });

  it('resets omitted transform fields and style to canonical defaults on reuse', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{
      key: 'label',
      text: 'Styled',
      style: { fill: '#fff', fontSize: 16 },
      alpha: 0.25,
      rotation: Math.PI / 3,
      scale: { x: 2, y: 3 },
    }]);

    const label = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;
    expect(label.style).toEqual({ fill: '#fff', fontSize: 16 });
    expect(label.alpha).toBe(0.25);
    expect(label.rotation).toBe(Math.PI / 3);
    expect(label.scale.x).toBe(2);
    expect(label.scale.y).toBe(3);

    runtime.reconcile([{
      key: 'label',
      text: 'Plain',
    }]);

    expect(label.style).toEqual({});
    expect(label.alpha).toBe(1);
    expect(label.rotation).toBe(0);
    expect(label.scale.x).toBe(1);
    expect(label.scale.y).toBe(1);
  });

  it('creates keyed text with a single semantic style assignment', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{
      key: 'title',
      text: 'Hello',
      style: { fill: '#fff', fontSize: 12 },
    }]);

    const title = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;
    expect(title.styleAssignments).toBe(1);
    expect(title.style).toEqual({ fill: '#fff', fontSize: 12 });
  });

  it('lets apply override canonical defaults after reconciliation', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([{
      key: 'label',
      text: 'Styled',
      style: { fill: '#fff', fontSize: 16 },
      alpha: 0.25,
      rotation: 0.5,
      scale: { x: 2, y: 3 },
    }]);

    const label = (parent as unknown as InstanceType<typeof MockContainer>).children[0]!;

    runtime.reconcile([{
      key: 'label',
      text: 'Plain',
      apply: (text) => {
        text.alpha = 0.75;
        text.rotation = 1.25;
        text.scale.set(4, 5);
      },
    }]);

    expect(label.style).toEqual({});
    expect(label.alpha).toBe(0.75);
    expect(label.rotation).toBe(1.25);
    expect(label.scale.x).toBe(4);
    expect(label.scale.y).toBe(5);
  });

  it('destroy tears down every retained text node', () => {
    const parent = new MockContainer() as unknown as Container;
    const runtime = createKeyedTextReconciler({ parentContainer: parent });

    runtime.reconcile([
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
    ]);
    const [a, b] = (parent as unknown as InstanceType<typeof MockContainer>).children;

    runtime.destroy();

    expect(a?.destroy).toHaveBeenCalledTimes(1);
    expect(b?.destroy).toHaveBeenCalledTimes(1);
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(0);
  });
});
