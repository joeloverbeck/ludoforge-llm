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
        tokenLayouts: {
          defaults: {
            other: {
              mode: 'grid',
              columns: 6,
              spacingX: 36,
              spacingY: 36,
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
                },
              },
            },
          },
          assignments: {
            byCategory: {
              city: 'fitl-map-space',
              province: 'fitl-map-space',
            },
          },
        },
      },
      edges: {
        default: { color: '#6b7280', width: 1.5, alpha: 0.3 },
        highlighted: { color: '#93c5fd', width: 3, alpha: 0.7 },
        categoryStyles: {
          loc: { color: '#8b7355', width: 2 },
        },
      },
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
      tokenTypes: {
        'us-troops': {
          shape: 'cube',
          color: '#e63946',
          size: 24,
          presentation: {
            lane: 'regular',
            scale: 1,
          },
        },
        'us-bases': {
          shape: 'round-disk',
          color: '#e63946',
          presentation: {
            lane: 'base',
            scale: 1.5,
          },
        },
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

  it('accepts victory tooltip detail templates and keeps them optional', () => {
    const withTemplate = VisualConfigSchema.safeParse({
      version: 1,
      victoryStandings: {
        tooltipBreakdowns: [
          {
            seat: 'vc',
            components: [
              {
                label: 'Total Opposition',
                detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
              },
              {
                label: 'VC Bases on Map',
              },
            ],
          },
        ],
      },
    });

    expect(withTemplate.success).toBe(true);
  });

  it('accepts runnerChrome top-bar presentation hints', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      runnerChrome: {
        topBar: {
          statusAlignment: 'start',
        },
      },
    });

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

  it('rejects deleted variables visual-config surface', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      variables: {
        prominent: ['resources-us'],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects legacy stackBadge fontFamily for BitmapText-backed config', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokens: {
        stackBadge: {
          fontFamily: 'monospace',
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

    expect(result.success).toBe(false);
  });

  it('rejects behavior-encoding fields under runnerChrome topBar', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      runnerChrome: {
        topBar: {
          statusAlignment: 'center',
          menuItems: ['playback'],
        },
      },
    });

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

  it('rejects unknown animation sequencing keys', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        sequencing: {
          sweep: { mode: 'parallel' },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts known animation sequencing keys', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        sequencing: {
          cardDeal: { mode: 'stagger', staggerOffset: 0.15 },
          moveToken: { mode: 'parallel' },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts known animation timing keys', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        timing: {
          cardDeal: { duration: 0.25 },
          moveToken: { duration: 0.6 },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown animation timing keys', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        timing: {
          sweep: { duration: 0.25 },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts zone highlight policy config', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        zoneHighlights: {
          enabled: true,
          includeKinds: ['moveToken', 'createToken'],
          moveEndpoints: 'to',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid zone highlight source kind', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      animations: {
        zoneHighlights: {
          includeKinds: ['phaseTransition'],
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

  it('accepts connection as a valid zone shape and parses unified connection routes', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        categoryStyles: {
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        connectionAnchors: {
          'khe-sanh': { x: 120, y: 80 },
        },
        connectionStyles: {
          highway: {
            strokeWidth: 8,
            strokeColor: '#8b7355',
          },
          mekong: {
            strokeWidth: 12,
            strokeColor: '#4a7a8c',
            wavy: true,
            waveAmplitude: 4,
            waveFrequency: 0.08,
          },
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
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'anchor', anchorId: 'khe-sanh' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'position', x: 90, y: 40 } },
            ],
          },
          'loc-saigon-an-loc-ban-me-thuot:none': {
            points: [
              { kind: 'zone', zoneId: 'saigon:none' },
              { kind: 'anchor', anchorId: 'khe-sanh' },
              { kind: 'zone', zoneId: 'ban-me-thuot:none' },
            ],
            segments: [
              { kind: 'straight' },
              { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'khe-sanh' } },
            ],
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional anchor angles on zone connection endpoints', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none', anchor: 90 },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'straight' },
            ],
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts curvature route controls', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'curvature', offset: 0.3 } },
            ],
          },
          'loc-beta-gamma:none': {
            points: [
              { kind: 'zone', zoneId: 'beta:none' },
              { kind: 'zone', zoneId: 'gamma:none' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'curvature', offset: -0.5, angle: 45 } },
            ],
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid curvature control angles and extra properties', () => {
    const invalidAngle = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'curvature', offset: 0.3, angle: 400 } },
            ],
          },
        },
      },
    });
    const negativeAngle = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'curvature', offset: 0.3, angle: -10 } },
            ],
          },
        },
      },
    });
    const extraProperty = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'curvature', offset: 0.3, extra: true } },
            ],
          },
        },
      },
    });

    expect(invalidAngle.success).toBe(false);
    expect(negativeAngle.success).toBe(false);
    expect(extraProperty.success).toBe(false);
  });

  it('rejects out-of-range anchor angles on zone connection endpoints', () => {
    const negative = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none', anchor: -1 },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'straight' },
            ],
          },
        },
      },
    });
    const tooLarge = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-alpha-beta:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none', anchor: 361 },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [
              { kind: 'straight' },
            ],
          },
        },
      },
    });

    expect(negative.success).toBe(false);
    expect(tooLarge.success).toBe(false);
  });

  it('rejects connection routes with mismatched segment counts', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        connectionRoutes: {
          'loc-short:none': {
            points: [
              { kind: 'zone', zoneId: 'alpha:none' },
              { kind: 'zone', zoneId: 'beta:none' },
            ],
            segments: [],
          },
        },
      },
    });

    expect(result.success).toBe(false);
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

  it('accepts token type displayName', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        'nva-guerrillas': { displayName: 'Guerrilla' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts token presentation metadata on token types', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        'vc-bases': {
          presentation: {
            lane: 'base',
            scale: 1.5,
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts stack badge styling under tokens config', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokens: {
        stackBadge: {
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

    expect(result.success).toBe(true);
  });

  it('accepts zone token layout presets and category assignments', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        tokenLayouts: {
          defaults: {
            other: {
              mode: 'grid',
              columns: 6,
              spacingX: 36,
              spacingY: 36,
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
                  spacingY: 20,
                },
              },
            },
          },
          assignments: {
            byCategory: {
              city: 'fitl-map-space',
              province: 'fitl-map-space',
            },
          },
        },
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

  it('accepts table overlays config', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          {
            kind: 'globalVar',
            varName: 'pot',
            label: 'Pot',
            position: 'tableCenter',
            offsetY: 60,
          },
          {
            kind: 'perPlayerVar',
            varName: 'streetBet',
            position: 'playerSeat',
            markerShape: 'badge',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects playerSeat table overlays without playerSeatAnchorZones', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tableOverlays: {
        items: [
          {
            kind: 'perPlayerVar',
            varName: 'streetBet',
            position: 'playerSeat',
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts explicit showdown surface config', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      runnerSurfaces: {
        showdown: {
          when: {
            phase: 'showdown',
          },
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

    expect(result.success).toBe(true);
  });

  it('rejects showdown surface config with malformed ranking source', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      runnerSurfaces: {
        showdown: {
          when: {
            phase: 'showdown',
          },
          ranking: {
            source: {
              kind: 'globalVar',
              name: 'showdownScore',
            },
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

    expect(result.success).toBe(false);
  });

  it('rejects invalid card field align values', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      cards: {
        templates: {
          'poker-card': {
            width: 48,
            height: 68,
            layout: {
              rank: { y: 8, align: 'middle' },
            },
          },
        },
      },
    });

    expect(result.success).toBe(false);
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

  it('rejects token presentation scale when non-positive', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      tokenTypes: {
        'vc-bases': {
          presentation: {
            lane: 'base',
            scale: 0,
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects stack badge non-positive font and stroke values', () => {
    const zeroFont = VisualConfigSchema.safeParse({
      version: 1,
      tokens: {
        stackBadge: {
          fontSize: 0,
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 3,
          anchorX: 1,
          anchorY: 0,
          offsetX: 4,
          offsetY: -4,
        },
      },
    });
    const zeroStroke = VisualConfigSchema.safeParse({
      version: 1,
      tokens: {
        stackBadge: {
          fontSize: 13,
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 0,
          anchorX: 1,
          anchorY: 0,
          offsetX: 4,
          offsetY: -4,
        },
      },
    });

    expect(zeroFont.success).toBe(false);
    expect(zeroStroke.success).toBe(false);
  });

  it('rejects non-positive token layout spacing and laneGap values', () => {
    const zeroLaneGap = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        tokenLayouts: {
          presets: {
            'fitl-map-space': {
              mode: 'lanes',
              laneGap: 0,
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
        },
      },
    });
    const zeroSpacing = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
        tokenLayouts: {
          defaults: {
            other: {
              mode: 'grid',
              spacingX: 0,
              spacingY: 36,
            },
          },
        },
      },
    });

    expect(zeroLaneGap.success).toBe(false);
    expect(zeroSpacing.success).toBe(false);
  });

  it('rejects lane presets when laneOrder references an undefined lane', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      zones: {
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
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects lane presets when a defined lane is missing from laneOrder', () => {
    const result = VisualConfigSchema.safeParse({
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
                base: {
                  anchor: 'belowPreviousLane',
                  pack: 'centeredRow',
                  spacingX: 42,
                },
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects category assignments that reference unknown token layout presets', () => {
    const result = VisualConfigSchema.safeParse({
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
              city: 'missing-preset',
            },
          },
        },
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

  it('accepts phaseBanners with valid phases array', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      phaseBanners: {
        phases: ['preflop', 'flop', 'turn', 'river', 'showdown'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects phaseBanners with empty phases array', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      phaseBanners: {
        phases: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts config without phaseBanners (optional)', () => {
    const result = VisualConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects phaseBanners missing phases field', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      phaseBanners: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid actions section with nested choices and options', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      actions: {
        'us-train': {
          displayName: 'Train',
          description: 'Place forces in cities or provinces with COIN control.',
          choices: {
            targetSpaces: {
              prompt: 'Select spaces to train in',
              description: 'Choose one or more spaces with COIN control.',
              options: {
                'saigon:none': { displayName: 'Saigon' },
                'hue:none': { displayName: 'Hue' },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with no actions section (backward compatible)', () => {
    const result = VisualConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects actions with invalid field types', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      actions: {
        'us-train': {
          displayName: 42,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts actions with only displayName (no choices)', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      actions: {
        'us-train': { displayName: 'Train' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts actions with empty choices record', () => {
    const result = VisualConfigSchema.safeParse({
      version: 1,
      actions: {
        'us-train': { choices: {} },
      },
    });
    expect(result.success).toBe(true);
  });
});
