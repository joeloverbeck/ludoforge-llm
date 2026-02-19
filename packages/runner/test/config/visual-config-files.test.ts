import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { VisualConfigSchema } from '../../src/config/visual-config-types';

interface BootstrapZone {
  readonly id: string;
  readonly zoneKind?: 'board' | 'aux';
  readonly layoutRole?: 'card' | 'forcePool' | 'hand' | 'other';
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

function readJson<T>(pathFromRepoRoot: string): T {
  return JSON.parse(readText(pathFromRepoRoot)) as T;
}

describe('visual-config.yaml files', () => {
  it('FITL visual-config parses and validates against VisualConfigSchema', () => {
    const raw = readText('data/games/fire-in-the-lake/visual-config.yaml');
    expect(raw.trimStart().startsWith('version: 1')).toBe(true);

    const parsed = readYaml('data/games/fire-in-the-lake/visual-config.yaml');
    const result = VisualConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('FITL visual-config uses canonical runtime ids and expected visual rule chain', () => {
    const parsed = VisualConfigSchema.parse(readYaml('data/games/fire-in-the-lake/visual-config.yaml'));
    const fitlBootstrap = readJson<{ readonly zones: readonly BootstrapZone[] }>(
      'packages/runner/src/bootstrap/fitl-game-def.json',
    );

    const boardZoneIds = new Set(
      fitlBootstrap.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => zone.id),
    );
    const roleZoneMap = new Map(
      fitlBootstrap.zones.filter((zone) => zone.layoutRole !== undefined).map((zone) => [zone.id, zone.layoutRole]),
    );

    const overrideKeys = Object.keys(parsed.zones?.overrides ?? {});
    expect(overrideKeys.length).toBe(47);
    for (const zoneId of overrideKeys) {
      expect(boardZoneIds.has(zoneId)).toBe(true);
    }

    const layoutRoles = parsed.zones?.layoutRoles ?? {};
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(roleZoneMap.get(zoneId)).toBe(role);
    }

    const attributeRules = parsed.zones?.attributeRules ?? [];
    expect(attributeRules).toHaveLength(5);
    expect(attributeRules).toEqual([
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'highland' } },
        style: { color: '#6b5b3e' },
      },
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'jungle' } },
        style: { color: '#3d5c3a' },
      },
      {
        match: { category: ['province'], attributeContains: { terrainTags: 'lowland' } },
        style: { color: '#5a7a52' },
      },
      {
        match: { category: ['loc'], attributeContains: { terrainTags: 'highway' } },
        style: { color: '#8b7355' },
      },
      {
        match: { category: ['loc'], attributeContains: { terrainTags: 'mekong' } },
        style: { color: '#4a7a8c' },
      },
    ]);
  });

  it("Texas visual-config parses, validates, and uses explicit runtime ids for roles/animation", () => {
    const raw = readText('data/games/texas-holdem/visual-config.yaml');
    expect(raw.trimStart().startsWith('version: 1')).toBe(true);

    const parsed = VisualConfigSchema.parse(readYaml('data/games/texas-holdem/visual-config.yaml'));
    const texasBootstrap = readJson<{ readonly zones: readonly BootstrapZone[] }>(
      'packages/runner/src/bootstrap/texas-game-def.json',
    );

    const bootstrapRoles = new Map(
      texasBootstrap.zones.filter((zone) => zone.layoutRole !== undefined).map((zone) => [zone.id, zone.layoutRole]),
    );

    expect(parsed.layout?.mode).toBe('table');
    expect(parsed.cardAnimation?.cardTokenTypes.idPrefixes).toEqual(['card-']);
    expect(parsed.cardAnimation?.zoneRoles).toEqual({
      draw: ['deck:none'],
      hand: ['hand:0', 'hand:1', 'hand:2', 'hand:3', 'hand:4', 'hand:5', 'hand:6', 'hand:7', 'hand:8', 'hand:9'],
      shared: ['community:none'],
      burn: ['burn:none'],
      discard: ['muck:none'],
    });

    const layoutRoles = parsed.zones?.layoutRoles ?? {};
    expect(Object.keys(layoutRoles).sort()).toEqual([...bootstrapRoles.keys()].sort());
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(bootstrapRoles.get(zoneId)).toBe(role);
    }
  });
});
