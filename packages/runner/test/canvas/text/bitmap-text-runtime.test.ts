import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import { LABEL_FONT_NAME, STROKE_LABEL_FONT_NAME } from '../../../src/canvas/text/bitmap-font-registry.js';

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
      this.style = options.style;
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
      style: { fill: '#fff', fontSize: 12, fontName: LABEL_FONT_NAME },
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
    expect(text.style).toEqual({
      fill: '#fff',
      fontFamily: LABEL_FONT_NAME,
      fontSize: 12,
      fontWeight: undefined,
      stroke: undefined,
    });
  });

  it('sets visible and renderable when provided', () => {
    const text = createManagedBitmapText({
      style: { fontName: LABEL_FONT_NAME },
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
    const text = createManagedBitmapText({ parent, text: '42', style: { fontName: LABEL_FONT_NAME } });
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
      { key: 'a', text: 'Alpha', style: { fontName: LABEL_FONT_NAME } },
      { key: 'b', text: 'Beta', style: { fontName: STROKE_LABEL_FONT_NAME } },
    ]);

    const a = reconciler.get('a') as unknown as InstanceType<typeof MockBitmapText>;
    const b = reconciler.get('b') as unknown as InstanceType<typeof MockBitmapText>;
    expect(a?.text).toBe('Alpha');
    expect(b?.text).toBe('Beta');
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(2);

    // Remove 'b'
    reconciler.reconcile([{ key: 'a', text: 'Alpha Updated', style: { fontName: LABEL_FONT_NAME } }]);
    expect(reconciler.get('b')).toBeUndefined();
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(
      (reconciler.get('a') as unknown as InstanceType<typeof MockBitmapText>)?.text,
    ).toBe('Alpha Updated');
  });

  it('recreates text when instanceKey changes', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([{ key: 'x', text: 'v1', style: { fontName: LABEL_FONT_NAME }, instanceKey: 'k1' }]);
    const first = reconciler.get('x') as unknown as InstanceType<typeof MockBitmapText>;
    expect(first.text).toBe('v1');

    reconciler.reconcile([{ key: 'x', text: 'v2', style: { fontName: LABEL_FONT_NAME }, instanceKey: 'k2' }]);
    const second = reconciler.get('x') as unknown as InstanceType<typeof MockBitmapText>;
    expect(second).not.toBe(first);
    expect(second.text).toBe('v2');
  });

  it('applies alpha, rotation, and scale', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'z',
        text: 'styled',
        style: { fontName: STROKE_LABEL_FONT_NAME, fill: '#fff', stroke: { color: '#000', width: 2 } },
        alpha: 0.5,
        rotation: 1.2,
        scale: { x: 2, y: 3 },
      },
    ]);

    const z = reconciler.get('z') as unknown as InstanceType<typeof MockBitmapText>;
    expect(z.alpha).toBe(0.5);
    expect(z.rotation).toBe(1.2);
    expect(z.scale.x).toBe(2);
    expect(z.scale.y).toBe(3);
    expect(z.style).toEqual({
      fill: '#fff',
      fontFamily: STROKE_LABEL_FONT_NAME,
      fontSize: undefined,
      fontWeight: undefined,
      stroke: {
        color: '#000',
        width: 2,
      },
    });
  });

  it('resets alpha, rotation, and scale to canonical defaults when omitted on reuse', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'resettable',
        text: 'first',
        style: { fontName: LABEL_FONT_NAME },
        alpha: 0.25,
        rotation: 0.75,
        scale: { x: 2, y: 3 },
      },
    ]);

    const resettable = reconciler.get('resettable') as unknown as InstanceType<typeof MockBitmapText>;
    expect(resettable.alpha).toBe(0.25);
    expect(resettable.rotation).toBe(0.75);
    expect(resettable.scale.x).toBe(2);
    expect(resettable.scale.y).toBe(3);

    reconciler.reconcile([
      {
        key: 'resettable',
        text: 'second',
        style: { fontName: LABEL_FONT_NAME },
      },
    ]);

    expect(resettable.alpha).toBe(1);
    expect(resettable.rotation).toBe(0);
    expect(resettable.scale.x).toBe(1);
    expect(resettable.scale.y).toBe(1);
  });

  it('creates keyed text with a single style assignment and preserves style identity for equivalent updates', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'stable',
        text: 'Alpha',
        style: {
          fontName: LABEL_FONT_NAME,
          fill: '#fff',
          fontSize: 12,
          fontWeight: '700',
          stroke: { color: '#000', width: 1 },
        },
      },
    ]);

    const stable = reconciler.get('stable') as unknown as InstanceType<typeof MockBitmapText>;
    const initialStyle = stable.style;
    expect(stable.styleAssignments).toBe(1);

    reconciler.reconcile([
      {
        key: 'stable',
        text: 'Alpha',
        style: {
          fontName: LABEL_FONT_NAME,
          fill: '#fff',
          fontSize: 12,
          fontWeight: '700',
          stroke: { color: '#000', width: 1 },
        },
      },
    ]);

    expect(stable.styleAssignments).toBe(1);
    expect(stable.style).toBe(initialStyle);
  });

  it('reassigns style when a primitive semantic style field changes', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'primitive',
        text: 'Alpha',
        style: { fontName: LABEL_FONT_NAME, fill: '#fff', fontSize: 12 },
      },
    ]);

    const primitive = reconciler.get('primitive') as unknown as InstanceType<typeof MockBitmapText>;
    const initialStyle = primitive.style;

    reconciler.reconcile([
      {
        key: 'primitive',
        text: 'Alpha',
        style: { fontName: LABEL_FONT_NAME, fill: '#f97316', fontSize: 12 },
      },
    ]);

    expect(primitive.styleAssignments).toBe(2);
    expect(primitive.style).not.toBe(initialStyle);
    expect(primitive.style).toEqual({
      fill: '#f97316',
      fontFamily: LABEL_FONT_NAME,
      fontSize: 12,
      fontWeight: undefined,
      stroke: undefined,
    });
  });

  it('reassigns style when nested stroke values change', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'stroke',
        text: 'Alpha',
        style: {
          fontName: STROKE_LABEL_FONT_NAME,
          stroke: { color: '#000', width: 1 },
        },
      },
    ]);

    const stroke = reconciler.get('stroke') as unknown as InstanceType<typeof MockBitmapText>;
    const initialStyle = stroke.style;

    reconciler.reconcile([
      {
        key: 'stroke',
        text: 'Alpha',
        style: {
          fontName: STROKE_LABEL_FONT_NAME,
          stroke: { color: '#111', width: 2 },
        },
      },
    ]);

    expect(stroke.styleAssignments).toBe(2);
    expect(stroke.style).not.toBe(initialStyle);
    expect(stroke.style).toEqual({
      fontFamily: STROKE_LABEL_FONT_NAME,
      fontSize: undefined,
      fontWeight: undefined,
      fill: undefined,
      stroke: {
        color: '#111',
        width: 2,
      },
    });
  });

  it('updates non-style fields when style reassignment is skipped', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'mutable',
        text: 'Alpha',
        style: { fontName: LABEL_FONT_NAME, fill: '#fff' },
        position: { x: 1, y: 2 },
      },
    ]);

    const mutable = reconciler.get('mutable') as unknown as InstanceType<typeof MockBitmapText>;
    const initialStyle = mutable.style;

    reconciler.reconcile([
      {
        key: 'mutable',
        text: 'Beta',
        style: { fontName: LABEL_FONT_NAME, fill: '#fff' },
        position: { x: 10, y: 20 },
      },
    ]);

    expect(mutable.styleAssignments).toBe(1);
    expect(mutable.style).toBe(initialStyle);
    expect(mutable.text).toBe('Beta');
    expect(mutable.position.x).toBe(10);
    expect(mutable.position.y).toBe(20);
  });

  it('resets omitted anchor and position to canonical defaults on reuse', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'geometry',
        text: 'Alpha',
        style: { fontName: LABEL_FONT_NAME },
        anchor: { x: 0.5, y: 1 },
        position: { x: 10, y: 20 },
      },
    ]);

    const geometry = reconciler.get('geometry') as unknown as InstanceType<typeof MockBitmapText>;
    expect(geometry.anchor.x).toBe(0.5);
    expect(geometry.anchor.y).toBe(1);
    expect(geometry.position.x).toBe(10);
    expect(geometry.position.y).toBe(20);

    reconciler.reconcile([
      {
        key: 'geometry',
        text: 'Beta',
        style: { fontName: LABEL_FONT_NAME },
      },
    ]);

    expect(geometry.anchor.x).toBe(0);
    expect(geometry.anchor.y).toBe(0);
    expect(geometry.position.x).toBe(0);
    expect(geometry.position.y).toBe(0);
  });

  it('destroy cleans up all entries', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      { key: 'a', text: 'one', style: { fontName: LABEL_FONT_NAME } },
      { key: 'b', text: 'two', style: { fontName: LABEL_FONT_NAME } },
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

    reconciler.reconcile([{ key: 'c', text: 'custom', style: { fontName: LABEL_FONT_NAME }, apply: applySpy }]);
    expect(applySpy).toHaveBeenCalledOnce();
    expect(applySpy).toHaveBeenCalledWith(reconciler.get('c'));
  });

  it('lets apply override canonical transform defaults after reconciliation', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'custom-transform',
        text: 'first',
        style: { fontName: LABEL_FONT_NAME },
        alpha: 0.3,
        rotation: 0.5,
        scale: { x: 4, y: 5 },
      },
    ]);

    const customTransform = reconciler.get('custom-transform') as unknown as InstanceType<typeof MockBitmapText>;
    expect(customTransform.alpha).toBe(0.3);
    expect(customTransform.rotation).toBe(0.5);
    expect(customTransform.scale.x).toBe(4);
    expect(customTransform.scale.y).toBe(5);

    reconciler.reconcile([
      {
        key: 'custom-transform',
        text: 'second',
        style: { fontName: LABEL_FONT_NAME },
        apply: (text) => {
          text.alpha = 0.6;
          text.rotation = 1.25;
          text.scale.set(1.5, 1.75);
        },
      },
    ]);

    expect(customTransform.alpha).toBe(0.6);
    expect(customTransform.rotation).toBe(1.25);
    expect(customTransform.scale.x).toBe(1.5);
    expect(customTransform.scale.y).toBe(1.75);
  });

  it('lets apply override canonical geometry defaults after reconciliation', () => {
    const parent = new MockContainer() as unknown as Container;
    const reconciler = createKeyedBitmapTextReconciler({ parentContainer: parent });

    reconciler.reconcile([
      {
        key: 'custom-geometry',
        text: 'first',
        style: { fontName: LABEL_FONT_NAME },
        anchor: { x: 0.25, y: 0.75 },
        position: { x: 10, y: 20 },
      },
    ]);

    const customGeometry = reconciler.get('custom-geometry') as unknown as InstanceType<typeof MockBitmapText>;
    expect(customGeometry.anchor.x).toBe(0.25);
    expect(customGeometry.anchor.y).toBe(0.75);
    expect(customGeometry.position.x).toBe(10);
    expect(customGeometry.position.y).toBe(20);

    reconciler.reconcile([
      {
        key: 'custom-geometry',
        text: 'second',
        style: { fontName: LABEL_FONT_NAME },
        apply: (text) => {
          text.anchor.set(1, 0.5);
          text.position.set(30, 40);
        },
      },
    ]);

    expect(customGeometry.anchor.x).toBe(1);
    expect(customGeometry.anchor.y).toBe(0.5);
    expect(customGeometry.position.x).toBe(30);
    expect(customGeometry.position.y).toBe(40);
  });
});
