import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';

import { createLayerHierarchy } from '../../src/canvas/layers';

describe('createLayerHierarchy', () => {
  it('returns all named containers with expected event modes', () => {
    const layers = createLayerHierarchy();

    expect(layers).toMatchObject({
      boardGroup: expect.any(Container),
      backgroundLayer: expect.any(Container),
      adjacencyLayer: expect.any(Container),
      zoneLayer: expect.any(Container),
      tableOverlayLayer: expect.any(Container),
      tokenGroup: expect.any(Container),
      effectsGroup: expect.any(Container),
      interfaceGroup: expect.any(Container),
      hudGroup: expect.any(Container),
    });

    expect(layers.boardGroup.eventMode).toBe('passive');
    expect(layers.tokenGroup.eventMode).toBe('passive');
    expect(layers.zoneLayer.eventMode).toBe('passive');
    expect(layers.effectsGroup.eventMode).toBe('none');
    expect(layers.interfaceGroup.eventMode).toBe('none');
  });

  it('places board-space layers inside board group in order', () => {
    const layers = createLayerHierarchy();

    expect(layers.backgroundLayer.parent).toBe(layers.boardGroup);
    expect(layers.adjacencyLayer.parent).toBe(layers.boardGroup);
    expect(layers.zoneLayer.parent).toBe(layers.boardGroup);
    expect(layers.tableOverlayLayer.parent).toBe(layers.boardGroup);
    expect(layers.boardGroup.children[0]).toBe(layers.backgroundLayer);
    expect(layers.boardGroup.children[1]).toBe(layers.adjacencyLayer);
    expect(layers.boardGroup.children[2]).toBe(layers.zoneLayer);
    expect(layers.boardGroup.children[3]).toBe(layers.tableOverlayLayer);
  });

  it('returns detached root layers so viewport setup is the single attach point', () => {
    const layers = createLayerHierarchy();

    expect(layers.boardGroup.parent).toBeNull();
    expect(layers.tokenGroup.parent).toBeNull();
    expect(layers.effectsGroup.parent).toBeNull();
    expect(layers.interfaceGroup.parent).toBeNull();
    expect(layers.hudGroup.parent).toBeNull();
  });
});
