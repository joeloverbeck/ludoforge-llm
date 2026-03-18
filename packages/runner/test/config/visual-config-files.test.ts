import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '@ludoforge/engine/cnl';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { assertBootstrapTargetDefinitions } from '../../src/bootstrap/bootstrap-registry';
import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import { VisualConfigSchema } from '../../src/config/visual-config-types';
import {
  buildRefValidationContext,
  parseVisualConfigStrict,
  validateVisualConfigRefs,
} from '../../src/config/validate-visual-config-refs';

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
      color: '#6b7280',
      width: 1.5,
      alpha: 0.3,
    });
    expect(parsed.edges?.categoryStyles?.loc).toEqual({
      color: '#8b7355',
      width: 2,
    });
    expect(parsed.factions).toMatchObject({
      us: { color: '#808000', displayName: 'United States' },
      arvn: { color: '#ffff00', displayName: 'ARVN' },
      nva: { color: '#ff0000', displayName: 'NVA' },
      vc: { color: '#00bfff', displayName: 'Viet Cong' },
    });
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
