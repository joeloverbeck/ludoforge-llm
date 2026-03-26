import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  destroyManagedBitmapText,
  MockBitmapText,
  MockContainer,
  MockCircle,
  MockGraphics,
  MockPolygon,
} = vi.hoisted(() => {
  class MockEmitter {
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    off(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.get(event)?.delete(listener);
      return this;
    }

    emit(event: string, ...args: unknown[]): boolean {
      const listeners = this.listeners.get(event);
      if (listeners === undefined) {
        return false;
      }
      for (const listener of listeners) {
        listener(...args);
      }
      return listeners.size > 0;
    }

    listenerCount(event: string): number {
      return this.listeners.get(event)?.size ?? 0;
    }
  }

  class HoistedMockContainer extends MockEmitter {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      },
    };

    visible = true;

    renderable = true;

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    cursor = 'default';

    hitArea: unknown = null;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockContainer[] {
      const removed = [...this.children];
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
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    destroy(options?: { children?: boolean }): void {
      if (options?.children === true) {
        this.removeChildren().forEach((child) => child.destroy({ children: true }));
      }
      this.removeFromParent();
    }
  }

  class MockPoint {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    strokeStyle: unknown;

    fillStyle: unknown;

    polyArgs: number[] | null = null;

    circleArgs: [number, number, number] | null = null;

    lineToArgs: Array<[number, number]> = [];

    moveToArgs: Array<[number, number]> = [];

    clear(): this {
      this.strokeStyle = undefined;
      this.lineToArgs = [];
      this.moveToArgs = [];
      return this;
    }

    moveTo(x: number, y: number): this {
      this.moveToArgs.push([x, y]);
      return this;
    }

    lineTo(x: number, y: number): this {
      this.lineToArgs.push([x, y]);
      return this;
    }

    circle(x: number, y: number, radius: number): this {
      this.circleArgs = [x, y, radius];
      return this;
    }

    poly(points: number[]): this {
      this.polyArgs = points;
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }

    fill(style: unknown): this {
      this.fillStyle = style;
      return this;
    }
  }

  class HoistedMockCircle {
    constructor(
      public readonly x: number,
      public readonly y: number,
      public readonly radius: number,
    ) {}
  }

  class HoistedMockPolygon {
    constructor(public readonly points: number[]) {}
  }

  class HoistedMockBitmapText extends HoistedMockContainer {
    text: string;

    style: unknown;

    anchor = new MockPoint();

    constructor(options: { text: string; style?: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
  }

  return {
    destroyManagedBitmapText: vi.fn(),
    MockBitmapText: HoistedMockBitmapText,
    MockContainer: HoistedMockContainer,
    MockCircle: HoistedMockCircle,
    MockGraphics: HoistedMockGraphics,
    MockPolygon: HoistedMockPolygon,
  };
});

vi.mock('pixi.js', () => ({
  Circle: MockCircle,
  Container: MockContainer,
  Graphics: MockGraphics,
  Polygon: MockPolygon,
}));

vi.mock('../../src/canvas/text/bitmap-font-registry.js', () => ({
  STROKE_LABEL_FONT_NAME: 'ludoforge-label-stroke',
}));

vi.mock('../../src/canvas/text/bitmap-text-runtime.js', () => ({
  createManagedBitmapText: (options: {
    text?: string;
    style: unknown;
    anchor?: { x: number; y: number };
    position?: { x: number; y: number };
    visible?: boolean;
    renderable?: boolean;
    parent?: InstanceType<typeof MockContainer>;
  }) => {
    const text = new MockBitmapText({ text: options.text ?? '', style: options.style });
    if (options.anchor !== undefined) {
      text.anchor.set(options.anchor.x, options.anchor.y);
    }
    if (options.position !== undefined) {
      text.position.set(options.position.x, options.position.y);
    }
    if (options.visible !== undefined) {
      text.visible = options.visible;
    }
    if (options.renderable !== undefined) {
      text.renderable = options.renderable;
    }
    text.eventMode = 'none';
    text.interactiveChildren = false;
    options.parent?.addChild(text);
    return text;
  },
  destroyManagedBitmapText,
}));

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { createEditorHandleRenderer } from '../../src/map-editor/map-editor-handle-renderer.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('createEditorHandleRenderer', () => {
  beforeEach(() => {
    destroyManagedBitmapText.mockClear();
  });

  it('renders no handles when no route is selected', () => {
    const fixture = createFixture();

    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const overlayRoot = fixture.handleLayer.children[1] as InstanceType<typeof MockContainer>;
    expect(root.eventMode).toBe('passive');
    expect(root.interactiveChildren).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(overlayRoot.children).toHaveLength(1);
    expect(overlayRoot.children[0]).toBeInstanceOf(MockBitmapText);
  });

  it('renders point handles, control handles, and tangent lines for the selected route', () => {
    const fixture = createFixture();

    const renderer = createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    expect(root.children).toHaveLength(5);

    const tangent = root.children[0] as InstanceType<typeof MockGraphics>;
    const zoneHandle = root.children[1] as InstanceType<typeof MockGraphics>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    const zoneHandleB = root.children[3] as InstanceType<typeof MockGraphics>;
    const controlHandle = root.children[4] as InstanceType<typeof MockGraphics>;

    expect(tangent.strokeStyle).toEqual({ color: 0xffffff, width: 1, alpha: 0.5 });
    expect(zoneHandle.fillStyle).toEqual({ color: 0xffffff, alpha: 1 });
    expect(anchorHandle.fillStyle).toEqual({ color: 0xffffff, alpha: 1 });
    expect(zoneHandleB.fillStyle).toEqual({ color: 0xffffff, alpha: 1 });
    expect(zoneHandle.eventMode).toBe('static');
    expect(zoneHandle.hitArea).toBeInstanceOf(MockCircle);
    expect(anchorHandle.hitArea).toBeInstanceOf(MockCircle);
    expect(anchorHandle.eventMode).toBe('static');
    expect(anchorHandle.cursor).toBe('grab');
    expect(anchorHandle.circleArgs).toEqual([0, 0, 8]);
    expect(anchorHandle.position).toEqual(expect.objectContaining({ x: 40, y: 20 }));
    expect(zoneHandle.cursor).toBe('grab');
    expect(zoneHandleB.eventMode).toBe('static');
    expect(zoneHandleB.hitArea).toBeInstanceOf(MockCircle);
    expect(controlHandle.eventMode).toBe('static');
    expect(controlHandle.hitArea).toBeInstanceOf(MockPolygon);
    expect(controlHandle.polyArgs).toEqual([0, -10, 10, 0, 0, 10, -10, 0]);
    expect(controlHandle.position).toEqual(expect.objectContaining({ x: 20, y: 0 }));

    fixture.store.getState().moveAnchor('anchor:mid', { x: 45, y: 25 });
    const updatedRoot = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const updatedAnchorHandle = updatedRoot.children[2] as InstanceType<typeof MockGraphics>;
    expect(updatedAnchorHandle.position).toEqual(expect.objectContaining({ x: 45, y: 25 }));

    renderer.destroy();
  });

  it('updates tangent graphics in place from preview geometry while dragging', () => {
    const fixture = createFixture();

    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const tangent = root.children[0] as InstanceType<typeof MockGraphics>;
    const controlHandle = root.children[4] as InstanceType<typeof MockGraphics>;

    fixture.store.getState().beginInteraction();
    fixture.store.getState().setDragging(true);
    fixture.store.getState().previewControlPointMove('route:road', 0, { x: 30, y: 10 });

    expect(root.children[0]).toBe(tangent);
    expect(root.children[4]).toBe(controlHandle);
    expect(tangent.moveToArgs).toEqual([[0, 0], [40, 20]]);
    expect(tangent.lineToArgs).toEqual([[30, 10], [30, 10]]);
  });

  it('still rebuilds handle graphics when document changes outside drag mode', () => {
    const fixture = createFixture();

    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const tangent = root.children[0] as InstanceType<typeof MockGraphics>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;

    fixture.store.getState().moveAnchor('anchor:mid', { x: 45, y: 25 });

    const updatedRoot = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    expect(updatedRoot.children[0]).not.toBe(tangent);
    expect(updatedRoot.children[2]).not.toBe(anchorHandle);
  });

  it('routes anchor drag interactions through the editor store', () => {
    const fixture = createFixture();
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    anchorHandle.emit('pointerdown', pointer(41, 21));
    dragSurface.emit('globalpointermove', pointer(51, 31));
    dragSurface.emit('pointerup');

    expect(fixture.store.getState().connectionAnchors.get('anchor:mid')).toEqual({ x: 50, y: 30 });
    expect(fixture.store.getState().undoStack).toHaveLength(1);
  });

  it('routes zone endpoint drag through linked endpoint anchoring by default', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const zoneHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    zoneHandle.emit('pointerdown', pointer(0, 0));
    dragSurface.emit('globalpointermove', pointer(50, 0));
    dragSurface.emit('pointerup');

    expect(fixture.store.getState().connectionRoutes.get('route:road')?.points[0]).toEqual({
      kind: 'zone',
      zoneId: 'zone:a',
      anchor: 0,
    });
    expect(fixture.store.getState().connectionAnchors.has('route:road:endpoint:zone:a:0')).toBe(false);
    expect(fixture.store.getState().undoStack).toHaveLength(1);
  });

  it('shows and clears an angle label for active zone-edge anchor drags only', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const overlayRoot = fixture.handleLayer.children[1] as InstanceType<typeof MockContainer>;
    const zoneHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    const angleLabel = overlayRoot.children[0] as InstanceType<typeof MockBitmapText>;

    expect(angleLabel.visible).toBe(false);
    expect(angleLabel.renderable).toBe(false);

    zoneHandle.emit('pointerdown', pointer(0, 0));
    dragSurface.emit('globalpointermove', pointer(0, -40));

    expect(angleLabel.text).toBe('90deg');
    expect(angleLabel.visible).toBe(true);
    expect(angleLabel.renderable).toBe(true);
    expect(angleLabel.position.x).toBe(18);
    expect(angleLabel.position.y).toBeLessThan(-40);

    dragSurface.emit('pointerup');

    expect(angleLabel.visible).toBe(false);
    expect(angleLabel.renderable).toBe(false);
  });

  it('hides the angle label after a zone-edge endpoint detaches into a free anchor', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a', anchor: 90 },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const overlayRoot = fixture.handleLayer.children[1] as InstanceType<typeof MockContainer>;
    const zoneHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    const angleLabel = overlayRoot.children[0] as InstanceType<typeof MockBitmapText>;

    zoneHandle.emit('pointerdown', pointer(0, -110));
    dragSurface.emit('globalpointermove', pointer(0, -90));

    expect(angleLabel.visible).toBe(true);
    expect(fixture.store.getState().dragPreview).toEqual({
      kind: 'zone-edge-anchor',
      routeId: 'route:road',
      pointIndex: 0,
      handlePosition: { x: 0, y: -50 },
      angle: 90,
    });

    dragSurface.emit('globalpointermove', pointer(800, -110));

    expect(fixture.store.getState().connectionRoutes.get('route:road')?.points[0]).toEqual({
      kind: 'anchor',
      anchorId: 'route:road:endpoint:zone:a:0',
    });
    expect(angleLabel.visible).toBe(false);
    expect(angleLabel.renderable).toBe(false);
  });

  it('does not show an angle label for control-point drags', () => {
    const fixture = createFixture();
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const overlayRoot = fixture.handleLayer.children[1] as InstanceType<typeof MockContainer>;
    const controlHandle = root.children[4] as InstanceType<typeof MockGraphics>;
    const angleLabel = overlayRoot.children[0] as InstanceType<typeof MockBitmapText>;

    controlHandle.emit('pointerdown', pointer(20, 0));
    dragSurface.emit('globalpointermove', pointer(40, 20));

    expect(fixture.store.getState().dragPreview).toBeNull();
    expect(angleLabel.visible).toBe(false);
    expect(angleLabel.renderable).toBe(false);
  });

  it('removes only non-endpoint anchor waypoints on right-click', () => {
    const fixture = createFixture();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: fixture.handleLayer as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');
    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    anchorHandle.emit('pointerdown', { button: 2, stopPropagation() {} });

    expect(fixture.store.getState().connectionRoutes.get('route:road')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(fixture.store.getState().connectionAnchors.has('anchor:mid')).toBe(false);
  });

  it('does not remove endpoint handles on right-click', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'anchor', anchorId: 'anchor:start' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
      connectionAnchors: {
        'anchor:start': { x: 0, y: 0 },
      },
    });
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: fixture.handleLayer as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');
    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const endpointHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    endpointHandle.emit('pointerdown', { button: 2, stopPropagation() {} });

    expect(fixture.store.getState().connectionRoutes.get('route:road')?.points).toHaveLength(2);
    expect(fixture.store.getState().connectionAnchors.has('anchor:start')).toBe(true);

  });

  it('releases active drag listeners when rerender tears down handle interactions', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });
    const dragSurface = new MockContainer();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
      { dragSurface: dragSurface as unknown as Container },
    );

    fixture.store.getState().selectRoute('route:road');
    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const zoneHandle = root.children[0] as InstanceType<typeof MockGraphics>;

    zoneHandle.emit('pointerdown', pointer(1, 1));

    expect(dragSurface.listenerCount('globalpointermove')).toBe(1);
    expect(dragSurface.listenerCount('pointerup')).toBe(1);
    expect(fixture.store.getState().isDragging).toBe(true);

    fixture.store.getState().selectRoute(null);

    expect(dragSurface.listenerCount('globalpointermove')).toBe(0);
    expect(dragSurface.listenerCount('pointerup')).toBe(0);
    expect(dragSurface.listenerCount('pointerupoutside')).toBe(0);
    expect(fixture.store.getState().isDragging).toBe(false);
    expect(fixture.store.getState().dragPreview).toBeNull();
  });

  it('positions anchored zone endpoint handles on the resolved zone edge', () => {
    const fixture = createFixture({
      overrides: {
        'zone:a': { shape: 'circle', width: 100, height: 100 },
        'zone:b': { shape: 'circle', width: 100, height: 100 },
      },
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a', anchor: 0 },
            { kind: 'zone', zoneId: 'zone:b', anchor: 180 },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });

    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const startHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    const endHandle = root.children[1] as InstanceType<typeof MockGraphics>;
    expect(startHandle.position).toEqual(expect.objectContaining({ x: 50, y: 0 }));
    expect(endHandle.position).toEqual(expect.objectContaining({ x: 30, y: 0 }));
  });

  it('destroys the managed angle label when the renderer is destroyed', () => {
    const fixture = createFixture();

    const renderer = createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    renderer.destroy();

    expect(destroyManagedBitmapText).toHaveBeenCalledTimes(1);
  });
});

