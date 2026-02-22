import { Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createEphemeralContainerFactory,
  type EphemeralContainerFactoryOptions,
} from '../../src/animation/ephemeral-container-factory';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createEphemeralContainerFactory', () => {
  it('creates a Container with card-back graphics and adds to parent', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const container = factory.create('tok:missing-1');

    expect(container).toBeInstanceOf(Container);
    expect(parent.children).toContain(container);
    // Should have at least one Graphics child for the card-back visual
    const graphicsChildren = container.children.filter((c) => c instanceof Graphics);
    expect(graphicsChildren.length).toBeGreaterThanOrEqual(1);
  });

  it('sets alpha=0 on created containers', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const container = factory.create('tok:hidden');

    expect(container.alpha).toBe(0);
  });

  it('destroyAll removes containers from parent and destroys them', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const c1 = factory.create('tok:a');
    const c2 = factory.create('tok:b');

    expect(parent.children).toContain(c1);
    expect(parent.children).toContain(c2);

    factory.destroyAll();

    expect(parent.children).not.toContain(c1);
    expect(parent.children).not.toContain(c2);
  });

  it('tracks multiple created containers independently', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const c1 = factory.create('tok:x');
    const c2 = factory.create('tok:y');
    const c3 = factory.create('tok:z');

    expect(c1).not.toBe(c2);
    expect(c2).not.toBe(c3);
    expect(parent.children.length).toBe(3);
  });

  it('uses provided cardWidth and cardHeight for created containers', () => {
    const parent = new Container();
    const options: EphemeralContainerFactoryOptions = { cardWidth: 48, cardHeight: 68 };
    const factory = createEphemeralContainerFactory(parent, options);

    const container = factory.create('tok:custom-size');

    const graphicsChild = container.children.find((c) => c instanceof Graphics) as Graphics;
    expect(graphicsChild).toBeDefined();
    const bounds = graphicsChild.getLocalBounds();
    // Custom (48×68) should be larger than default (24×34); stroke adds ~1.5 to each dimension
    expect(bounds.width).toBeGreaterThan(47);
    expect(bounds.width).toBeLessThan(51);
    expect(bounds.height).toBeGreaterThan(67);
    expect(bounds.height).toBeLessThan(71);
  });

  it('creates containers with back and front Graphics children', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const container = factory.create('tok:faces');

    const backChild = container.getChildByLabel('back');
    const frontChild = container.getChildByLabel('front');
    expect(backChild).toBeInstanceOf(Graphics);
    expect(frontChild).toBeInstanceOf(Graphics);
  });

  it('front child is initially hidden and back child is visible', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const container = factory.create('tok:visibility');

    const backChild = container.getChildByLabel('back');
    const frontChild = container.getChildByLabel('front');
    expect(backChild!.visible).toBe(true);
    expect(frontChild!.visible).toBe(false);
  });

  it('falls back to default dimensions when no options provided', () => {
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const container = factory.create('tok:default-size');

    const graphicsChild = container.children.find((c) => c instanceof Graphics) as Graphics;
    expect(graphicsChild).toBeDefined();
    const bounds = graphicsChild.getLocalBounds();
    // Default CARD_WIDTH=24, CARD_HEIGHT=34; stroke adds ~1.5 to each dimension
    expect(bounds.width).toBeGreaterThan(23);
    expect(bounds.width).toBeLessThan(27);
    expect(bounds.height).toBeGreaterThan(33);
    expect(bounds.height).toBeLessThan(37);
  });
});
