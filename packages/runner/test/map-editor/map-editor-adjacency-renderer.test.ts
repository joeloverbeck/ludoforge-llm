import { describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockGraphics,
} = vi.hoisted(() => {
  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    visible = true;

    renderable = true;

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    addChild(...children: HoistedMockContainer[]): void {
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
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    segments: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];

    strokeStyle: unknown;

    private currentFrom: { x: number; y: number } | null = null;

    clear(): this {
      this.segments = [];
      this.strokeStyle = undefined;
      this.currentFrom = null;
      return this;
    }

    moveTo(x: number, y: number): this {
      this.currentFrom = { x, y };
      return this;
    }

    lineTo(x: number, y: number): this {
      if (this.currentFrom !== null) {
        this.segments.push({ from: this.currentFrom, to: { x, y } });
      }
      this.currentFrom = null;
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
}));

import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { createEditorAdjacencyRenderer } from '../../src/map-editor/map-editor-adjacency-renderer.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('createEditorAdjacencyRenderer', () => {
  it('renders one line per undirected board adjacency pair and skips aux/internal/self edges', () => {
    const fixture = createFixture();

    createEditorAdjacencyRenderer(fixture.layer as unknown as Container, fixture.store);

    const graphics = fixture.layer.children[0] as InstanceType<typeof MockGraphics>;
    expect(fixture.layer.eventMode).toBe('none');
    expect(graphics.eventMode).toBe('none');
    expect(graphics.interactiveChildren).toBe(false);
    expect(graphics.segments).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);
    expect(graphics.strokeStyle).toEqual({
      color: 0xffffff,
      width: 4,
      alpha: 0.9,
    });
  });

  it('redraws adjacency line endpoints when zone positions change', () => {
    const fixture = createFixture();
    createEditorAdjacencyRenderer(fixture.layer as unknown as Container, fixture.store);

    const graphics = fixture.layer.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.segments[0]).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 50, y: 50 },
    });

    fixture.store.getState().moveZone('board:b', { x: 80, y: 90 });

    expect(graphics.segments[0]).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 80, y: 90 },
    });
  });

  it('removes its graphics object on destroy', () => {
    const fixture = createFixture();
    const renderer = createEditorAdjacencyRenderer(fixture.layer as unknown as Container, fixture.store);

    expect(fixture.layer.children).toHaveLength(1);
    renderer.destroy();

    expect(fixture.layer.children).toHaveLength(0);
  });
});

function createFixture() {
  const layer = new MockContainer();
  layer.eventMode = 'none';
  layer.interactiveChildren = false;
  const store = createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [
        { id: 'board:a', zoneKind: 'board', adjacentTo: [{ to: 'board:b' }, { to: 'board:b' }, { to: 'board:a' }] },
        { id: 'board:b', zoneKind: 'board', adjacentTo: [{ to: 'board:a' }] },
        { id: 'aux:x', zoneKind: 'aux', adjacentTo: [{ to: 'board:a' }] },
        { id: 'internal:y', zoneKind: 'board', isInternal: true, adjacentTo: [{ to: 'board:a' }] },
      ],
    } as unknown as GameDef,
    {
      layout: {},
      zones: {},
    } as VisualConfig,
    new Map([
      ['board:a', { x: 0, y: 0 }],
      ['board:b', { x: 50, y: 50 }],
      ['aux:x', { x: 100, y: 100 }],
      ['internal:y', { x: 150, y: 150 }],
    ]),
  );

  return {
    layer,
    store,
  };
}
