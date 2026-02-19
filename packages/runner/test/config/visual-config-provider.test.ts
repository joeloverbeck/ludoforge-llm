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
        'us-troops': { shape: 'cube', size: 24, symbol: 'star', backSymbol: 'diamond' },
      },
    });

    expect(provider.getTokenTypeVisual('us-troops')).toEqual({
      shape: 'cube',
      color: null,
      size: 24,
      symbol: 'star',
      backSymbol: 'diamond',
    });
  });

  it('resolveTokenSymbols applies ordered symbolRules over defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        guerrilla: {
          backSymbol: 'diamond',
          symbolRules: [
            {
              when: [{ prop: 'activity', equals: 'active' }],
              symbol: 'star',
            },
            {
              when: [{ prop: 'status', equals: 'hidden' }],
              backSymbol: null,
            },
          ],
        },
      },
    });

    expect(provider.resolveTokenSymbols('guerrilla', { activity: 'underground' })).toEqual({
      symbol: null,
      backSymbol: 'diamond',
    });

    expect(provider.resolveTokenSymbols('guerrilla', { activity: 'active' })).toEqual({
      symbol: 'star',
      backSymbol: 'diamond',
    });

    expect(provider.resolveTokenSymbols('guerrilla', { activity: 'active', status: 'hidden' })).toEqual({
      symbol: 'star',
      backSymbol: null,
    });
  });

  it('token type visual resolves to defaults for missing config', () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.getTokenTypeVisual('anything')).toEqual({
      shape: 'circle',
      color: null,
      size: 28,
      symbol: null,
      backSymbol: null,
    });
    expect(provider.resolveTokenSymbols('anything', {})).toEqual({
      symbol: null,
      backSymbol: null,
    });
  });

  it('resolveEdgeStyle returns fallback defaults for default and highlighted styles', () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.resolveEdgeStyle(null, false)).toEqual({
      color: '#6b7280',
      width: 1.5,
      alpha: 0.3,
    });
    expect(provider.resolveEdgeStyle(null, true)).toEqual({
      color: '#93c5fd',
      width: 3,
      alpha: 0.7,
    });
  });

  it('resolveEdgeStyle applies category styles over defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      edges: {
        categoryStyles: {
          loc: { color: '#8b7355', width: 2 },
        },
      },
    });

    expect(provider.resolveEdgeStyle('loc', false)).toEqual({
      color: '#8b7355',
      width: 2,
      alpha: 0.3,
    });
  });

  it('resolveEdgeStyle applies highlighted config with highest precedence', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      edges: {
        default: { color: '#010101', width: 1, alpha: 0.1 },
        categoryStyles: {
          loc: { color: '#8b7355', width: 2, alpha: 0.2 },
        },
        highlighted: { color: '#ff00ff', width: 5, alpha: 0.9 },
      },
    });

    expect(provider.resolveEdgeStyle('loc', true)).toEqual({
      color: '#ff00ff',
      width: 5,
      alpha: 0.9,
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
          moveToken: 'pulse',
        },
      },
      variables,
    });

    expect(provider.getAnimationPreset('moveToken')).toBe('pulse');
    expect(provider.getAnimationPreset('cardDeal')).toBeNull();
    expect(provider.getVariablesConfig()).toEqual(variables);
  });

  it('card template lookups resolve assignments and missing values', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      cards: {
        assignments: [
          {
            match: { idPrefixes: ['card-'] },
            template: 'poker-card',
          },
          {
            match: { ids: ['special'] },
            template: 'special-card',
          },
        ],
        templates: {
          'poker-card': {
            width: 48,
            height: 68,
            layout: {
              rank: { y: 8, align: 'center' },
            },
          },
          'special-card': {
            width: 60,
            height: 90,
          },
        },
      },
    });

    expect(provider.getCardTemplateForTokenType('card-AS')).toEqual({
      width: 48,
      height: 68,
      layout: {
        rank: { y: 8, align: 'center' },
      },
    });
    expect(provider.getCardTemplateForTokenType('special')).toEqual({
      width: 60,
      height: 90,
    });
    expect(provider.getCardTemplateForTokenType('token')).toBeNull();
    expect(provider.getCardTemplate('unknown')).toBeNull();
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
