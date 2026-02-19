import { describe, expect, it } from 'vitest';

import { CompassPositionSchema, VisualConfigSchema } from '../../src/config/visual-config-types';

describe('VisualConfigSchema', () => {
  it('parses a valid FITL-shaped config', () => {
    const config = {
      version: 1,
      layout: {
        mode: 'graph',
        hints: {
          regions: [
            {
              name: 'North Vietnam',
              zones: ['hanoi:none', 'haiphong:none'],
              position: 'nw',
            },
          ],
          fixed: [
            { zone: 'available-forces-us:none', x: -200, y: 400 },
          ],
        },
      },
      factions: {
        us: { color: '#e63946', displayName: 'United States' },
      },
      zones: {
        categoryStyles: {
          city: { shape: 'circle', width: 90, height: 90, color: '#5b7fa5' },
        },
        attributeRules: [
          {
            match: {
              category: ['province'],
              attributeContains: { terrainTags: 'highland' },
            },
            style: { color: '#6b5b3e' },
          },
        ],
        overrides: {
          'hue:none': { label: 'Hue', color: '#888888' },
        },
        layoutRoles: {
          deck: 'card',
          'available-US': 'forcePool',
        },
      },
      edges: {
        default: { color: '#6b7280', width: 1.5, alpha: 0.3 },
        highlighted: { color: '#93c5fd', width: 3, alpha: 0.7 },
        categoryStyles: {
          loc: { color: '#8b7355', width: 2 },
        },
      },
      tokenTypes: {
        'us-troops': { shape: 'cube', color: '#e63946', size: 24 },
      },
      animations: {
        actions: {
          moveToken: 'pulse',
        },
      },
      cards: {
        templates: {
          'event-card': {
            width: 200,
            height: 300,
            layout: {
              title: { y: 20, fontSize: 16, align: 'center' },
            },
          },
        },
      },
      variables: {
        prominent: ['resources-us'],
        panels: [{ name: 'Faction Resources', vars: ['resources-us', 'resources-arvn'] }],
        formatting: {
          support: {
            type: 'track',
            min: -2,
            max: 2,
            labels: ['A', 'B', 'C', 'D', 'E'],
          },
        },
      },
    };

    const result = VisualConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("parses a valid Texas Hold'em-shaped config", () => {
    const config = {
      version: 1,
      layout: { mode: 'table' },
      cardAnimation: {
        cardTokenTypes: {
          idPrefixes: ['card-'],
        },
        zoneRoles: {
          draw: ['deck:none'],
          hand: ['hand:0', 'hand:1'],
          shared: ['community:none'],
          burn: ['burn:none'],
          discard: ['muck:none'],
        },
      },
    };

    const result = VisualConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('parses a minimal config with only version', () => {
    const result = VisualConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('parses edges config when present', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      edges: {
        default: { color: '#6b7280', width: 1.5, alpha: 0.3 },
        highlighted: { color: '#93c5fd', width: 3, alpha: 0.7 },
        categoryStyles: { loc: { color: '#8b7355' } },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = VisualConfigSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown animation override keys', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        actions: {
          sweep: 'scan',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid zone shape', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        categoryStyles: {
          city: { shape: 'star' },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts beveled-cylinder as a valid token shape', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        'us-irregulars': { shape: 'beveled-cylinder' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts token backSymbol in token type visual style', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        hidden: { shape: 'card', symbol: 'diamond', backSymbol: 'cross' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts cards template assignments by token selectors', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      cards: {
        assignments: [
          {
            match: { idPrefixes: ['card-'] },
            template: 'poker-card',
          },
        ],
        templates: {
          'poker-card': {
            width: 48,
            height: 68,
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('keeps token backSymbol optional', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        open: { shape: 'cube', symbol: 'star' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts conditional token symbol rules', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        guerrilla: {
          symbolRules: [
            {
              when: [{ prop: 'activity', equals: 'active' }],
              symbol: 'star',
            },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects symbol rules that define no symbol fields', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        guerrilla: {
          symbolRules: [
            {
              when: [{ prop: 'activity', equals: 'active' }],
            },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid layout mode', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      layout: {
        mode: 'freeform',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed attributeRules missing match or style', () => {
    const missingMatch = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        attributeRules: [{ style: { color: '#fff' } }],
      },
    });

    const missingStyle = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        attributeRules: [{ match: { category: ['city'] } }],
      },
    });

    expect(missingMatch.success).toBe(false);
    expect(missingStyle.success).toBe(false);
  });

  it('rejects cardAnimation when zoneRoles are missing', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      cardAnimation: {
        cardTokenTypes: { ids: ['card'] },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts all 9 compass position values', () => {
    for (const position of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'center']) {
      const result = CompassPositionSchema.safeParse(position);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid compass position values', () => {
    for (const position of ['top-left', 'north', 'up', 'bottom-right', '']) {
      const result = CompassPositionSchema.safeParse(position);
      expect(result.success).toBe(false);
    }
  });

  it('accepts region hints with missing position (optional)', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      layout: {
        hints: {
          regions: [
            { name: 'Region A', zones: ['zone-a'] },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects region hints with invalid compass position', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      layout: {
        hints: {
          regions: [
            { name: 'Region A', zones: ['zone-a'], position: 'top-left' },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
