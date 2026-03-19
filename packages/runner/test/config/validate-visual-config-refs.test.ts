import type { GameDef } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import {
  buildRefValidationContext,
  validateAndCreateProvider,
  validateVisualConfigRefs,
  type VisualConfigRefValidationContext,
} from '../../src/config/validate-visual-config-refs';
import type { VisualConfig } from '../../src/config/visual-config-types';

describe('validate-visual-config-refs', () => {
  it('returns no errors when all configured references exist', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        overrides: { 'zone:a': { label: 'A' } },
        layoutRoles: { 'zone:b': 'hand' },
        tokenLayouts: {
          presets: {
            'fitl-map-space': {
              mode: 'lanes',
              laneGap: 24,
              laneOrder: ['regular', 'base'],
              lanes: {
                regular: {
                  anchor: 'center',
                  pack: 'centeredRow',
                  spacingX: 32,
                },
                base: {
                  anchor: 'belowPreviousLane',
                  pack: 'centeredRow',
                  spacingX: 42,
                },
              },
            },
          },
          assignments: {
            byCategory: {
              city: 'fitl-map-space',
            },
          },
        },
      },
      tableOverlays: {
        playerSeatAnchorZones: ['zone:a'],
      },
      layout: {
        hints: {
          fixed: [{ zone: 'zone:a', x: 0, y: 0 }],
          regions: [{ name: 'n', zones: ['zone:a', 'zone:b'] }],
        },
      },
      tokenTypes: {
        tokenA: {
          shape: 'circle',
          presentation: {
            lane: 'regular',
            scale: 1,
          },
        },
      },
      factions: {
        factionA: { color: '#111111' },
      },
      cardAnimation: {
        cardTokenTypes: { ids: ['tokenA'] },
        zoneRoles: {
          draw: ['zone:a'],
          hand: ['zone:b'],
          shared: [],
          burn: [],
          discard: [],
        },
      },
      edges: {
        categoryStyles: {
          road: { color: '#aaaaaa' },
        },
      },
    };

    expect(validateVisualConfigRefs(config, fixtureContext())).toEqual([]);
  });

  it('collects multiple reference errors across categories', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        overrides: {
          'missing:zone': { label: 'oops' },
        },
        tokenLayouts: {
          assignments: {
            byCategory: {
              jungle: 'fitl-map-space',
            },
          },
        },
      },
      tokenTypes: {
        missingToken: { shape: 'circle' },
      },
      factions: {
        missingFaction: { color: '#ff0000' },
      },
      edges: {
        categoryStyles: {
          missingEdge: { color: '#00ff00' },
        },
      },
    };

    const errors = validateVisualConfigRefs(config, fixtureContext());
    expect(errors.map((error) => error.category)).toEqual([
      'zone',
      'tokenType',
      'zoneCategory',
      'faction',
      'edge',
    ]);
  });

  it('reports unknown tableOverlays.playerSeatAnchorZones references', () => {
    const config: VisualConfig = {
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['missing:zone'],
      },
    };

    const errors = validateVisualConfigRefs(config, fixtureContext());
    expect(errors).toEqual([
      {
        category: 'zone',
        configPath: 'tableOverlays.playerSeatAnchorZones[0]',
        referencedId: 'missing:zone',
        message: 'Unknown zone id',
      },
    ]);
  });

  it('buildRefValidationContext extracts ids and edge categories from GameDef', () => {
    const context = buildRefValidationContext({
      zones: [
        {
          id: 'zone:a',
          category: 'city',
          adjacentTo: [{ to: 'zone:b', category: 'road' }],
        },
        {
          id: 'zone:b',
          adjacentTo: [{ to: 'zone:a', category: 'river' }],
        },
        {
          id: 'zone:internal',
          isInternal: true,
          category: 'hidden-category',
          adjacentTo: [{ to: 'zone:a', category: 'hidden-edge' }],
        },
      ],
      tokenTypes: [{ id: 'tokenA' }],
      seats: [{ id: 'factionA' }],
      globalVars: [{ name: 'globalA' }],
      perPlayerVars: [{ name: 'playerA' }],
    } as unknown as GameDef);

    expect(context.zoneIds).toEqual(new Set(['zone:a', 'zone:b']));
    expect(context.zoneCategories).toEqual(new Set(['city']));
    expect(context.tokenTypeIds).toEqual(new Set(['tokenA']));
    expect(context.factionIds).toEqual(new Set(['factionA']));
    expect(context.edgeCategories).toEqual(new Set(['city', 'road', 'river']));
  });

  it('validateAndCreateProvider throws for malformed non-null config', () => {
    expect(() => validateAndCreateProvider({ version: 2 }, fixtureContext())).toThrow(/Invalid visual config schema/u);
  });

  it('validateAndCreateProvider rejects deleted variables config surface at schema boundary', () => {
    expect(() =>
      validateAndCreateProvider(
        {
          version: 1,
          variables: {
            prominent: ['varA'],
          },
        },
        fixtureContext(),
      )).toThrow(/Invalid visual config schema/u);
  });

  it('validateAndCreateProvider throws for invalid references', () => {
    expect(() =>
      validateAndCreateProvider(
        {
          version: 1,
          zones: {
            overrides: {
              'missing:zone': { label: 'oops' },
            },
          },
        },
        fixtureContext(),
      )).toThrow(/Invalid visual config references/u);
  });

  it('reports unknown hiddenZones references', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        hiddenZones: ['missing:zone'],
      },
    };

    const errors = validateVisualConfigRefs(config, fixtureContext());
    expect(errors).toEqual([
      {
        category: 'zone',
        configPath: 'zones.hiddenZones[0]',
        referencedId: 'missing:zone',
        message: 'Unknown zone id',
      },
    ]);
  });

  it('reports unknown token layout assignment categories', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        tokenLayouts: {
          presets: {
            'fitl-map-space': {
              mode: 'lanes',
              laneGap: 24,
              laneOrder: ['regular'],
              lanes: {
                regular: {
                  anchor: 'center',
                  pack: 'centeredRow',
                  spacingX: 32,
                },
              },
            },
          },
          assignments: {
            byCategory: {
              jungle: 'fitl-map-space',
            },
          },
        },
      },
    };

    expect(validateVisualConfigRefs(config, fixtureContext())).toEqual([
      {
        category: 'zoneCategory',
        configPath: 'zones.tokenLayouts.assignments.byCategory.jungle',
        referencedId: 'jungle',
        message: 'Unknown zoneCategory id',
      },
    ]);
  });

  it('reports token presentation lanes that no assigned lane layout can satisfy', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        tokenLayouts: {
          presets: {
            'fitl-map-space': {
              mode: 'lanes',
              laneGap: 24,
              laneOrder: ['regular'],
              lanes: {
                regular: {
                  anchor: 'center',
                  pack: 'centeredRow',
                  spacingX: 32,
                },
              },
            },
          },
          assignments: {
            byCategory: {
              city: 'fitl-map-space',
            },
          },
        },
      },
      tokenTypes: {
        tokenA: {
          presentation: {
            lane: 'base',
            scale: 1.5,
          },
        },
      },
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: {
            presentation: {
              lane: 'reserve',
              scale: 1,
            },
          },
        },
      ],
    };

    expect(validateVisualConfigRefs(config, fixtureContext())).toEqual([
      {
        category: 'tokenType',
        configPath: 'tokenTypes.tokenA.presentation.lane',
        referencedId: 'base',
        message: 'Presentation lane is not satisfiable by any assigned lane layout',
      },
      {
        category: 'tokenType',
        configPath: 'tokenTypeDefaults[0].style.presentation.lane',
        referencedId: 'reserve',
        message: 'Presentation lane is not satisfiable by any assigned lane layout',
      },
    ]);
  });

  it('validateAndCreateProvider returns provider when config is valid', () => {
    const provider = validateAndCreateProvider(
      {
        version: 1,
        factions: {
          factionA: { color: '#ff0000' },
        },
      },
      fixtureContext(),
    );
    expect(provider.getFactionColor('factionA')).toBe('#ff0000');
  });
});

function fixtureContext(): VisualConfigRefValidationContext {
  return {
    zoneIds: new Set(['zone:a', 'zone:b']),
    zoneCategories: new Set(['city', 'province']),
    tokenTypeIds: new Set(['tokenA']),
    factionIds: new Set(['factionA']),
    edgeCategories: new Set(['road']),
  };
}
