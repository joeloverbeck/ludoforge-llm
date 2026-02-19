import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileGameSpecToGameDef, loadGameSpecSource, parseGameSpec } from '@ludoforge/engine/cnl';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { VisualConfigSchema } from '../../src/config/visual-config-types';

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

function compileProductionGameDef(pathFromRepoRoot: string) {
  const markdown = loadGameSpecSource(resolve(repoRootPath(), pathFromRepoRoot)).markdown;
  const parsed = parseGameSpec(markdown);
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
  expect(compiled.gameDef).not.toBeNull();
  return compiled.gameDef!;
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
    const fitlGameDef = compileProductionGameDef('data/games/fire-in-the-lake');

    const boardZoneIds = new Set(
      fitlGameDef.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => zone.id as string),
    );
    const allZoneIds = new Set(fitlGameDef.zones.map((zone) => zone.id as string));

    const overrideKeys = Object.keys(parsed.zones?.overrides ?? {});
    expect(overrideKeys.length).toBe(47);
    for (const zoneId of overrideKeys) {
      expect(boardZoneIds.has(zoneId)).toBe(true);
    }

    const layoutRoles = parsed.zones?.layoutRoles ?? {};
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(allZoneIds.has(zoneId)).toBe(true);
      expect(['card', 'forcePool', 'hand', 'other']).toContain(role);
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
    const texasGameDef = compileProductionGameDef('data/games/texas-holdem');
    const texasZoneIds = new Set(texasGameDef.zones.map((zone) => zone.id as string));

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
    for (const [zoneId, role] of Object.entries(layoutRoles)) {
      expect(texasZoneIds.has(zoneId)).toBe(true);
      expect(['card', 'forcePool', 'hand', 'other']).toContain(role);
    }
  });
});
