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
        connectionAnchors: { 'khe-sanh': { x: 120, y: 80 } },
        connectionEndpoints: {
          'zone:a': [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'anchor', anchorId: 'khe-sanh' },
          ],
        },
        connectionPaths: {
          'zone:b': [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'anchor', anchorId: 'khe-sanh' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
        },
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
      runnerSurfaces: {
        showdown: {
          when: { phase: 'showdown' },
          ranking: {
            source: {
              kind: 'perPlayerVar',
              name: 'playerA',
            },
            hideZeroScores: true,
          },
          communityCards: {
            zones: ['zone:a'],
          },
          playerCards: {
            zones: ['zone:b'],
          },
        },
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
        connectionEndpoints: {
          'zone:a': [
            { kind: 'anchor', anchorId: 'missing-anchor' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
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
      'anchor',
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
      turnStructure: {
        phases: [{ id: 'showdown' }, { id: 'main' }],
      },
    } as unknown as GameDef);

    expect(context.zoneIds).toEqual(new Set(['zone:a', 'zone:b']));
    expect(context.zoneCategories).toEqual(new Set(['city']));
    expect(context.tokenTypeIds).toEqual(new Set(['tokenA']));
    expect(context.factionIds).toEqual(new Set(['factionA']));
    expect(context.edgeCategories).toEqual(new Set(['city', 'road', 'river']));
    expect(context.phaseIds).toEqual(new Set(['showdown', 'main']));
    expect(context.globalVarNames).toEqual(new Set(['globalA']));
    expect(context.perPlayerVarNames).toEqual(new Set(['playerA']));
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

  it('reports unknown connectionEndpoints and connectionPaths refs with precise paths', () => {
    const config: VisualConfig = {
      version: 1,
      zones: {
        connectionAnchors: {
          known: { x: 0, y: 0 },
        },
        connectionEndpoints: {
          'missing:route': [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'anchor', anchorId: 'missing:endpoint' },
          ],
        },
        connectionPaths: {
          'zone:b': [
            { kind: 'zone', zoneId: 'missing:path-zone' },
            { kind: 'anchor', anchorId: 'missing:path-anchor' },
          ],
        },
      },
    };

    expect(validateVisualConfigRefs(config, fixtureContext())).toEqual([
      {
        category: 'zone',
        configPath: 'zones.connectionEndpoints.missing:route',
        referencedId: 'missing:route',
        message: 'Unknown zone id',
      },
      {
        category: 'anchor',
        configPath: 'zones.connectionEndpoints.missing:route[1].anchorId',
        referencedId: 'missing:endpoint',
        message: 'Unknown anchor id',
      },
      {
        category: 'zone',
        configPath: 'zones.connectionPaths.zone:b[0].zoneId',
        referencedId: 'missing:path-zone',
        message: 'Unknown zone id',
      },
      {
        category: 'anchor',
        configPath: 'zones.connectionPaths.zone:b[1].anchorId',
        referencedId: 'missing:path-anchor',
        message: 'Unknown anchor id',
      },
    ]);
  });

  it('reports showdown phase, variable, and zone reference errors with precise paths', () => {
    const config: VisualConfig = {
      version: 1,
      runnerSurfaces: {
        showdown: {
          when: {
            phase: 'missing-phase',
          },
          ranking: {
            source: {
              kind: 'perPlayerVar',
              name: 'missing-player-var',
            },
          },
          communityCards: {
            zones: ['missing:community'],
          },
          playerCards: {
            zones: ['missing:hand'],
          },
        },
      },
    };

    expect(validateVisualConfigRefs(config, fixtureContext())).toEqual([
      {
        category: 'phase',
        configPath: 'runnerSurfaces.showdown.when.phase',
        referencedId: 'missing-phase',
        message: 'Unknown phase id',
      },
      {
        category: 'perPlayerVar',
        configPath: 'runnerSurfaces.showdown.ranking.source.name',
        referencedId: 'missing-player-var',
        message: 'Unknown per-player variable name',
      },
      {
        category: 'zone',
        configPath: 'runnerSurfaces.showdown.communityCards.zones[0]',
        referencedId: 'missing:community',
        message: 'Unknown zone id',
      },
      {
        category: 'zone',
        configPath: 'runnerSurfaces.showdown.playerCards.zones[0]',
        referencedId: 'missing:hand',
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
    phaseIds: new Set(['main', 'showdown']),
    globalVarNames: new Set(['globalA']),
    perPlayerVarNames: new Set(['playerA']),
  };
}
