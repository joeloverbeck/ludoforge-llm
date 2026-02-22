import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CARD_TEXT_COLOR,
  resolveCardFieldDisplayText,
  resolveCardFieldTextColor,
  resolveCardTemplateFields,
} from '../../src/config/card-field-resolver.js';

describe('card-field-resolver', () => {
  it('resolves sourceField and symbolMap', () => {
    const text = resolveCardFieldDisplayText(
      'suit',
      {
        sourceField: 'suitName',
        symbolMap: { Hearts: '♥' },
      },
      { suitName: 'Hearts' },
    );

    expect(text).toBe('♥');
  });

  it('falls back to unmapped display text', () => {
    const text = resolveCardFieldDisplayText(
      'rank',
      {
        sourceField: 'rankName',
        symbolMap: { Jack: 'J' },
      },
      { rankName: 'Ace' },
    );

    expect(text).toBe('Ace');
  });

  it('resolves color from colorFromProp and colorMap', () => {
    const color = resolveCardFieldTextColor(
      {
        colorFromProp: 'suitName',
        colorMap: {
          Hearts: '#dc2626',
          Spades: '#1e293b',
        },
      },
      { suitName: 'Hearts' },
    );

    expect(color).toBe('#dc2626');
  });

  it('falls back to default color when color fields are missing', () => {
    const color = resolveCardFieldTextColor(
      {
        colorFromProp: 'suitName',
        colorMap: { Hearts: '#dc2626' },
      },
      {},
    );

    expect(color).toBe(DEFAULT_CARD_TEXT_COLOR);
  });

  it('resolves layout entries with defaults and skips absent fields', () => {
    const fields = resolveCardTemplateFields(
      {
        rankCorner: {
          y: 4,
          sourceField: 'rankName',
        },
        suitCenter: {
          y: 20,
          align: 'center',
          sourceField: 'suitName',
          symbolMap: { Spades: '♠' },
        },
        missing: {
          y: 10,
          sourceField: 'notThere',
        },
      },
      {
        rankName: 'A',
        suitName: 'Spades',
      },
    );

    expect(fields).toEqual([
      {
        fieldName: 'rankCorner',
        align: 'left',
        x: 0,
        y: 4,
        fontSize: 11,
        wrap: undefined,
        text: 'A',
        color: DEFAULT_CARD_TEXT_COLOR,
      },
      {
        fieldName: 'suitCenter',
        align: 'center',
        x: 0,
        y: 20,
        fontSize: 11,
        wrap: undefined,
        text: '♠',
        color: DEFAULT_CARD_TEXT_COLOR,
      },
    ]);
  });

  it('resolves all three poker card fields with suit-based colors matching visual-config', () => {
    const colorMap: Record<string, string> = {
      Spades: '#1e293b',
      Hearts: '#dc2626',
      Diamonds: '#dc2626',
      Clubs: '#1e293b',
    };
    const symbolMap: Record<string, string> = {
      Spades: '♠',
      Hearts: '♥',
      Diamonds: '♦',
      Clubs: '♣',
    };

    const fields = resolveCardTemplateFields(
      {
        rankCorner: {
          y: 4,
          x: 4,
          fontSize: 9,
          align: 'left',
          sourceField: 'rankName',
          colorFromProp: 'suitName',
          colorMap,
        },
        suitCenter: {
          y: 20,
          fontSize: 18,
          align: 'center',
          sourceField: 'suitName',
          symbolMap,
          colorFromProp: 'suitName',
          colorMap,
        },
        rankBottom: {
          y: 52,
          x: -4,
          fontSize: 9,
          align: 'right',
          sourceField: 'rankName',
          colorFromProp: 'suitName',
          colorMap,
        },
      },
      { rankName: '2', suitName: 'Spades' },
    );

    expect(fields).toHaveLength(3);
    expect(fields[0]).toEqual({
      fieldName: 'rankCorner',
      align: 'left',
      x: 4,
      y: 4,
      fontSize: 9,
      wrap: undefined,
      text: '2',
      color: '#1e293b',
    });
    expect(fields[1]).toEqual({
      fieldName: 'suitCenter',
      align: 'center',
      x: 0,
      y: 20,
      fontSize: 18,
      wrap: undefined,
      text: '♠',
      color: '#1e293b',
    });
    expect(fields[2]).toEqual({
      fieldName: 'rankBottom',
      align: 'right',
      x: -4,
      y: 52,
      fontSize: 9,
      wrap: undefined,
      text: '2',
      color: '#1e293b',
    });
  });
});