function createFixture(overrides?: Partial<NonNullable<VisualConfig['zones']>>) {
  const gameDef = {
    metadata: {
      id: 'editor-test',
      players: { min: 1, max: 4 },
    },
    zones: [{ id: 'zone:a' }, { id: 'zone:b' }, { id: 'route:road' }],
  } as unknown as GameDef;
  const handleLayer = new MockContainer();
  const store = createMapEditorStore(
    gameDef,
    {
      version: 1,
      zones: {
        connectionAnchors: {
          'anchor:mid': { x: 40, y: 20 },
          ...overrides?.connectionAnchors,
        },
        connectionRoutes: {
          'route:road': {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'anchor', anchorId: 'anchor:mid' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'position', x: 20, y: 0 } },
              { kind: 'straight' },
            ],
          },
          ...overrides?.connectionRoutes,
        },
        ...overrides,
      },
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
      ['zone:b', { x: 80, y: 0 }],
      ['route:road', { x: 40, y: 0 }],
    ]),
  );

  return {
    gameDef,
    handleLayer,
    provider: new VisualConfigProvider(store.getState().originalVisualConfig),
    store,
  };
}

function pointer(x: number, y: number) {
  return {
    button: 0,
    getLocalPosition() {
      return { x, y };
    },
    stopPropagation() {},
  };
}
