// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import { MiniCard } from '../../src/ui/MiniCard.js';
import type { CardTemplate } from '../../src/config/visual-config-types.js';
import styles from '../../src/ui/MiniCard.module.css';

afterEach(() => {
  cleanup();
});

const TEMPLATE: CardTemplate = {
  width: 48,
  height: 68,
  layout: {
    rankCorner: {
      y: 4,
      x: 4,
      sourceField: 'rankName',
      colorFromProp: 'suitName',
      colorMap: {
        Hearts: '#dc2626',
        Spades: '#1e293b',
      },
    },
    suitCenter: {
      y: 20,
      align: 'center',
      sourceField: 'suitName',
      symbolMap: {
        Hearts: '♥',
        Spades: '♠',
      },
      colorFromProp: 'suitName',
      colorMap: {
        Hearts: '#dc2626',
        Spades: '#1e293b',
      },
    },
  },
};

describe('MiniCard', () => {
  it('renders template-driven fields for face-up cards', () => {
    render(createElement(MiniCard, {
      token: {
        id: 'card-1',
        type: 'card-AS',
        zoneID: 'hand:0',
        ownerID: asPlayerId(0),
        factionId: null,
        faceUp: true,
        properties: {
          rankName: 'A',
          suitName: 'Spades',
        },
        isSelectable: false,
        isSelected: false,
      },
      template: TEMPLATE,
    }));

    expect(screen.getByTestId('mini-card-card-1')).toBeDefined();
    expect(screen.getByTestId('mini-card-field-card-1-rankCorner').textContent).toBe('A');
    expect(screen.getByTestId('mini-card-field-card-1-suitCenter').textContent).toBe('♠');

    const miniCardStyle = screen.getByTestId('mini-card-card-1').getAttribute('style') ?? '';
    expect(miniCardStyle).toContain('width: 56px');
    expect(miniCardStyle).toContain('height: 80px');
  });

  it('applies mapped suit color to rendered fields', () => {
    render(createElement(MiniCard, {
      token: {
        id: 'card-2',
        type: 'card-AH',
        zoneID: 'hand:0',
        ownerID: asPlayerId(0),
        factionId: null,
        faceUp: true,
        properties: {
          rankName: 'A',
          suitName: 'Hearts',
        },
        isSelectable: false,
        isSelected: false,
      },
      template: TEMPLATE,
    }));

    const rankFieldStyle = screen.getByTestId('mini-card-field-card-2-rankCorner').getAttribute('style') ?? '';
    expect(rankFieldStyle).toContain('color: rgb(220, 38, 38)');
  });

  it('renders back styling for face-down cards', () => {
    render(createElement(MiniCard, {
      token: {
        id: 'card-3',
        type: 'card-XX',
        zoneID: 'hand:0',
        ownerID: asPlayerId(0),
        factionId: null,
        faceUp: false,
        properties: {},
        isSelectable: false,
        isSelected: false,
      },
      template: TEMPLATE,
    }));

    const miniCard = screen.getByTestId('mini-card-card-3');
    expect(miniCard.className).toContain(styles.cardBack);
    const miniCardStyle = miniCard.getAttribute('style') ?? '';
    expect(miniCardStyle).toContain('width: 56px');
    expect(miniCardStyle).toContain('height: 80px');
    expect(screen.queryByTestId('mini-card-field-card-3-rankCorner')).toBeNull();
  });

  it('scales field coordinates based on mini card dimensions', () => {
    const scaledTemplate: CardTemplate = {
      width: 28,
      height: 40,
      layout: {
        rankCorner: {
          y: 5,
          x: 4,
          sourceField: 'rankName',
        },
      },
    };

    render(createElement(MiniCard, {
      token: {
        id: 'card-4',
        type: 'card-4',
        zoneID: 'hand:0',
        ownerID: asPlayerId(0),
        factionId: null,
        faceUp: true,
        properties: {
          rankName: 'Q',
        },
        isSelectable: false,
        isSelected: false,
      },
      template: scaledTemplate,
    }));

    const fieldStyle = screen.getByTestId('mini-card-field-card-4-rankCorner').getAttribute('style') ?? '';
    expect(fieldStyle).toContain('left: 14px');
    expect(fieldStyle).toContain('top: 10px');
    expect(fieldStyle).toContain('font-size: 22px');
  });
});
