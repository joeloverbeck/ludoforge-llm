import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { STROKE_LABEL_FONT_NAME } from '../../src/canvas/text/bitmap-font-registry.js';
import { DEFAULT_FACTION_PALETTE } from '../../src/config/visual-config-defaults';
import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import type { VisualConfig } from '../../src/config/visual-config-types';

function repoRootPath(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return resolve(testDir, '../../../..');
}

function loadVisualConfig(pathFromRepoRoot: string): VisualConfig {
  return parse(readFileSync(resolve(repoRootPath(), pathFromRepoRoot), 'utf8')) as VisualConfig;
}

describe('VisualConfigProvider', () => {
  it('null config resolves zone visuals to defaults', () => {
    const provider = new VisualConfigProvider(null);

    expect(provider.resolveZoneVisual('zone:a', 'city', {})).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey: null,
      vertices: null,
      strokeColor: null,
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

  it('runner chrome top bar resolves to runner-owned defaults when omitted', () => {
    const provider = new VisualConfigProvider({ version: 1 });

    expect(provider.getRunnerChromeTopBar()).toEqual({
      statusAlignment: 'center',
    });
  });

  it('runner chrome top bar resolves configured presentation overrides', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      runnerChrome: {
        topBar: {
          statusAlignment: 'start',
        },
      },
    });

    expect(provider.getRunnerChromeTopBar()).toEqual({
      statusAlignment: 'start',
    });
  });

  it('table overlays return configured value or null', () => {
    const withOverlays = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          {
            kind: 'globalVar',
            varName: 'pot',
            position: 'tableCenter',
          },
        ],
      },
    });
    const withoutOverlays = new VisualConfigProvider({ version: 1 });

    expect(withOverlays.getTableOverlays()).toEqual({
      playerSeatAnchorZones: ['seat:0', 'seat:1'],
      items: [
        {
          kind: 'globalVar',
          varName: 'pot',
          position: 'tableCenter',
        },
      ],
    });
    expect(withoutOverlays.getTableOverlays()).toBeNull();
    expect(withOverlays.getPlayerSeatAnchorZones()).toEqual(['seat:0', 'seat:1']);
    expect(withoutOverlays.getPlayerSeatAnchorZones()).toEqual([]);
  });

  it('showdown surface returns configured value or null', () => {
    const withShowdown = new VisualConfigProvider({
      version: 1,
      runnerSurfaces: {
        showdown: {
          when: { phase: 'showdown' },
          ranking: {
            source: {
              kind: 'perPlayerVar',
              name: 'showdownScore',
            },
            hideZeroScores: true,
          },
          communityCards: {
            zones: ['community:none'],
          },
          playerCards: {
            zones: ['hand:0', 'hand:1'],
          },
        },
      },
    });
    const withoutShowdown = new VisualConfigProvider({ version: 1 });

    expect(withShowdown.getShowdownSurface()).toEqual({
      when: { phase: 'showdown' },
      ranking: {
        source: {
          kind: 'perPlayerVar',
          name: 'showdownScore',
        },
        hideZeroScores: true,
      },
      communityCards: {
        zones: ['community:none'],
      },
      playerCards: {
        zones: ['hand:0', 'hand:1'],
      },
    });
    expect(withoutShowdown.getShowdownSurface()).toBeNull();
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
      connectionStyleKey: null,
      vertices: null,
      strokeColor: null,
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
      connectionStyleKey: null,
      vertices: null,
      strokeColor: null,
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
      connectionStyleKey: null,
      vertices: null,
      strokeColor: null,
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
      connectionStyleKey: null,
      vertices: null,
      strokeColor: null,
    });
  });

  it('resolves connectionStyleKey through category, rule, and override precedence', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        attributeRules: [
          {
            match: {
              category: ['loc'],
              attributeContains: { terrainTags: 'mekong' },
            },
            style: { connectionStyleKey: 'mekong' },
          },
        ],
        overrides: {
          'zone:override': { connectionStyleKey: 'override-style' },
        },
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355' },
          mekong: {
            strokeWidth: 12,
            strokeColor: '#4a7a8c',
            wavy: true,
            waveAmplitude: 4,
            waveFrequency: 0.08,
          },
          'override-style': { strokeWidth: 10, strokeColor: '#123456' },
        },
      },
    });

    expect(provider.resolveZoneVisual('zone:a', 'loc', {})).toEqual({
      shape: 'connection',
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey: 'highway',
      vertices: null,
      strokeColor: null,
    });
    expect(provider.resolveZoneVisual('zone:b', 'loc', { terrainTags: ['mekong'] })).toEqual({
      shape: 'connection',
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey: 'mekong',
      vertices: null,
      strokeColor: null,
    });
    expect(provider.resolveZoneVisual('zone:override', 'loc', { terrainTags: ['mekong'] })).toEqual({
      shape: 'connection',
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey: 'override-style',
      vertices: null,
      strokeColor: null,
    });
    expect(provider.resolveConnectionStyle('highway')).toEqual({
      strokeWidth: 8,
      strokeColor: '#8b7355',
    });
    expect(provider.resolveConnectionStyle('mekong')).toEqual({
      strokeWidth: 12,
      strokeColor: '#4a7a8c',
      wavy: true,
      waveAmplitude: 4,
      waveFrequency: 0.08,
    });
    expect(provider.resolveConnectionStyle('missing')).toBeNull();
  });

  it('returns configured connection anchors and unified routes as deterministic maps', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        connectionAnchors: {
          'khe-sanh': { x: 120, y: 80 },
        },
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'anchor', anchorId: 'khe-sanh' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'straight' },
              { kind: 'quadratic', control: { kind: 'position', x: 150, y: 90 } },
            ],
          },
          'loc-beta-gamma:none': {
            points: [
              { kind: 'zone', zoneId: 'beta:none' },
              { kind: 'zone', zoneId: 'gamma:none' },
            ],
            segments: [
              { kind: 'straight' },
            ],
          },
        },
      },
    });

    expect(provider.getConnectionAnchors()).toEqual(new Map([
      ['khe-sanh', { x: 120, y: 80 }],
    ]));
    expect(provider.getConnectionRoutes()).toEqual(new Map([
      ['loc-alpha-beta:none', {
        points: [
          { kind: 'zone', zoneId: 'alpha:none' },
          { kind: 'anchor', anchorId: 'khe-sanh' },
          { kind: 'zone', zoneId: 'beta:none' },
        ],
        segments: [
          { kind: 'straight' },
          { kind: 'quadratic', control: { kind: 'position', x: 150, y: 90 } },
        ],
      }],
      ['loc-beta-gamma:none', {
        points: [
          { kind: 'zone', zoneId: 'beta:none' },
          { kind: 'zone', zoneId: 'gamma:none' },
        ],
        segments: [
          { kind: 'straight' },
        ],
      }],
    ]));
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

  it('token type display name returns configured value or null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        'nva-guerrillas': { displayName: 'Guerrilla' },
      },
    });

    expect(provider.getTokenTypeDisplayName('nva-guerrillas')).toBe('Guerrilla');
    expect(provider.getTokenTypeDisplayName('unknown-token')).toBeNull();
  });

  it('resolves token presentation from explicit token types and selector defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        'us-bases': {
          presentation: {
            lane: 'base',
            scale: 1.5,
          },
        },
      },
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['vc-'] },
          style: {
            presentation: {
              lane: 'regular',
              scale: 1,
            },
          },
        },
      ],
    });

    expect(provider.getTokenTypePresentation('us-bases')).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(provider.getTokenTypePresentation('vc-guerrillas')).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(provider.getTokenTypePresentation('unknown-token')).toEqual({
      lane: null,
      scale: 1,
    });
  });

  it('resolves zone token layouts from category assignments and layout-role defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        layoutRoles: {
          'hand:us': 'hand',
        },
        tokenLayouts: {
          defaults: {
            hand: {
              mode: 'grid',
              spacingX: 20,
              spacingY: 30,
            },
          },
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
                  spacingY: 40,
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
    });

    expect(provider.resolveZoneTokenLayout('saigon:none', 'city')).toEqual({
      mode: 'lanes',
      laneGap: 24,
      laneOrder: ['regular', 'base'],
      lanes: {
        regular: {
          anchor: 'center',
          pack: 'centeredRow',
          spacingX: 32,
          spacingY: 36,
        },
        base: {
          anchor: 'belowPreviousLane',
          pack: 'centeredRow',
          spacingX: 42,
          spacingY: 40,
        },
      },
    });
    expect(provider.resolveZoneTokenLayout('hand:us', null)).toEqual({
      mode: 'grid',
      columns: 6,
      spacingX: 20,
      spacingY: 30,
    });
    expect(provider.resolveZoneTokenLayout('unknown-zone', null)).toEqual({
      mode: 'grid',
      columns: 6,
      spacingX: 36,
      spacingY: 36,
    });
  });

  it('resolves stack badge style from config and provider defaults', () => {
    const configured = new VisualConfigProvider({
      version: 1,
      tokens: {
        stackBadge: {
          fontName: 'labelStroke',
          fontSize: 13,
          fill: '#f8fafc',
          stroke: '#000000',
          strokeWidth: 3,
          anchorX: 1,
          anchorY: 0,
          offsetX: 4,
          offsetY: -4,
        },
      },
    });
    const defaults = new VisualConfigProvider({ version: 1 });

    expect(configured.getStackBadgeStyle()).toEqual({
      fontName: STROKE_LABEL_FONT_NAME,
      fontSize: 13,
      fill: '#f8fafc',
      stroke: '#000000',
      strokeWidth: 3,
      anchorX: 1,
      anchorY: 0,
      offsetX: 4,
      offsetY: -4,
    });
    expect(defaults.getStackBadgeStyle()).toEqual({
      fontName: STROKE_LABEL_FONT_NAME,
      fontSize: 10,
      fill: '#f8fafc',
      stroke: '#000000',
      strokeWidth: 0,
      anchorX: 1,
      anchorY: 0,
      offsetX: -2,
      offsetY: 2,
    });
  });

  it('resolves lane layouts, token presentation, and stack badge styling from the real FITL config', () => {
    const provider = new VisualConfigProvider(loadVisualConfig('data/games/fire-in-the-lake/visual-config.yaml'));

    expect(provider.resolveZoneTokenLayout('saigon:none', 'city')).toEqual({
      mode: 'lanes',
      laneGap: 24,
      laneOrder: ['regular', 'base'],
      lanes: {
        regular: {
          anchor: 'center',
          pack: 'centeredRow',
          spacingX: 32,
          spacingY: 36,
        },
        base: {
          anchor: 'belowPreviousLane',
          pack: 'centeredRow',
          spacingX: 42,
          spacingY: 36,
        },
      },
    });
    expect(provider.resolveZoneTokenLayout('pleiku-darlac:none', 'province')).toEqual({
      mode: 'lanes',
      laneGap: 24,
      laneOrder: ['regular', 'base'],
      lanes: {
        regular: {
          anchor: 'center',
          pack: 'centeredRow',
          spacingX: 32,
          spacingY: 36,
        },
        base: {
          anchor: 'belowPreviousLane',
          pack: 'centeredRow',
          spacingX: 42,
          spacingY: 36,
        },
      },
    });
    expect(provider.resolveZoneTokenLayout('loc-saigon-can-tho:none', 'loc')).toEqual({
      mode: 'grid',
      columns: 6,
      spacingX: 36,
      spacingY: 36,
    });

    expect(provider.getTokenTypePresentation('us-bases')).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(provider.getTokenTypePresentation('vc-bases')).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(provider.getTokenTypePresentation('us-troops')).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(provider.getTokenTypePresentation('nva-guerrillas')).toEqual({
      lane: 'regular',
      scale: 1,
    });

    expect(provider.getStackBadgeStyle()).toEqual({
      fontName: STROKE_LABEL_FONT_NAME,
      fontSize: 13,
      fill: '#f8fafc',
      stroke: '#000000',
      strokeWidth: 3,
      anchorX: 1,
      anchorY: 0,
      offsetX: 4,
      offsetY: -4,
    });
  });

  it('token type visual falls back to selector-matched tokenTypeDefaults by prefix', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: { shape: 'card', color: '#ffffff', backSymbol: 'diamond' },
        },
      ],
    });

    expect(provider.getTokenTypeVisual('card-2S')).toEqual({
      shape: 'card',
      color: '#ffffff',
      size: 28,
      symbol: null,
      backSymbol: 'diamond',
    });
  });

  it('token type visual falls back to selector-matched tokenTypeDefaults by id', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { ids: ['dealer-button'] },
          style: { shape: 'round-disk', color: '#fbbf24', size: 20 },
        },
      ],
    });

    expect(provider.getTokenTypeVisual('dealer-button')).toEqual({
      shape: 'round-disk',
      color: '#fbbf24',
      size: 20,
      symbol: null,
      backSymbol: null,
    });
  });

  it('exact token type entries take priority over selector defaults', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        'card-2S': { shape: 'cube', symbol: 'star', displayName: 'Override' },
      },
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: { shape: 'card', symbol: 'spade', displayName: 'Default' },
        },
      ],
    });

    expect(provider.getTokenTypeVisual('card-2S').shape).toBe('cube');
    expect(provider.resolveTokenSymbols('card-2S', {})).toEqual({
      symbol: 'star',
      backSymbol: null,
    });
    expect(provider.getTokenTypeDisplayName('card-2S')).toBe('Override');
  });

  it('first matching selector default wins when multiple defaults match', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: { shape: 'card', color: '#ffffff' },
        },
        {
          match: { idPrefixes: ['card-2'] },
          style: { shape: 'cube', color: '#000000' },
        },
      ],
    });

    expect(provider.getTokenTypeVisual('card-2S')).toEqual({
      shape: 'card',
      color: '#ffffff',
      size: 28,
      symbol: null,
      backSymbol: null,
    });
  });

  it('selector defaults are ignored when no selector matches', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: { shape: 'card' },
        },
      ],
    });

    expect(provider.getTokenTypeVisual('chip-5')).toEqual({
      shape: 'circle',
      color: null,
      size: 28,
      symbol: null,
      backSymbol: null,
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

  it('resolveTokenSymbols falls back to selector-matched default symbol rules', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: {
            symbol: 'question',
            backSymbol: 'diamond',
            symbolRules: [
              {
                when: [{ prop: 'faceUp', equals: true }],
                symbol: 'spade',
              },
            ],
          },
        },
      ],
    });

    expect(provider.resolveTokenSymbols('card-AS', { faceUp: false })).toEqual({
      symbol: 'question',
      backSymbol: 'diamond',
    });
    expect(provider.resolveTokenSymbols('card-AS', { faceUp: true })).toEqual({
      symbol: 'spade',
      backSymbol: 'diamond',
    });
  });

  it('getTokenTypeDisplayName falls back to selector-matched default displayName', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tokenTypeDefaults: [
        {
          match: { idPrefixes: ['card-'] },
          style: { displayName: 'Card' },
        },
      ],
    });

    expect(provider.getTokenTypeDisplayName('card-QH')).toBe('Card');
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
      color: '#ffffff',
      width: 3.5,
      alpha: 0.85,
    });
    expect(provider.resolveEdgeStyle(null, true)).toEqual({
      color: '#ffffff',
      width: 4.5,
      alpha: 1.0,
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
      alpha: 0.85,
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

  it('resolves adjacency edge styles from the real FITL visual config', () => {
    const provider = new VisualConfigProvider(loadVisualConfig('data/games/fire-in-the-lake/visual-config.yaml'));

    expect(provider.resolveEdgeStyle(null, false)).toEqual({
      color: '#ffffff',
      width: 3.5,
      alpha: 0.85,
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

  it('animation preset returns configured value and missing values default to null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      animations: {
        actions: {
          moveToken: 'pulse',
        },
      },
    });

    expect(provider.getAnimationPreset('moveToken')).toBe('pulse');
    expect(provider.getAnimationPreset('cardDeal')).toBeNull();
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

  it('getLayoutHints returns null when config is null', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getLayoutHints()).toBeNull();
  });

  it('getLayoutHints returns null when no hints configured', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      layout: { mode: 'graph' },
    });
    expect(provider.getLayoutHints()).toBeNull();
  });

  it('getLayoutHints returns hints when regions are configured', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      layout: {
        hints: {
          regions: [
            { name: 'North', zones: ['zone-a', 'zone-b'], position: 'n' },
            { name: 'South', zones: ['zone-c'] },
          ],
        },
      },
    });

    const hints = provider.getLayoutHints();
    expect(hints).not.toBeNull();
    expect(hints!.regions).toHaveLength(2);
    expect(hints!.regions![0]!.position).toBe('n');
    expect(hints!.regions![1]!.position).toBeUndefined();
  });

  it('getTableBackground returns null when config is null or unset', () => {
    expect(new VisualConfigProvider(null).getTableBackground()).toBeNull();
    expect(new VisualConfigProvider({ version: 1, layout: { mode: 'table' } }).getTableBackground()).toBeNull();
  });

  it('getTableBackground returns configured layout table background', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      layout: {
        mode: 'table',
        tableBackground: {
          color: '#0a5c2e',
          shape: 'ellipse',
          paddingX: 100,
          paddingY: 80,
          borderColor: '#4a2c0a',
          borderWidth: 4,
        },
      },
    });

    expect(provider.getTableBackground()).toEqual({
      color: '#0a5c2e',
      shape: 'ellipse',
      paddingX: 100,
      paddingY: 80,
      borderColor: '#4a2c0a',
      borderWidth: 4,
    });
  });

  it('getSequencingPolicy returns null when no sequencing policy exists', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    expect(provider.getSequencingPolicy('cardDeal')).toBeNull();
  });

  it('getSequencingPolicy maps config sequencing fields to runtime policy shape', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      animations: {
        sequencing: {
          cardDeal: { mode: 'parallel' },
          moveToken: { mode: 'stagger', staggerOffset: 0.2 },
        },
      },
    });

    expect(provider.getSequencingPolicy('cardDeal')).toEqual({
      mode: 'parallel',
    });
    expect(provider.getSequencingPolicy('moveToken')).toEqual({
      mode: 'stagger',
      staggerOffsetSeconds: 0.2,
    });
  });

  it('getTimingConfig returns null when no timing override exists', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    expect(provider.getTimingConfig('cardDeal')).toBeNull();
  });

  it('getTimingConfig returns configured duration override when present', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      animations: {
        timing: {
          cardDeal: { duration: 0.25 },
          phaseTransition: { duration: 2.0 },
        },
      },
    });

    expect(provider.getTimingConfig('cardDeal')).toBe(0.25);
    expect(provider.getTimingConfig('phaseTransition')).toBe(2.0);
    expect(provider.getTimingConfig('moveToken')).toBeNull();
  });

  it('getZoneHighlightPolicy returns defaults when unset', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    expect(provider.getZoneHighlightPolicy()).toEqual({
      enabled: true,
      includeKinds: ['moveToken', 'cardDeal', 'cardBurn', 'createToken', 'destroyToken'],
      moveEndpoints: 'both',
    });
  });

  it('getZoneHighlightPolicy returns configured values when present', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      animations: {
        zoneHighlights: {
          enabled: false,
          includeKinds: ['cardDeal', 'createToken'],
          moveEndpoints: 'to',
        },
      },
    });
    expect(provider.getZoneHighlightPolicy()).toEqual({
      enabled: false,
      includeKinds: ['cardDeal', 'createToken'],
      moveEndpoints: 'to',
    });
  });

  it('getDefaultCardDimensions returns null when config is null', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getDefaultCardDimensions()).toBeNull();
  });

  it('getDefaultCardDimensions returns null when no card templates configured', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    expect(provider.getDefaultCardDimensions()).toBeNull();
  });

  it('getDefaultCardDimensions returns null when templates object is empty', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      cards: { templates: {} },
    });
    expect(provider.getDefaultCardDimensions()).toBeNull();
  });

  it('getDefaultCardDimensions returns first template dimensions', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      cards: {
        templates: {
          'poker-card': { width: 48, height: 68 },
          'special-card': { width: 60, height: 90 },
        },
      },
    });
    expect(provider.getDefaultCardDimensions()).toEqual({ width: 48, height: 68 });
  });

  it('getPhaseBannerPhases returns empty set for null config', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getPhaseBannerPhases().size).toBe(0);
  });

  it('getPhaseBannerPhases returns empty set when phaseBanners is omitted', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    expect(provider.getPhaseBannerPhases().size).toBe(0);
  });

  it('getPhaseBannerPhases returns configured phases as a set', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      phaseBanners: { phases: ['preflop', 'flop', 'turn', 'river'] },
    });
    const phases = provider.getPhaseBannerPhases();
    expect(phases.size).toBe(4);
    expect(phases.has('preflop')).toBe(true);
    expect(phases.has('flop')).toBe(true);
    expect(phases.has('turn')).toBe(true);
    expect(phases.has('river')).toBe(true);
    expect(phases.has('showdown')).toBe(false);
  });

  it('getVictoryTooltipComponentMetadata resolves metadata by seat and componentId', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      victoryStandings: {
        tooltipBreakdowns: [
          {
            seat: 'vc',
            componentsById: {
              markerTotal: {
                label: 'Total Opposition',
                description: 'Population-weighted opposition',
                detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
              },
            },
          },
        ],
      },
    });

    expect(provider.getVictoryTooltipComponentMetadata('vc', 'markerTotal')).toEqual({
      label: 'Total Opposition',
      description: 'Population-weighted opposition',
      detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
    });
    expect(provider.getVictoryTooltipComponentMetadata('vc', 'mapBases')).toBeNull();
    expect(provider.getVictoryTooltipComponentMetadata('nva', 'markerTotal')).toBeNull();
  });

  it('getVictoryTooltipComponentMetadata returns null when victory metadata is omitted', () => {
    expect(new VisualConfigProvider(null).getVictoryTooltipComponentMetadata('vc', 'markerTotal')).toBeNull();
    expect(new VisualConfigProvider({ version: 1 }).getVictoryTooltipComponentMetadata('vc', 'markerTotal')).toBeNull();
  });

  it('getActionDisplayName returns configured string or null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      actions: {
        'us-train': { displayName: 'Train' },
      },
    });

    expect(provider.getActionDisplayName('us-train')).toBe('Train');
    expect(provider.getActionDisplayName('nva-march')).toBeNull();
  });

  it('getActionDisplayName returns null for null config', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getActionDisplayName('us-train')).toBeNull();
  });

  it('getActionDescription returns configured string or null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      actions: {
        'us-train': { description: 'Place forces in COIN-controlled spaces.' },
      },
    });

    expect(provider.getActionDescription('us-train')).toBe('Place forces in COIN-controlled spaces.');
    expect(provider.getActionDescription('nva-march')).toBeNull();
  });

  it('getChoicePrompt returns configured string or null for each missing level', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      actions: {
        'us-train': {
          choices: {
            targetSpaces: { prompt: 'Select spaces to train in' },
          },
        },
      },
    });

    expect(provider.getChoicePrompt('us-train', 'targetSpaces')).toBe('Select spaces to train in');
    expect(provider.getChoicePrompt('us-train', 'unknownParam')).toBeNull();
    expect(provider.getChoicePrompt('nva-march', 'targetSpaces')).toBeNull();
  });

  it('getChoicePrompt returns null for null config', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getChoicePrompt('us-train', 'targetSpaces')).toBeNull();
  });

  it('getChoiceDescription returns configured string or null for each missing level', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      actions: {
        'us-train': {
          choices: {
            targetSpaces: { description: 'Choose one or more spaces with COIN control.' },
          },
        },
      },
    });

    expect(provider.getChoiceDescription('us-train', 'targetSpaces')).toBe('Choose one or more spaces with COIN control.');
    expect(provider.getChoiceDescription('us-train', 'unknownParam')).toBeNull();
    expect(provider.getChoiceDescription('nva-march', 'targetSpaces')).toBeNull();
  });

  it('getChoiceDescription returns null for null config', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getChoiceDescription('us-train', 'targetSpaces')).toBeNull();
  });

  it('getChoiceOptionDisplayName returns configured string or null at each nesting level', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      actions: {
        'us-train': {
          choices: {
            targetSpaces: {
              options: {
                'saigon:none': { displayName: 'Saigon' },
              },
            },
          },
        },
      },
    });

    expect(provider.getChoiceOptionDisplayName('us-train', 'targetSpaces', 'saigon:none')).toBe('Saigon');
    expect(provider.getChoiceOptionDisplayName('us-train', 'targetSpaces', 'hue:none')).toBeNull();
    expect(provider.getChoiceOptionDisplayName('us-train', 'unknownParam', 'saigon:none')).toBeNull();
    expect(provider.getChoiceOptionDisplayName('nva-march', 'targetSpaces', 'saigon:none')).toBeNull();
  });

  it('getChoiceOptionDisplayName returns null for null config', () => {
    const provider = new VisualConfigProvider(null);
    expect(provider.getChoiceOptionDisplayName('us-train', 'targetSpaces', 'saigon:none')).toBeNull();
  });

  it('getMarkerBadgeConfig returns configured badge or null', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        markerBadge: {
          markerId: 'support',
          colorMap: {
            activeOpposition: { color: '#dc2626', abbreviation: 'AO' },
            neutral: { color: '#6b7280', abbreviation: 'N' },
          },
        },
      },
    });

    const badge = provider.getMarkerBadgeConfig();
    expect(badge).not.toBeNull();
    expect(badge!.markerId).toBe('support');
    expect(badge!.colorMap['activeOpposition']).toEqual({ color: '#dc2626', abbreviation: 'AO' });
    expect(badge!.colorMap['neutral']).toEqual({ color: '#6b7280', abbreviation: 'N' });
  });

  it('getMarkerBadgeConfig returns null when not configured', () => {
    expect(new VisualConfigProvider(null).getMarkerBadgeConfig()).toBeNull();
    expect(new VisualConfigProvider({ version: 1 }).getMarkerBadgeConfig()).toBeNull();
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
