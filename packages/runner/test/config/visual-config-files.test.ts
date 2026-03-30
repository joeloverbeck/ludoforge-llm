import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '@ludoforge/engine/cnl';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { assertBootstrapTargetDefinitions } from '../../src/bootstrap/bootstrap-registry';
import { resolveCurvatureControlPoint } from '../../src/canvas/geometry/bezier-utils';
import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import type { ConnectionRouteDefinition } from '../../src/config/visual-config-types';
import { VisualConfigSchema } from '../../src/config/visual-config-types';
import {
  buildRefValidationContext,
  parseVisualConfigStrict,
  validateVisualConfigRefs,
} from '../../src/config/validate-visual-config-refs';
import { resolveConnectionRoutes } from '../../src/presentation/connection-route-resolver';
import type { ResolvedConnectionPoint } from '../../src/presentation/connection-route-resolver';

const EXPECTED_FITL_CONNECTION_ANCHORS = {
  'an-loc': { x: 420, y: 250 },
  'ban-me-thuot': { x: 560, y: 220 },
  'bac-lieu': { x: -688.2524155538835, y: 3201.090345385517 },
  'chau-doc': { x: -836.2225463876869, y: 2127.540527724862 },
  'da-lat': { x: 640, y: 360 },
  'dak-to': { x: 531.8295401573785, y: -1861.4532306383767 },
  'khe-sanh': { x: -300, y: -3660 },
  'long-phu': { x: 18.798184327553713, y: 2975.179536069467 },
} as const;

