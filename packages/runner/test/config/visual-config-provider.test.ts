import { describe, expect, it } from 'vitest';

import { DEFAULT_FACTION_PALETTE } from '../../src/config/visual-config-defaults';
import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import type { VisualConfig } from '../../src/config/visual-config-types';

describe('VisualConfigProvider', () => {
  it('null config resolves zone visuals to defaults', () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.resolveZoneVisual('zone:a', 'city', {})).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: null,
    });
  });

  it('null config returns deterministic hashed faction colors', () => {
    const provider = new VisualConfigProvider(null);

    const first = provider.getFactionColor('us');
    const second = provider.getFactionColor('us');

    expect(first).toBe(second);
    expect(DEFAULT_FACTION_PALETTE).toContain(first);
  });

  it("null config returns 'graph' when adjacency exists and 'table' otherwise", () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.getLayoutMode(true)).toBe('graph');
    expect(provider.getLayoutMode(false)).toBe('table');
  });

  it('null config returns null card animation', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getCardAnimation()).toBeNull();
  });

  it('category style merges over defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          city: { shape: 'circle', width: 90 },
        },
      },
    });

    expect(provider.resolveZoneVisual('zone:a', 'city', {})).toEqual({
      shape: 'circle',
      width: 90,
      height: 100,
      color: null,
    });
  });

  it('attribute rules override category styles when they match', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { color: '#0000ff' },
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
      },
    });

    expect(
      provider.resolveZoneVisual('zone:a', 'province', { terrainTags: ['dense-forest', 'highland'] }),
    ).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: '#6b5b3e',
    });
  });

  it('zone overrides win over category styles and attribute rules', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { color: '#0000ff', width: 200 },
        },
        attributeRules: [
          {
            match: { category: ['province'] },
            style: { color: '#6b5b3e', shape: 'hexagon' },
          },
        ],
        overrides: {
          'zone:a': { color: '#ffffff', width: 220, label: 'Zone A' },
        },
      },
    });

    expect(provider.resolveZoneVisual('zone:a', 'province', {})).toEqual({
      shape: 'hexagon',
      width: 220,
      height: 100,
      color: '#ffffff',
    });
    expect(provider.getZoneLabel('zone:a')).toBe('Zone A');
  });

  it('non-matching attribute rules keep category style', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { color: '#0000ff' },
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
      },
    });

    expect(provider.resolveZoneVisual('zone:a', 'province', { terrainTags: ['lowland'] })).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: '#0000ff',
    });
  });

  it('faction color uses config for known factions and default hash otherwise', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      factions: {
        us: { color: '#e63946' },
      },
    });

    expect(provider.getFactionColor('us')).toBe('#e63946');
    expect(DEFAULT_FACTION_PALETTE).toContain(provider.getFactionColor('unknown-faction'));
  });

  it('faction display name returns configured value or null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      factions: {
        us: { displayName: 'United States' },
      },
    });

    expect(provider.getFactionDisplayName('us')).toBe('United States');
    expect(provider.getFactionDisplayName('arvn')).toBeNull();
  });

  it('token type visual merges configured values over defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        'us-troops': { shape: 'cube', size: 24, symbol: 'US' },
      },
    });

    expect(provider.getTokenTypeVisual('us-troops')).toEqual({
      shape: 'cube',
      color: null,
      size: 24,
      symbol: 'US',
    });
  });

  it('token type visual resolves to defaults for missing config', () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.getTokenTypeVisual('anything')).toEqual({
      shape: 'circle',
      color: null,
      size: 28,
      symbol: null,
    });
  });

  it('layout role returns configured value for known zone and null otherwise', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        layoutRoles: {
          deck: 'card',
        },
      },
    });

    expect(provider.getLayoutRole('deck')).toBe('card');
    expect(provider.getLayoutRole('unknown')).toBeNull();
  });

  it('animation preset and variables config return configured values', () => {
    const variables = {
      prominent: ['pot'],
    };

    const provider = new VisualConfigProvider({
      version: 1,
      animations: {
        actions: {
          sweep: 'scan',
        },
      },
      variables,
    });

    expect(provider.getAnimationPreset('sweep')).toBe('scan');
    expect(provider.getAnimationPreset('unknown')).toBeNull();
    expect(provider.getVariablesConfig()).toEqual(variables);
  });

  it('returns deterministic structural results for repeated calls', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        categoryStyles: {
          city: { shape: 'circle', color: '#123456' },
        },
      },
      tokenTypes: {
        cityToken: { shape: 'meeple', size: 31 },
      },
    };
    const provider = new VisualConfigProvider(config);

    const zoneA = provider.resolveZoneVisual('zone:a', 'city', { terrainTags: 'river-urban' });
    const zoneB = provider.resolveZoneVisual('zone:a', 'city', { terrainTags: 'river-urban' });
    const tokenA = provider.getTokenTypeVisual('cityToken');
    const tokenB = provider.getTokenTypeVisual('cityToken');

    expect(zoneB).toEqual(zoneA);
    expect(tokenB).toEqual(tokenA);
  });

  it('exposes deterministic configHash and null sentinel hash', () => {
    const nullProvider = new VisualConfigProvider(null);
    const first = new VisualConfigProvider({
      version: 1,
      zones: {
        layoutRoles: {
          deck: 'card',
        },
      },
    });
    const second = new VisualConfigProvider({
      zones: {
        layoutRoles: {
          deck: 'card',
        },
      },
      version: 1,
    });

    expect(nullProvider.configHash).toBe('null');
    expect(first.configHash).toBe(second.configHash);
  });
});
