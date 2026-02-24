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
        tokenA: { shape: 'circle' },
      },
      factions: {
        factionA: { color: '#111111' },
      },
      variables: {
        prominent: ['varA'],
        panels: [{ name: 'Panel', vars: ['varA'] }],
        formatting: {
          varA: { type: 'number' },
        },
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
      },
      tokenTypes: {
        missingToken: { shape: 'circle' },
      },
      factions: {
        missingFaction: { color: '#ff0000' },
      },
      variables: {
        prominent: ['missingVar'],
      },
      edges: {
        categoryStyles: {
          missingEdge: { color: '#00ff00' },
        },
      },
    };

    const errors = validateVisualConfigRefs(config, fixtureContext());
    expect(errors.map((error) => error.category)).toEqual(['zone', 'tokenType', 'faction', 'variable', 'edge']);
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
    expect(context.tokenTypeIds).toEqual(new Set(['tokenA']));
    expect(context.factionIds).toEqual(new Set(['factionA']));
    expect(context.variableNames).toEqual(new Set(['globalA', 'playerA']));
    expect(context.edgeCategories).toEqual(new Set(['city', 'road', 'river']));
  });

  it('validateAndCreateProvider throws for malformed non-null config', () => {
    expect(() => validateAndCreateProvider({ version: 2 }, fixtureContext())).toThrow(/Invalid visual config schema/u);
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
    tokenTypeIds: new Set(['tokenA']),
    factionIds: new Set(['factionA']),
    variableNames: new Set(['varA']),
    edgeCategories: new Set(['road']),
  };
}
