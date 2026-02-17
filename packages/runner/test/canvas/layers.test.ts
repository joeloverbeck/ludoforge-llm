import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';

import { createLayerHierarchy } from '../../src/canvas/layers';

describe('createLayerHierarchy', () => {
  it('returns all named containers with expected event modes', () => {
    const stage = new Container();

    const layers = createLayerHierarchy(stage);

    expect(layers).toMatchObject({
      boardGroup: expect.any(Container),
      adjacencyLayer: expect.any(Container),
      zoneLayer: expect.any(Container),
      tokenGroup: expect.any(Container),
      effectsGroup: expect.any(Container),
      interfaceGroup: expect.any(Container),
      hudGroup: expect.any(Container),
    });

    expect(layers.boardGroup.eventMode).toBe('static');
    expect(layers.tokenGroup.eventMode).toBe('static');
    expect(layers.effectsGroup.eventMode).toBe('none');
    expect(layers.interfaceGroup.eventMode).toBe('none');
  });

  it('places adjacency and zone layers inside board group in order', () => {
    const stage = new Container();

    const layers = createLayerHierarchy(stage);

    expect(layers.adjacencyLayer.parent).toBe(layers.boardGroup);
    expect(layers.zoneLayer.parent).toBe(layers.boardGroup);
    expect(layers.boardGroup.children[0]).toBe(layers.adjacencyLayer);
    expect(layers.boardGroup.children[1]).toBe(layers.zoneLayer);
  });

  it('adds HUD to stage directly and preserves layer order for viewport content layers', () => {
    const stage = new Container();

    const layers = createLayerHierarchy(stage);
    const stageChildren = stage.children;

    expect(layers.hudGroup.parent).toBe(stage);
    expect(stageChildren).toContain(layers.hudGroup);
    expect(stageChildren[0]).toBe(layers.boardGroup);
    expect(stageChildren[1]).toBe(layers.tokenGroup);
    expect(stageChildren[2]).toBe(layers.effectsGroup);
    expect(stageChildren[3]).toBe(layers.interfaceGroup);
  });
});
