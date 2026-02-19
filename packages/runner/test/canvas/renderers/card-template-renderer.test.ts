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

  class HoistedMockContainer {
    children: HoistedMockText[] = [];

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    addChild(...children: HoistedMockText[]): void {
      this.children.push(...children);
    }

    removeChildren(): void {
      this.children = [];
    }
  }

  class HoistedMockText {
    text: string;

    style: Record<string, unknown>;

    position = new MockPoint();

    anchor = new MockAnchor();

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    constructor(options: { text: string; style: Record<string, unknown> }) {
      this.text = options.text;
      this.style = options.style;
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

import { drawCardContent } from '../../../src/canvas/renderers/card-template-renderer';

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
});
