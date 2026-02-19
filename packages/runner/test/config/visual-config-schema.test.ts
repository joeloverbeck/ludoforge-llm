import { describe, expect, it } from 'vitest';

import { VisualConfigSchema } from '../../src/config/visual-config-types';

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
              position: 'top-left',
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
      tokenTypes: {
        'us-troops': { shape: 'cube', color: '#e63946', size: 24 },
      },
      animations: {
        actions: {
          bombard: 'explosion',
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

  it('rejects invalid version', () => {
    const result = VisualConfigSchema.safeParse({ version: 2 });
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
});