const EXPECTED_FITL_CONNECTION_ROUTE_SHAPES = {
  'loc-ban-me-thuot-da-lat:none': {
    points: [
      { kind: 'anchor', anchorId: 'ban-me-thuot' },
      { kind: 'anchor', anchorId: 'da-lat' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-cam-ranh-da-lat:none': {
    points: [
      { kind: 'zone', zoneId: 'cam-ranh:none' },
      { kind: 'anchor', anchorId: 'da-lat' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-can-tho-bac-lieu:none': {
    points: [
      { kind: 'zone', zoneId: 'can-tho:none' },
      { kind: 'anchor', anchorId: 'bac-lieu' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-can-tho-chau-doc:none': {
    points: [
      { kind: 'zone', zoneId: 'can-tho:none' },
      { kind: 'anchor', anchorId: 'chau-doc' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-can-tho-long-phu:none': {
    points: [
      { kind: 'zone', zoneId: 'can-tho:none' },
      { kind: 'anchor', anchorId: 'long-phu' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-da-nang-dak-to:none': {
    points: [
      { kind: 'zone', zoneId: 'da-nang:none' },
      { kind: 'anchor', anchorId: 'dak-to' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-da-nang-qui-nhon:none': {
    points: [
      { kind: 'zone', zoneId: 'da-nang:none' },
      { kind: 'zone', zoneId: 'qui-nhon:none' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-hue-da-nang:none': {
    points: [
      { kind: 'zone', zoneId: 'da-nang:none', anchor: 108.768277436591 },
      { kind: 'zone', zoneId: 'hue:none', anchor: 310.3800982106113 },
    ],
    segments: [
      { kind: 'quadratic', control: { kind: 'curvature', offset: 0.07697466730587194, angle: 69.23538545589986 } },
    ],
  },
  'loc-hue-khe-sanh:none': {
    points: [
      { kind: 'zone', zoneId: 'hue:none' },
      { kind: 'anchor', anchorId: 'khe-sanh' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-kontum-ban-me-thuot:none': {
    points: [
      { kind: 'zone', zoneId: 'kontum:none' },
      { kind: 'anchor', anchorId: 'ban-me-thuot' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-kontum-dak-to:none': {
    points: [
      { kind: 'zone', zoneId: 'kontum:none' },
      { kind: 'anchor', anchorId: 'dak-to' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-kontum-qui-nhon:none': {
    points: [
      { kind: 'zone', zoneId: 'kontum:none' },
      { kind: 'zone', zoneId: 'qui-nhon:none' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-qui-nhon-cam-ranh:none': {
    points: [
      { kind: 'zone', zoneId: 'cam-ranh:none' },
      { kind: 'zone', zoneId: 'qui-nhon:none' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-saigon-an-loc-ban-me-thuot:none': {
    points: [
      { kind: 'zone', zoneId: 'saigon:none' },
      { kind: 'anchor', anchorId: 'an-loc' },
      { kind: 'anchor', anchorId: 'ban-me-thuot' },
    ],
    segments: [
      { kind: 'straight' },
      { kind: 'quadratic', control: { kind: 'curvature', offset: 0.26023445680592805, angle: 289.50202781725375 } },
    ],
  },
  'loc-saigon-cam-ranh:none': {
    points: [
      { kind: 'zone', zoneId: 'cam-ranh:none' },
      { kind: 'zone', zoneId: 'saigon:none' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-saigon-can-tho:none': {
    points: [
      { kind: 'zone', zoneId: 'can-tho:none' },
      { kind: 'zone', zoneId: 'saigon:none' },
    ],
    segments: [{ kind: 'straight' }],
  },
  'loc-saigon-da-lat:none': {
    points: [
      { kind: 'zone', zoneId: 'saigon:none' },
      { kind: 'anchor', anchorId: 'da-lat' },
    ],
    segments: [{ kind: 'straight' }],
  },
} as const satisfies Record<string, {
  readonly points: readonly (
    | { readonly kind: 'zone'; readonly zoneId: string; readonly anchor?: number }
    | { readonly kind: 'anchor'; readonly anchorId: string }
  )[];
  readonly segments: readonly (
    | { readonly kind: 'straight' }
    | {
      readonly kind: 'quadratic';
      readonly control:
        | { readonly kind: 'curvature'; readonly offset?: number; readonly angle?: number }
        | { readonly kind: 'anchor'; readonly anchorId?: string }
        | { readonly kind: 'position'; readonly x?: number; readonly y?: number }
    }
  )[];
}>;

const EXPECTED_FITL_SHARED_JUNCTIONS = [
  {
    id: 'junction:anchor:ban-me-thuot',
    connectionIds: [
      'loc-ban-me-thuot-da-lat:none',
      'loc-kontum-ban-me-thuot:none',
      'loc-saigon-an-loc-ban-me-thuot:none',
    ],
  },
  {
    id: 'junction:anchor:da-lat',
    connectionIds: [
      'loc-ban-me-thuot-da-lat:none',
      'loc-cam-ranh-da-lat:none',
      'loc-saigon-da-lat:none',
    ],
  },
  {
    id: 'junction:anchor:dak-to',
    connectionIds: [
      'loc-da-nang-dak-to:none',
      'loc-kontum-dak-to:none',
    ],
    position: { x: 531.8295401573785, y: -1861.4532306383767 },
  },
] as const;

function normalizeConnectionRouteDefinitions(
  routes: Readonly<Record<string, ConnectionRouteDefinition>>,
) {
  return Object.fromEntries(
    Object.entries(routes).map(([routeId, route]) => [
      routeId,
      {
        points: route.points.map((point) => (
          point.kind === 'zone'
            ? { kind: 'zone', zoneId: point.zoneId, ...(point.anchor === undefined ? {} : { anchor: point.anchor }) }
            : { kind: 'anchor', anchorId: point.anchorId }
        )),
        segments: route.segments.map((segment) => (
          segment.kind === 'straight'
            ? { kind: 'straight' as const }
            : {
              kind: 'quadratic' as const,
              control: {
                kind: segment.control.kind,
                ...(segment.control.kind === 'curvature'
                  ? {
                    offset: segment.control.offset,
                    ...(segment.control.angle === undefined ? {} : { angle: segment.control.angle }),
                  }
                  : {}),
                ...(segment.control.kind === 'anchor' ? { anchorId: segment.control.anchorId } : {}),
                ...(segment.control.kind === 'position'
                  ? { x: segment.control.x, y: segment.control.y }
                  : {}),
              },
            }
        )),
      },
    ]),
  );
}

function repoRootPath(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return resolve(testDir, '../../../..');
}

function readText(pathFromRepoRoot: string): string {
  return readFileSync(resolve(repoRootPath(), pathFromRepoRoot), 'utf8');
}

function readYaml(pathFromRepoRoot: string): unknown {
  return parse(readText(pathFromRepoRoot));
}

function readJson(pathFromRepoRoot: string): unknown {
  return JSON.parse(readText(pathFromRepoRoot));
}

function compileProductionGameDef(pathFromRepoRoot: string) {
  const bundle = loadGameSpecBundleFromEntrypoint(resolve(repoRootPath(), pathFromRepoRoot));
  const staged = runGameSpecStagesFromBundle(bundle);
  expect(staged.parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
  expect(staged.validation.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
  expect(staged.compilation.blocked).toBe(false);
  const compiled = staged.compilation.result;
  expect(compiled).not.toBeNull();
  if (compiled === null) {
    throw new Error(`Expected compiled GameDef for ${pathFromRepoRoot}`);
  }
  expect(compiled.gameDef).not.toBeNull();
  if (compiled.gameDef === null) {
    throw new Error(`Expected non-null gameDef for ${pathFromRepoRoot}`);
  }
  return compiled.gameDef;
}

function resolveExpectedRouteSegments(
  route: {
    readonly points: readonly ConnectionRouteDefinition['points'][number][];
    readonly segments: readonly ConnectionRouteDefinition['segments'][number][];
  },
  path: readonly ResolvedConnectionPoint[],
) {
  return route.segments.map((segment, index) => {
    if (segment.kind === 'straight') {
      return { kind: 'straight' } as const;
    }

    const control = segment.control;
    if (control.kind === 'anchor') {
      return {
        kind: 'quadratic',
        controlPoint: { kind: 'anchor', id: control.anchorId },
      } as const;
    }

    if (control.kind === 'position') {
      return {
        kind: 'quadratic',
        controlPoint: {
          kind: 'position',
          id: null,
          position: { x: control.x, y: control.y },
        },
      } as const;
    }

    return {
      kind: 'quadratic',
      controlPoint: {
        kind: 'curvature',
        id: null,
        position: resolveCurvatureControlPoint(
          path[index]!.position,
          path[index + 1]!.position,
          control.offset,
          control.angle,
        ),
      },
    } as const;
  });
}

describe('visual-config.yaml files', () => {
  it.each(
    assertBootstrapTargetDefinitions(readJson('packages/runner/src/bootstrap/bootstrap-targets.json')),
  )(
    'production visual config for $id passes strict schema + reference validation against its compiled GameDef',
    { timeout: 15_000 },
    (target) => {
      const parsed = parseVisualConfigStrict(readYaml(`${target.generatedFromSpecPath}/visual-config.yaml`));
      const gameDef = compileProductionGameDef(target.specEntrypoint);
      const errors = parsed === null ? [] : validateVisualConfigRefs(parsed, buildRefValidationContext(gameDef));

      expect(errors).toEqual([]);
    },
  );

  it('FITL visual-config parses and validates against VisualConfigSchema', () => {
    const raw = readText('data/games/fire-in-the-lake/visual-config.yaml');
    expect(raw.trimStart().startsWith('version: 1')).toBe(true);

    const parsed = readYaml('data/games/fire-in-the-lake/visual-config.yaml');
    const result = VisualConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it(
    'FITL visual-config uses canonical runtime ids and expected visual rule chain',
    { timeout: 15_000 },
    () => {
    const parsed = VisualConfigSchema.parse(readYaml('data/games/fire-in-the-lake/visual-config.yaml'));
    const fitlGameDef = compileProductionGameDef('data/games/fire-in-the-lake.game-spec.md');
    const provider = new VisualConfigProvider(parsed);
    const internalScenarioDeckZones = fitlGameDef.zones.filter((zone) => zone.isInternal === true);

    const boardZoneIds = new Set(
      fitlGameDef.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => zone.id as string),
    );
    const allZoneIds = new Set(fitlGameDef.zones.map((zone) => zone.id as string));

    const overrideKeys = Object.keys(parsed.zones?.overrides ?? {});
    expect(overrideKeys.length).toBe(47);
    for (const zoneId of overrideKeys) {
      expect(boardZoneIds.has(zoneId)).toBe(true);
    }
    expect(internalScenarioDeckZones.length).toBeGreaterThan(0);
    for (const zone of internalScenarioDeckZones) {
      expect(zone.zoneKind).toBe('aux');
      expect(zone.isInternal).toBe(true);
      expect(overrideKeys.includes(String(zone.id))).toBe(false);
    }

    const layoutRoles = parsed.zones?.layoutRoles ?? {};
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(allZoneIds.has(zoneId)).toBe(true);
      expect(['card', 'forcePool', 'hand', 'other']).toContain(role);
    }

    expect(parsed.zones?.tokenLayouts).toEqual({
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
    });
    expect(parsed.zones?.tokenLayouts?.assignments?.byCategory?.loc).toBeUndefined();

    expect(parsed.edges?.default).toEqual({
      color: '#ffffff',
      width: 3.5,
      alpha: 0.85,
    });
    expect(parsed.edges?.categoryStyles).toBeUndefined();
    expect(parsed.factions).toMatchObject({
      us: { color: '#808000', displayName: 'United States' },
      arvn: { color: '#ffff00', displayName: 'ARVN' },
      nva: { color: '#ff0000', displayName: 'NVA' },
      vc: { color: '#00bfff', displayName: 'Viet Cong' },
    });
    expect(parsed.victoryStandings?.tooltipBreakdowns).toEqual([
      {
        seat: 'us',
        componentsById: {
          markerTotal: {
            label: 'Total Support',
            description: 'Population-weighted support (active x2, passive x1)',
            detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
          },
          zoneCount: {
            label: 'Available US Pieces',
            description: 'Troops and bases in Available space',
            detailTemplate: '{contribution}',
          },
        },
      },
      {
        seat: 'arvn',
        componentsById: {
          controlledPopulation: {
            label: 'COIN-Controlled Population',
            description: 'Population where US+ARVN pieces > NVA+VC pieces',
            detailTemplate: '(pop {population}) = {contribution}',
          },
          globalVar: {
            label: 'Patronage',
            description: 'ARVN political support (global variable)',
            detailTemplate: '{contribution}',
          },
        },
      },
      {
        seat: 'nva',
        componentsById: {
          controlledPopulation: {
            label: 'NVA-Controlled Population',
            description: 'Population where NVA pieces > all others combined',
            detailTemplate: '(pop {population}) = {contribution}',
          },
          mapBases: {
            label: 'NVA Bases on Map',
            description: 'NVA bases across all map spaces',
            detailTemplate: '{contribution}',
          },
        },
      },
      {
        seat: 'vc',
        componentsById: {
          markerTotal: {
            label: 'Total Opposition',
            description: 'Population-weighted opposition (active x2, passive x1)',
            detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
          },
          mapBases: {
            label: 'VC Bases on Map',
            description: 'VC bases across all map spaces',
            detailTemplate: '{contribution}',
          },
        },
      },
    ]);
    expect(provider.getVictoryTooltipComponentMetadata('vc', 'markerTotal')).toEqual({
      label: 'Total Opposition',
      description: 'Population-weighted opposition (active x2, passive x1)',
      detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
    });
    expect(provider.getVictoryTooltipComponentMetadata('vc', 'zoneCount')).toBeNull();
    expect(parsed.tokens?.stackBadge).toEqual({
      fontSize: 13,
      fill: '#f8fafc',
      stroke: '#000000',
      strokeWidth: 3,
      anchorX: 1,
      anchorY: 0,
      offsetX: 4,
      offsetY: -4,
    });

    const attributeRules = parsed.zones?.attributeRules ?? [];
    expect(attributeRules).toHaveLength(8);
    expect(attributeRules).toEqual([
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'highland' } },
        style: { color: '#d4a656', strokeColor: '#8b6914' },
      },
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'jungle' } },
        style: { color: '#1a5c2a', strokeColor: '#0d3d18' },
      },
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'lowland' } },
        style: { color: '#5db85d', strokeColor: '#2d7a2d' },
      },
      {
        match: { category: ['province'], attributeContains: { country: 'northVietnam' } },
        style: { color: '#8b5e3c', strokeColor: '#5a3d20' },
      },
      {
        match: { category: ['province'], attributeContains: { country: 'laos' } },
        style: { color: '#6b8f7b', strokeColor: '#4a6b58' },
      },
      {
        match: { category: ['province'], attributeContains: { country: 'cambodia' } },
        style: { color: '#7a8868', strokeColor: '#586345' },
      },
      {
        match: { category: ['loc'], attributeContains: { terrainTags: 'highway' } },
        style: { connectionStyleKey: 'highway' },
      },
      {
        match: { category: ['loc'], attributeContains: { terrainTags: 'mekong' } },
        style: { connectionStyleKey: 'mekong' },
      },
    ]);
    expect(parsed.zones?.categoryStyles?.loc).toEqual({
      shape: 'connection',
    });
    expect(parsed.zones?.connectionStyles).toEqual({
      highway: {
        strokeWidth: 10,
        strokeColor: '#8b7355',
        strokeAlpha: 0.8,
      },
      mekong: {
        strokeWidth: 14,
        strokeColor: '#4a7a8c',
        strokeAlpha: 0.9,
        wavy: true,
        waveAmplitude: 4,
        waveFrequency: 0.08,
      },
    });
    const connectionAnchors = parsed.zones?.connectionAnchors ?? {};
    const connectionRoutes = parsed.zones?.connectionRoutes ?? {};
    expect(Object.keys(connectionAnchors).sort()).toEqual(Object.keys(EXPECTED_FITL_CONNECTION_ANCHORS).sort());
    for (const [anchorId, anchor] of Object.entries(connectionAnchors)) {
      expect(anchor).toEqual(EXPECTED_FITL_CONNECTION_ANCHORS[anchorId as keyof typeof EXPECTED_FITL_CONNECTION_ANCHORS]);
    }
    expect(normalizeConnectionRouteDefinitions(connectionRoutes)).toEqual(EXPECTED_FITL_CONNECTION_ROUTE_SHAPES);

    const fitlBoardZones = fitlGameDef.zones.filter((zone) => zone.zoneKind === 'board' && zone.isInternal !== true);
    const fitlLocZones = fitlBoardZones.filter((zone) => zone.category === 'loc');
    expect(fitlLocZones).toHaveLength(17);
    expect(provider.getConnectionAnchors()).toEqual(
      new Map(Object.entries(connectionAnchors)),
    );
    expect(provider.getConnectionRoutes()).toEqual(
      new Map(Object.entries(connectionRoutes)),
    );
    for (const zone of fitlLocZones) {
      const visual = provider.resolveZoneVisual(String(zone.id), zone.category ?? null, zone.attributes ?? {});
      const terrainTags = Array.isArray(zone.attributes?.terrainTags)
        ? zone.attributes.terrainTags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      expect(visual.shape).toBe('connection');
      if (terrainTags.includes('highway')) {
        expect(visual.connectionStyleKey).toBe('highway');
      }
      if (terrainTags.includes('mekong')) {
        expect(visual.connectionStyleKey).toBe('mekong');
      }
    }

    const zones = fitlBoardZones.map((zone) => ({
      id: String(zone.id),
      displayName: String(zone.id),
      ownerID: null,
      isSelectable: false,
      category: zone.category ?? null,
      attributes: zone.attributes ?? {},
      visual: provider.resolveZoneVisual(String(zone.id), zone.category ?? null, zone.attributes ?? {}),
      render: {
        fillColor: '#000000',
        stroke: { color: '#111827', width: 1, alpha: 1 },
        hiddenStackCount: 0,
        nameLabel: { text: String(zone.id), x: 0, y: 0, visible: true },
        markersLabel: { text: '', x: 0, y: 0, visible: false },
        badge: null,
      },
    }));
    const adjacencies = fitlBoardZones.flatMap((zone) =>
      (zone.adjacentTo ?? []).map((adjacency) => ({
        from: String(zone.id),
        to: String(adjacency.to),
        category: adjacency.category ?? null,
        isHighlighted: false,
      })));
    const positions = new Map(
      fitlBoardZones.map((zone, index) => [String(zone.id), { x: index * 10, y: index * 5 }]),
    );
    const resolution = resolveConnectionRoutes({
      zones,
      adjacencies,
      positions,
      routeDefinitions: provider.getConnectionRoutes(),
      anchorPositions: provider.getConnectionAnchors(),
    });
    expect(resolution.connectionRoutes).toHaveLength(17);
    const hueDaNangRoute = resolution.connectionRoutes.find((route) => route.zoneId === 'loc-hue-da-nang:none');
    expect(hueDaNangRoute?.path).toEqual([
      {
        kind: 'zone',
        id: 'da-nang:none',
        position: { x: expect.closeTo(-15.739321681978065, 5), y: expect.closeTo(-70.74620333291732, 5) },
      },
      {
        kind: 'zone',
        id: 'hue:none',
        position: { x: expect.closeTo(51.828427224346214, 5), y: expect.closeTo(60.941070973938814, 5) },
      },
    ]);
    expect(Object.fromEntries(
      resolution.connectionRoutes.map((route) => [route.zoneId, {
        points: route.path.map((point) => (
          point.kind === 'zone'
            ? { kind: 'zone', zoneId: point.id }
            : { kind: 'anchor', anchorId: point.id }
        )),
        segments: route.segments,
      }]),
    )).toEqual(
      Object.fromEntries(
        Object.entries(connectionRoutes).map(([routeId, route]) => {
          const resolvedRoute = resolution.connectionRoutes.find((entry) => entry.zoneId === routeId);
          expect(resolvedRoute).toBeDefined();
          return [
            routeId,
            {
              points: route.points.map((point) => (
                point.kind === 'zone'
                  ? { kind: 'zone', zoneId: point.zoneId }
                  : { kind: 'anchor', anchorId: point.anchorId }
              )),
              segments: resolveExpectedRouteSegments(route, resolvedRoute!.path),
            },
          ];
        }),
      ),
    );
    expect(resolution.junctions).toEqual(
      EXPECTED_FITL_SHARED_JUNCTIONS.map((junction) => ({
        ...junction,
        position: connectionAnchors[junction.id.replace('junction:anchor:', '')]!,
      })),
    );

    expect(parsed.tokenTypes?.['us-irregulars']?.shape).toBe('beveled-cylinder');
    expect(parsed.tokenTypes?.['arvn-rangers']?.shape).toBe('beveled-cylinder');
    expect(parsed.tokenTypes?.['nva-guerrillas']?.shape).toBe('beveled-cylinder');
    expect(parsed.tokenTypes?.['vc-guerrillas']?.shape).toBe('beveled-cylinder');
    expect(parsed.tokenTypes?.['us-troops']?.shape).toBe('square');
    expect(parsed.tokenTypes?.['arvn-troops']?.shape).toBe('square');
    expect(parsed.tokenTypes?.['arvn-police']?.shape).toBe('square');
    expect(parsed.tokenTypes?.['nva-troops']?.shape).toBe('square');
    expect(parsed.tokenTypes?.['vc-guerrillas']?.symbol).toBeUndefined();
    expect(parsed.tokenTypes?.['vc-guerrillas']?.symbolRules).toEqual([
      {
        when: [{ prop: 'activity', equals: 'active' }],
        symbol: 'star',
      },
    ]);

    expect(parsed.tokenTypes?.['us-troops']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['us-bases']?.presentation).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(parsed.tokenTypes?.['us-irregulars']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['arvn-troops']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['arvn-police']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['arvn-rangers']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['arvn-bases']?.presentation).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(parsed.tokenTypes?.['nva-troops']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['nva-guerrillas']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['nva-bases']?.presentation).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    expect(parsed.tokenTypes?.['vc-guerrillas']?.presentation).toEqual({
      lane: 'regular',
      scale: 1,
    });
    expect(parsed.tokenTypes?.['vc-bases']?.presentation).toEqual({
      lane: 'base',
      scale: 1.5,
    });
    },
  );

  it(
    'FITL actions section contains correct display names and choice prompts for all configured actions',
    { timeout: 15_000 },
    () => {
    const parsed = VisualConfigSchema.parse(readYaml('data/games/fire-in-the-lake/visual-config.yaml'));
    const fitlGameDef = compileProductionGameDef('data/games/fire-in-the-lake.game-spec.md');
    const provider = new VisualConfigProvider(parsed);

    // All action IDs in the visual config must exist in the compiled GameDef
    const gameDefActionIds = new Set([
      ...fitlGameDef.actions.map((a) => a.id as string),
      ...(fitlGameDef.actionPipelines ?? []).map((p) => p.actionId as string),
    ]);
    const configActionIds = Object.keys(parsed.actions ?? {});
    expect(configActionIds.length).toBeGreaterThan(0);
    for (const actionId of configActionIds) {
      expect(
        gameDefActionIds.has(actionId),
        `Action "${actionId}" in visual config not found in GameDef`,
      ).toBe(true);
    }

    // Display name fixes for badly-formatting action IDs
    expect(provider.getActionDisplayName('ambushNva')).toBe('NVA Ambush');
    expect(provider.getActionDisplayName('ambushVc')).toBe('VC Ambush');
    expect(provider.getActionDisplayName('airLift')).toBe('Airlift');
    expect(provider.getActionDisplayName('airStrike')).toBe('Air Strike');
    expect(provider.getActionDisplayName('coupArvnRedeployMandatory')).toBe('Coup: ARVN Mandatory Redeploy');
    expect(provider.getActionDisplayName('coupArvnRedeployOptionalTroops')).toBe('Coup: ARVN Troop Redeploy');
    expect(provider.getActionDisplayName('coupArvnRedeployPolice')).toBe('Coup: ARVN Police Redeploy');
    expect(provider.getActionDisplayName('coupNvaRedeployTroops')).toBe('Coup: NVA Troop Redeploy');

    // Choice prompts for all 8 core operations
    const coreOps = ['train', 'patrol', 'sweep', 'assault', 'rally', 'march', 'attack', 'terror'];
    for (const op of coreOps) {
      expect(
        provider.getChoicePrompt(op, 'targetSpaces'),
        `Missing targetSpaces prompt for "${op}"`,
      ).toBeTruthy();
    }

    // Choice prompts for special activities
    expect(provider.getChoicePrompt('airLift', 'spaces')).toBeTruthy();
    expect(provider.getChoicePrompt('airStrike', 'spaces')).toBeTruthy();
    expect(provider.getChoicePrompt('advise', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('govern', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('transport', 'transportOrigin')).toBeTruthy();
    expect(provider.getChoicePrompt('raid', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('infiltrate', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('bombard', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('tax', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('subvert', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('ambushNva', 'targetSpaces')).toBeTruthy();
    expect(provider.getChoicePrompt('ambushVc', 'targetSpaces')).toBeTruthy();

    // Actions without configured display names should return null (auto-format handles them)
    expect(provider.getActionDisplayName('train')).toBeNull();
    expect(provider.getActionDisplayName('patrol')).toBeNull();
    },
  );

  it("Texas visual-config parses, validates, and uses explicit runtime ids for roles/animation", () => {
    const raw = readText('data/games/texas-holdem/visual-config.yaml');
    expect(raw.trimStart().startsWith('version: 1')).toBe(true);

    const parsed = VisualConfigSchema.parse(readYaml('data/games/texas-holdem/visual-config.yaml'));
    const texasGameDef = compileProductionGameDef('data/games/texas-holdem.game-spec.md');
    const texasZoneIds = new Set(texasGameDef.zones.map((zone) => zone.id as string));

    expect(parsed.layout?.mode).toBe('table');
    expect(parsed.layout?.tableBackground).toEqual({
      color: '#0a5c2e',
      shape: 'ellipse',
      paddingX: 100,
      paddingY: 80,
      borderColor: '#4a2c0a',
      borderWidth: 4,
    });
    expect(parsed.cardAnimation?.cardTokenTypes.idPrefixes).toEqual(['card-']);
    expect(parsed.cardAnimation?.zoneRoles).toEqual({
      draw: ['deck:none'],
      hand: ['hand:0', 'hand:1', 'hand:2', 'hand:3', 'hand:4', 'hand:5', 'hand:6', 'hand:7', 'hand:8', 'hand:9'],
      shared: ['community:none'],
      burn: ['burn:none'],
      discard: ['muck:none'],
    });
    expect(parsed.cards?.assignments).toEqual([
      {
        match: { idPrefixes: ['card-'] },
        template: 'poker-card',
      },
    ]);
    expect(parsed.cards?.templates?.['poker-card']).toEqual({
      width: 48,
      height: 68,
      layout: {
        rankCorner: {
          y: 4,
          x: 4,
          fontSize: 9,
          align: 'left',
          sourceField: 'rankName',
          colorFromProp: 'suitName',
          colorMap: {
            Spades: '#1e293b',
            Hearts: '#dc2626',
            Diamonds: '#dc2626',
            Clubs: '#1e293b',
          },
        },
        suitCenter: {
          y: 20,
          fontSize: 18,
          align: 'center',
          sourceField: 'suitName',
          symbolMap: {
            Spades: '♠',
            Hearts: '♥',
            Diamonds: '♦',
            Clubs: '♣',
          },
          colorFromProp: 'suitName',
          colorMap: {
            Spades: '#1e293b',
            Hearts: '#dc2626',
            Diamonds: '#dc2626',
            Clubs: '#1e293b',
          },
        },
        rankBottom: {
          y: 52,
          x: -4,
          fontSize: 9,
          align: 'right',
          sourceField: 'rankName',
          colorFromProp: 'suitName',
          colorMap: {
            Spades: '#1e293b',
            Hearts: '#dc2626',
            Diamonds: '#dc2626',
            Clubs: '#1e293b',
          },
        },
      },
    });
    expect(parsed.tableOverlays).toEqual({
      playerSeatAnchorZones: ['hand:0', 'hand:1', 'hand:2', 'hand:3', 'hand:4', 'hand:5', 'hand:6', 'hand:7', 'hand:8', 'hand:9'],
      items: [
        {
          kind: 'globalVar',
          varName: 'pot',
          label: 'Pot',
          position: 'tableCenter',
          offsetY: 60,
          fontSize: 14,
          color: '#fbbf24',
        },
        {
          kind: 'perPlayerVar',
          varName: 'streetBet',
          label: 'Bet',
          position: 'playerSeat',
          offsetY: 75,
          fontSize: 11,
          color: '#94a3b8',
        },
        {
          kind: 'marker',
          varName: 'dealerSeat',
          label: 'D',
          position: 'playerSeat',
          offsetX: -50,
          offsetY: 75,
          markerShape: 'circle',
          color: '#fbbf24',
        },
      ],
    });
    expect(parsed.runnerSurfaces?.showdown).toEqual({
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
        zones: ['hand:0', 'hand:1', 'hand:2', 'hand:3', 'hand:4', 'hand:5', 'hand:6', 'hand:7', 'hand:8', 'hand:9'],
      },
    });
    const tableOverlays = parsed.tableOverlays?.items ?? [];
    const betOverlay = tableOverlays.find(
      (item) => item.kind === 'perPlayerVar' && item.varName === 'streetBet',
    );
    const dealerOverlay = tableOverlays.find(
      (item) => item.kind === 'marker' && item.varName === 'dealerSeat',
    );
    expect(betOverlay?.offsetY ?? 0).toBeGreaterThan(0);
    expect(dealerOverlay?.offsetX ?? 0).toBeLessThan(0);
    expect(dealerOverlay?.offsetY ?? 0).toBeGreaterThan(0);
    expect(parsed.tableOverlays?.playerSeatAnchorZones).toEqual([
      'hand:0',
      'hand:1',
      'hand:2',
      'hand:3',
      'hand:4',
      'hand:5',
      'hand:6',
      'hand:7',
      'hand:8',
      'hand:9',
    ]);

    const layoutRoles = parsed.zones?.layoutRoles ?? {};
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(texasZoneIds.has(zoneId)).toBe(true);
      expect(['card', 'forcePool', 'hand', 'other']).toContain(role);
    }
  });
});
