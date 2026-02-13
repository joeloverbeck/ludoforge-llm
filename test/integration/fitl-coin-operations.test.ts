import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('FITL COIN operations integration', () => {
  it('compiles COIN Train/Patrol/Sweep/Assault operation profiles from fixture data', () => {
    const markdown = readCompilerFixture('fitl-operations-coin.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.operationProfiles?.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) })),
      [
        { id: 'train-us-profile', actionId: 'train' },
        { id: 'train-arvn-profile', actionId: 'train' },
        { id: 'patrol-us-profile', actionId: 'patrol' },
        { id: 'sweep-profile', actionId: 'sweep' },
        { id: 'assault-profile', actionId: 'assault' },
      ],
    );
  });

  it('executes stub COIN operations through compiled operationProfiles instead of fallback action effects', () => {
    const markdown = readCompilerFixture('fitl-operations-coin.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    // Train and Patrol require complex params (chooseN/chooseOne decisions) — tested separately.
    // Sweep, Assault are stubs that take empty params.
    const start = initialState(compiled.gameDef!, 73, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('sweep'), params: {} },
      { actionId: asActionId('assault'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    // coinResources: 10 - 1 (sweep) - 3 (assault) = 6
    assert.equal(final.globalVars.coinResources, 6);
    assert.equal(final.globalVars.sweepCount, 1);
    assert.equal(final.globalVars.assaultCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  describe('train-arvn-profile structure', () => {
    const getArvnProfile = () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);
      const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(profile, 'train-arvn-profile must exist');
      return profile;
    };

    it('compiles train-arvn-profile without diagnostics', () => {
      getArvnProfile();
    });

    it('has three resolution stages: select-spaces, resolve-per-space, sub-action', () => {
      const profile = getArvnProfile();
      assert.deepEqual(
        profile.resolution.map((s) => s.stage),
        ['select-spaces', 'resolve-per-space', 'sub-action'],
      );
    });

    it('uses actionId train', () => {
      const profile = getArvnProfile();
      assert.equal(String(profile.actionId), 'train');
    });

    it('has legality when: true (always legal)', () => {
      const profile = getArvnProfile();
      assert.equal(profile.legality.when, true);
    });

    it('has no top-level cost (cost is per-space in resolution)', () => {
      const profile = getArvnProfile();
      assert.equal(profile.cost.spend, undefined);
    });

    it('forbids partial execution', () => {
      const profile = getArvnProfile();
      assert.equal(profile.partialExecution.mode, 'forbid');
    });
  });

  describe('train-arvn-profile acceptance criteria (AC2-AC10)', () => {
    const compileArvnProfile = () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);
      const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(profile, 'train-arvn-profile must exist');
      return profile;
    };

    /** Returns the pre-compilation (parsed YAML) profile with full filter detail. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseArvnProfile = (): any => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const profile = parsed.doc.operationProfiles?.find(
        (p: { id: string }) => p.id === 'train-arvn-profile',
      );
      assert.ok(profile, 'train-arvn-profile must exist in parsed doc');
      return profile;
    };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const findDeep = (obj: any, predicate: (node: any) => boolean): any[] => {
      const results: any[] = [];
      const walk = (node: any): void => {
        if (node === null || node === undefined) return;
        if (predicate(node)) results.push(node);
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
        } else if (typeof node === 'object') {
          for (const value of Object.values(node)) walk(value);
        }
      };
      walk(obj);
      return results;
    };
    it('AC2: space filter excludes spaces with NVA Control', () => {
      // Verify the compiled GameDef preserves zones query ConditionAST filters
      // including the NVA Control exclusion.
      const profile = compileArvnProfile();
      const selectSpaces = profile.resolution[0]!;
      assert.equal(selectSpaces.stage, 'select-spaces');

      // Both LimOp (then) and normal (else) branches must exclude NVA-controlled spaces
      // via a compiled zones filter condition containing:
      //   { op: 'not', arg: { op: '==', left: { ref: 'zoneProp', ... prop: 'control' }, right: 'NVA' } }
      const nvaExclusions = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === 'not' &&
        node?.arg?.op === '==' &&
        node?.arg?.left?.ref === 'zoneProp' &&
        node?.arg?.left?.prop === 'control' &&
        node?.arg?.right === 'NVA',
      );
      assert.ok(
        nvaExclusions.length >= 2,
        `Expected NVA Control exclusion in both LimOp and normal branches, found ${nvaExclusions.length}`,
      );

      // Verify the filter is inside a compiled zones query filter.condition (not just floating)
      const zonesWithConditionFilter = findDeep(selectSpaces.effects, (node: any) =>
        node?.query === 'zones' && node?.filter?.condition !== undefined,
      );
      assert.ok(
        zonesWithConditionFilter.length >= 2,
        `Expected compiled zones queries with condition filters in both branches, found ${zonesWithConditionFilter.length}`,
      );
    });

    it('AC3: costs 3 ARVN Resources when placing pieces', () => {
      const profile = compileArvnProfile();
      const resolvePerSpace = profile.resolution[1]!;
      assert.equal(resolvePerSpace.stage, 'resolve-per-space');

      // Both placement branches (rangers and cubes) must deduct 3 ARVN Resources
      const arvnCosts = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -3,
      );
      assert.ok(
        arvnCosts.length >= 2,
        `Expected at least 2 ARVN Resource cost effects (rangers + cubes), found ${arvnCosts.length}`,
      );
    });

    it('AC4: places Rangers up to 2', () => {
      // Verify macro args at YAML level (rangers, maxPieces: 2) and compiled forEach limit
      const parsed = parseArvnProfile();
      const resolvePerSpace = parsed.resolution[1];

      // Pre-compilation: macro call specifies pieceType: rangers, maxPieces: 2
      const rangerMacro = findDeep(resolvePerSpace!.effects, (node: any) =>
        node?.macro === 'place-from-available-or-map' &&
        node?.args?.pieceType === 'rangers' &&
        node?.args?.maxPieces === 2,
      );
      assert.ok(rangerMacro.length >= 1, 'Expected place-from-available-or-map macro for rangers with maxPieces: 2');

      // Post-compilation: forEach with limit 2 sourcing from available-ARVN with type filter
      const compiled = compileArvnProfile();
      const compiledRps = compiled.resolution[1]!;
      const rangerForEach = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach !== undefined &&
        node.forEach.limit === 2 &&
        node.forEach.over?.query === 'tokensInZone' &&
        node.forEach.over?.zone === 'available-ARVN:none',
      );
      assert.ok(rangerForEach.length >= 1, 'Expected compiled forEach with limit 2 from available-ARVN');

      // Verify compiled token filter preserves piece type
      const rangerFiltered = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach?.over?.query === 'tokensInZone' &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'rangers'),
      );
      assert.ok(rangerFiltered.length >= 1, 'Expected compiled tokensInZone filter for type=rangers');
    });

    it('AC5: places cubes at Cities or at COIN Bases up to 6', () => {
      // Verify macro args at YAML level (troops, maxPieces: 6)
      const parsed = parseArvnProfile();
      const resolvePerSpace = parsed.resolution[1];

      const cubeMacro = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.macro === 'place-from-available-or-map' &&
        node?.args?.pieceType === 'troops' &&
        node?.args?.maxPieces === 6,
      );
      assert.ok(cubeMacro.length >= 1, 'Expected place-from-available-or-map macro for troops with maxPieces: 6');

      // Post-compilation: forEach with limit 6 and city-or-COIN-base condition
      const compiled = compileArvnProfile();
      const compiledRps = compiled.resolution[1]!;
      const cubeForEach = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach !== undefined &&
        node.forEach.limit === 6 &&
        node.forEach.over?.query === 'tokensInZone' &&
        node.forEach.over?.zone === 'available-ARVN:none',
      );
      assert.ok(cubeForEach.length >= 1, 'Expected compiled forEach with limit 6 from available-ARVN');

      // The cube placement branch must require city or COIN base (or condition)
      const cityOrBaseCondition = findDeep(compiledRps.effects, (node: any) =>
        node?.op === 'or' &&
        Array.isArray(node?.args) &&
        findDeep(node.args, (n: any) =>
          n?.op === '==' && n?.left?.ref === 'zoneProp' && n?.left?.prop === 'spaceType' && n?.right === 'city',
        ).length > 0,
      );
      assert.ok(cityOrBaseCondition.length >= 1, 'Expected city-or-COIN-base condition for cube placement');

      // Verify compiled token filter preserves piece type
      const troopsFiltered = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach?.over?.query === 'tokensInZone' &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'troops'),
      );
      assert.ok(troopsFiltered.length >= 1, 'Expected compiled tokensInZone filter for type=troops');
    });

    it('AC6: Pacification requires ARVN Troops AND Police in space', () => {
      // The compiler now preserves tokensInZone filters in compiled output.
      // Verify the compiled GameDef has distinct token type filters for ARVN troops and police.
      const profile = compileArvnProfile();
      const subAction = profile.resolution[2]!;
      assert.equal(subAction.stage, 'sub-action');

      // The pacify condition must be an AND with:
      //   - $subAction == 'pacify'
      //   - count(tokensInZone filter: [{ prop: 'type', op: 'eq', value: 'troops' }, ...]) > 0
      //   - count(tokensInZone filter: [{ prop: 'type', op: 'eq', value: 'police' }, ...]) > 0
      const pacifyCondition = findDeep(subAction.effects, (node: any) =>
        node?.op === 'and' &&
        Array.isArray(node?.args) &&
        findDeep(node.args, (n: any) => n?.right === 'pacify').length > 0 &&
        findDeep(node.args, (n: any) =>
          n?.op === '>' &&
          n?.left?.aggregate?.op === 'count' &&
          n?.left?.aggregate?.query?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'troops'),
        ).length > 0 &&
        findDeep(node.args, (n: any) =>
          n?.op === '>' &&
          n?.left?.aggregate?.op === 'count' &&
          n?.left?.aggregate?.query?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'police'),
        ).length > 0,
      );
      assert.ok(pacifyCondition.length >= 1, 'Expected pacify condition requiring ARVN Troops AND Police');
    });

    it('AC7: replace cubes with Base requires 3+ ARVN cubes and stacking check (< 2 bases)', () => {
      const profile = compileArvnProfile();
      const subAction = profile.resolution[2]!;

      // The replace-cubes-with-base condition must check:
      //   - >= 3 ARVN cubes (troops/police)
      //   - < 2 bases (stacking)
      const replaceCondition = findDeep(subAction.effects, (node: any) =>
        node?.op === 'and' &&
        Array.isArray(node?.args) &&
        findDeep(node.args, (n: any) => n?.right === 'replace-cubes-with-base').length > 0 &&
        findDeep(node.args, (n: any) => n?.op === '>=' && n?.right === 3).length > 0 &&
        findDeep(node.args, (n: any) => n?.op === '<' && n?.right === 2).length > 0,
      );
      assert.ok(
        replaceCondition.length >= 1,
        'Expected replace-cubes-with-base condition with 3+ cubes AND < 2 bases stacking',
      );
    });

    it('AC8: replace cubes with Base costs 3 ARVN even if free operation', () => {
      const profile = compileArvnProfile();
      const subAction = profile.resolution[2]!;

      // Find the if block whose condition references 'replace-cubes-with-base'
      const replaceIfNodes = findDeep(subAction.effects, (node: any) =>
        node?.if !== undefined &&
        findDeep(node.if.when, (n: any) => n?.right === 'replace-cubes-with-base').length > 0,
      );
      assert.ok(replaceIfNodes.length >= 1, 'Expected if block for replace-cubes-with-base');

      // The addVar -3 must be a DIRECT element of then (not wrapped in __freeOperation guard).
      // If it were guarded, then[0] would be { if: { when: __freeOperation, ... } }
      // and .find on addVar would return undefined.
      const replaceThen = replaceIfNodes[0].if.then as readonly Record<string, unknown>[];
      const directCost = replaceThen.find(
        (eff: any) => eff?.addVar?.var === 'arvnResources' && eff?.addVar?.delta === -3,
      );
      assert.ok(directCost, 'Expected direct addVar -3 arvnResources (not guarded by __freeOperation)');
    });

    it('AC9: LimOp variant limits to max 1 space', () => {
      const profile = compileArvnProfile();
      const selectSpaces = profile.resolution[0]!;

      // The if block checks __actionClass == 'limitedOperation'
      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected if block for __actionClass == limitedOperation');

      // Then branch: chooseN with max: 1
      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) =>
        node?.chooseN?.max === 1,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');

      // Else branch: chooseN with max: 99 (no limit)
      const normalChooseN = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max === 99,
      );
      assert.ok(normalChooseN.length >= 1, 'Expected chooseN max:99 in normal branch');
    });

    it('AC10: free operation variant skips per-space cost (but base replacement still costs)', () => {
      const profile = compileArvnProfile();
      const resolvePerSpace = profile.resolution[1]!;

      // Per-space costs are guarded by { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true }
      const freeOpGuards = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === '!=' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__freeOperation' &&
        node?.if?.when?.right === true,
      );
      // At least 2 guards: one for rangers branch, one for cubes branch
      assert.ok(
        freeOpGuards.length >= 2,
        `Expected at least 2 __freeOperation guards (rangers + cubes), found ${freeOpGuards.length}`,
      );

      // Each guard protects an arvnResources deduction
      for (const guard of freeOpGuards) {
        const costEffect = findDeep(guard.if.then, (node: any) =>
          node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -3,
        );
        assert.ok(costEffect.length >= 1, 'Expected arvnResources cost inside __freeOperation guard');
      }
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  describe('applicability dispatch for train profiles', () => {
    it('compiles applicability conditions for both train profiles', () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);

      const usProfile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-us-profile');
      const arvnProfile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(usProfile, 'train-us-profile must exist');
      assert.ok(arvnProfile, 'train-arvn-profile must exist');

      assert.deepEqual(usProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: '0' });
      assert.deepEqual(arvnProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: '1' });
    });

    it('patrol-us-profile has applicability for player 0 (US)', () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);

      const patrolProfile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'patrol-us-profile');
      assert.ok(patrolProfile, 'patrol-us-profile must exist');
      assert.deepEqual(patrolProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: '0' });
    });

    it('profiles without applicability (sweep/assault) remain undefined', () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);

      for (const id of ['sweep-profile', 'assault-profile']) {
        const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === id);
        assert.ok(profile, `${id} must exist`);
        assert.equal(profile.applicability, undefined);
      }
    });
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('patrol-us-profile structure', () => {
    const getPatrolProfile = () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);
      const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'patrol-us-profile');
      assert.ok(profile, 'patrol-us-profile must exist');
      return profile;
    };

    const parsePatrolProfile = (): any => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const profile = parsed.doc.operationProfiles?.find(
        (p: { id: string }) => p.id === 'patrol-us-profile',
      );
      assert.ok(profile, 'patrol-us-profile must exist in parsed doc');
      return profile;
    };

    const findDeep = (obj: any, predicate: (node: any) => boolean): any[] => {
      const results: any[] = [];
      const walk = (node: any): void => {
        if (node === null || node === undefined) return;
        if (predicate(node)) results.push(node);
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
        } else if (typeof node === 'object') {
          for (const value of Object.values(node)) walk(value);
        }
      };
      walk(obj);
      return results;
    };

    it('AC1: compiles patrol-us-profile without diagnostics', () => {
      getPatrolProfile();
    });

    it('AC2: US Patrol costs 0 (no resource deduction)', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(profile.cost.spend, undefined);
    });

    it('AC2b: legality is always true (no cost check)', () => {
      const profile = getPatrolProfile();
      assert.equal(profile.legality.when, true);
    });

    it('AC3: targets LoCs only (spaceType filter)', () => {
      const profile = getPatrolProfile();
      const selectLoCs = profile.resolution[0]!;
      assert.equal(selectLoCs.stage, 'select-locs');

      // Both LimOp and normal branches filter for spaceType == 'loc'
      const locFilters = findDeep(selectLoCs.effects, (node: any) =>
        node?.op === '==' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'spaceType' &&
        node?.right === 'loc',
      );
      assert.ok(
        locFilters.length >= 2,
        `Expected LoC filter in both LimOp and normal branches, found ${locFilters.length}`,
      );
    });

    it('AC4: move-cubes stage uses tokensInAdjacentZones for US cubes', () => {
      const parsed = parsePatrolProfile();
      const moveCubes = parsed.resolution[1];
      assert.equal(moveCubes.stage, 'move-cubes');

      // chooseN with tokensInAdjacentZones query and US faction filter
      const adjacentQueries = findDeep(moveCubes.effects, (node: any) =>
        node?.query === 'tokensInAdjacentZones' &&
        Array.isArray(node?.filter) &&
        node.filter.some((f: any) => f.prop === 'faction' && f.eq === 'US'),
      );
      assert.ok(adjacentQueries.length >= 1, 'Expected tokensInAdjacentZones query for US cubes');
    });

    it('AC5: activation stage — 1 guerrilla per US cube (1:1 ratio)', () => {
      const profile = getPatrolProfile();
      const activateStage = profile.resolution[2]!;
      assert.equal(activateStage.stage, 'activate-guerrillas');

      // The forEach over guerrillas must be limited by usCubeCount
      const guerrillaForEach = findDeep(activateStage.effects, (node: any) =>
        node?.forEach?.over?.query === 'tokensInZone' &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'guerrilla') &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'activity' && f.op === 'eq' && f.value === 'underground'),
      );
      assert.ok(guerrillaForEach.length >= 1, 'Expected forEach over underground guerrillas');

      // The limit should reference usCubeCount binding
      const limitedByCount = findDeep(activateStage.effects, (node: any) =>
        node?.forEach?.limit?.ref === 'binding' &&
        node?.forEach?.limit?.name === '$usCubeCount',
      );
      assert.ok(limitedByCount.length >= 1, 'Expected guerrilla forEach limited by $usCubeCount');
    });

    it('AC6: free Assault uses coin-assault-removal-order macro', () => {
      const parsed = parsePatrolProfile();
      const freeAssault = parsed.resolution[3];
      assert.equal(freeAssault.stage, 'free-assault');

      const macroRef = findDeep(freeAssault.effects, (node: any) =>
        node?.macro === 'coin-assault-removal-order',
      );
      assert.ok(macroRef.length >= 1, 'Expected coin-assault-removal-order macro in free-assault');
    });

    it('AC7: free Assault damage formula considers US Base (doubled with base)', () => {
      const profile = getPatrolProfile();
      const freeAssault = profile.resolution[3]!;
      assert.equal(freeAssault.stage, 'free-assault');

      // Damage binding uses conditional: hasUSBase > 0 → usTroops * 2, else usTroops
      const damageConditional = findDeep(freeAssault.effects, (node: any) =>
        node?.if?.when?.op === '>' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '$hasUSBase',
      );
      assert.ok(damageConditional.length >= 1, 'Expected damage conditional on hasUSBase');

      // The "then" branch multiplies by 2
      const doubledDamage = findDeep(freeAssault.effects, (node: any) =>
        node?.op === '*' && node?.right === 2,
      );
      assert.ok(doubledDamage.length >= 1, 'Expected damage * 2 when US Base present');
    });

    it('AC8: LimOp variant — max 1 LoC', () => {
      const profile = getPatrolProfile();
      const selectLoCs = profile.resolution[0]!;

      // if __actionClass == 'limitedOperation'
      const limOpIf = findDeep(selectLoCs.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp check');

      // Then: chooseN max: 1
      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) =>
        node?.chooseN?.max === 1,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');

      // Else: chooseN max: 99
      const normalChooseN = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max === 99,
      );
      assert.ok(normalChooseN.length >= 1, 'Expected chooseN max:99 in normal branch');
    });

    it('AC9: free Assault limited to at most 1 LoC', () => {
      const profile = getPatrolProfile();
      const freeAssault = profile.resolution[3]!;

      // chooseN from targetLoCs with max: 1
      const assaultChooseN = findDeep(freeAssault.effects, (node: any) =>
        node?.chooseN?.max === 1 && node?.chooseN?.min === 0,
      );
      assert.ok(assaultChooseN.length >= 1, 'Expected chooseN max:1 for free assault LoC selection');
    });

    it('has four resolution stages: select-locs, move-cubes, activate-guerrillas, free-assault', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(
        profile.resolution.map((s: any) => s.stage),
        ['select-locs', 'move-cubes', 'activate-guerrillas', 'free-assault'],
      );
    });

    it('forbids partial execution', () => {
      const profile = getPatrolProfile();
      assert.equal(profile.partialExecution.mode, 'forbid');
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
