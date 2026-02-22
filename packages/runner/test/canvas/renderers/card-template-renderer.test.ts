import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

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

  class HoistedMockText {
    text: string;

    style: Record<string, unknown>;

    position = new MockPoint();

    anchor = new MockAnchor();

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    visible = true;

    renderable = true;

    parent: HoistedMockContainer | null = null;

    destroy = vi.fn();

    removeFromParent = vi.fn();

    constructor(options: { text: string; style: Record<string, unknown> }) {
      this.text = options.text;
      this.style = options.style;
    }
  }

  class HoistedMockContainer {
    children: HoistedMockText[] = [];

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    addChild(...children: HoistedMockText[]): void {
      for (const child of children) {
        child.parent = this;
      }
      this.children.push(...children);
    }

    removeChildren(): HoistedMockText[] {
      const removed = this.children;
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
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

import { drawCardContent, destroyCardContentPool } from '../../../src/canvas/renderers/card-template-renderer';

describe('drawCardContent', () => {
  it('renders configured fields at configured y positions', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
          suit: { y: 36, fontSize: 18, align: 'center' },
        },
      },
      {
        rank: 'A',
        suit: 'Spades',
      },
    );

    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.text).toBe('A');
    expect(container.children[0]?.position.y).toBe(-26);
    expect(container.children[1]?.text).toBe('Spades');
    expect(container.children[1]?.position.y).toBe(2);
    expect(container.children[1]?.anchor.x).toBe(0.5);
  });

  it('reuses same Text instance across calls instead of destroying', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
        },
      },
      { rank: 'A' },
    );

    const firstSlot = container.children[0];
    expect(firstSlot?.text).toBe('A');

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
        },
      },
      { rank: 'K' },
    );

    expect(container.children).toHaveLength(1);
    expect(container.children[0]).toBe(firstSlot);
    expect(container.children[0]?.text).toBe('K');
    expect(firstSlot?.destroy).not.toHaveBeenCalled();
  });

  it('hides excess slots when field count decreases (no destroy)', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
          suit: { y: 36, fontSize: 18, align: 'center' },
        },
      },
      { rank: 'A', suit: 'Spades' },
    );

    expect(container.children).toHaveLength(2);
    const secondSlot = container.children[1];

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
        },
      },
      { rank: 'K' },
    );

    expect(container.children[0]?.text).toBe('K');
    expect(secondSlot?.destroy).not.toHaveBeenCalled();
    expect(secondSlot?.visible).toBe(false);
    expect(secondSlot?.renderable).toBe(false);
  });

  it('shows hidden slots when field count increases', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
          suit: { y: 36, fontSize: 18, align: 'center' },
        },
      },
      { rank: 'A', suit: 'Spades' },
    );

    const secondSlot = container.children[1];

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
        },
      },
      { rank: 'K' },
    );

    expect(secondSlot?.visible).toBe(false);

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
          suit: { y: 36, fontSize: 18, align: 'center' },
        },
      },
      { rank: 'Q', suit: 'Hearts' },
    );

    expect(secondSlot?.visible).toBe(true);
    expect(secondSlot?.renderable).toBe(true);
    expect(secondSlot?.text).toBe('Hearts');
  });

  it('resets wordWrap when field without wrap replaces field with wrap', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 60,
        height: 80,
        layout: {
          title: { y: 10, wrap: 44, align: 'left' },
        },
      },
      { title: 'Hello World' },
    );

    expect(container.children[0]?.style.wordWrap).toBe(true);
    expect(container.children[0]?.style.wordWrapWidth).toBe(44);

    drawCardContent(
      container as unknown as Container,
      {
        width: 60,
        height: 80,
        layout: {
          title: { y: 10, align: 'left' },
        },
      },
      { title: 'Short' },
    );

    expect(container.children[0]?.style.wordWrap).toBe(false);
    expect(container.children[0]?.style.wordWrapWidth).toBe(0);
  });

  it('skips missing fields and applies wrap/alignment options', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 60,
        height: 80,
        layout: {
          title: { y: 10, wrap: 44, align: 'right' },
          body: { y: 26, wrap: 40 },
        },
      },
      {
        title: 'Hello',
      },
    );

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.text).toBe('Hello');
    expect(container.children[0]?.anchor.x).toBe(1);
    expect(container.children[0]?.style.wordWrap).toBe(true);
    expect(container.children[0]?.style.wordWrapWidth).toBe(44);
  });

  it('reads from sourceField when field key and data key differ', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rankCorner: { y: 4, align: 'left', sourceField: 'rankName' },
        },
      },
      {
        rankName: 'Q',
      },
    );

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.text).toBe('Q');
  });

  it('applies symbolMap transforms and leaves unmapped values unchanged', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          mappedSuit: {
            y: 20,
            align: 'center',
            sourceField: 'suitName',
            symbolMap: { Hearts: '♥' },
          },
          unmappedSuit: {
            y: 36,
            align: 'center',
            sourceField: 'suitName',
            symbolMap: { Spades: '♠' },
          },
        },
      },
      {
        suitName: 'Hearts',
      },
    );

    expect(container.children).toHaveLength(2);
    expect(container.children[0]?.text).toBe('♥');
    expect(container.children[1]?.text).toBe('Hearts');
  });

  it('applies colorFromProp and colorMap when both are provided', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rankCorner: {
            y: 4,
            align: 'left',
            sourceField: 'rankName',
            colorFromProp: 'suitName',
            colorMap: {
              Hearts: '#dc2626',
              Spades: '#1e293b',
            },
          },
        },
      },
      {
        rankName: 'A',
        suitName: 'Hearts',
      },
    );

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.style.fill).toBe('#dc2626');
  });

  it('falls back to default white when colorFromProp does not resolve', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rankCorner: {
            y: 4,
            align: 'left',
            sourceField: 'rankName',
            colorFromProp: 'missingSuitName',
            colorMap: {
              Hearts: '#dc2626',
            },
          },
        },
      },
      {
        rankName: 'A',
        suitName: 'Hearts',
      },
    );

    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.style.fill).toBe('#f8fafc');
  });

  it('applies x offset on top of alignment anchor position', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rankCorner: { y: 4, align: 'left', x: 6 },
          suitCenter: { y: 20, align: 'center', x: -5 },
          rankBottom: { y: 52, align: 'right', x: -4 },
        },
      },
      {
        rankCorner: 'A',
        suitCenter: '♠',
        rankBottom: 'A',
      },
    );

    expect(container.children).toHaveLength(3);
    expect(container.children[0]?.position.x).toBe(-15);
    expect(container.children[1]?.position.x).toBe(-5);
    expect(container.children[2]?.position.x).toBe(17);
  });
});

describe('destroyCardContentPool', () => {
  it('destroys pool slots when teardown is called', () => {
    const container = new MockContainer();

    drawCardContent(
      container as unknown as Container,
      {
        width: 48,
        height: 68,
        layout: {
          rank: { y: 8, fontSize: 14, align: 'left' },
        },
      },
      { rank: 'A' },
    );

    const slot = container.children[0];

    destroyCardContentPool(container as unknown as Container);

    expect(slot?.destroy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for containers without a pool', () => {
    const container = new MockContainer();

    expect(() => destroyCardContentPool(container as unknown as Container)).not.toThrow();
  });
});
