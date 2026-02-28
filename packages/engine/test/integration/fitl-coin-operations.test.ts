import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  legalMoves,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { completeMoveDecisionSequenceOrThrow, pickDeterministicDecisionValue } from '../helpers/move-decision-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { withPendingFreeOperationGrant } from '../helpers/turn-order-helpers.js';

describe('FITL COIN operations integration', () => {
  const operationInitialState = makeIsolatedInitialState;

  const completeProfileMoveDeterministically = (
    baseMove: Move,
    choose: Parameters<typeof completeMoveDecisionSequenceOrThrow>[3],
    def: GameDef,
    state: GameState,
  ): Move => {
    return completeMoveDecisionSequenceOrThrow(baseMove, def, state, choose);
  };

  const countFactionTokensInSpace = (
    state: GameState,
    space: string,
    factions: readonly string[],
  ): number => (state.zones[space] ?? []).filter((token) => factions.includes(String(token.props.faction))).length;

  it('compiles COIN Train/Patrol/Sweep/Assault operation profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileMap = profiles.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) }));
    for (const expected of [
      { id: 'train-us-profile', actionId: 'train' },
      { id: 'train-arvn-profile', actionId: 'train' },
      { id: 'patrol-us-profile', actionId: 'patrol' },
      { id: 'patrol-arvn-profile', actionId: 'patrol' },
      { id: 'sweep-us-profile', actionId: 'sweep' },
      { id: 'sweep-arvn-profile', actionId: 'sweep' },
      { id: 'assault-us-profile', actionId: 'assault' },
      { id: 'assault-arvn-profile', actionId: 'assault' },
    ]) {
      assert.ok(
        profileMap.some((p) => p.id === expected.id && p.actionId === expected.actionId),
        `Expected profile ${expected.id} with actionId ${expected.actionId}`,
      );
    }
  });

  it('routes assault through operation profile runtime (no transitional stub counters)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const start = makeIsolatedInitialState(def, 73, 4);
    const space = 'quang-nam:none';

    const modifiedStart: GameState = {
      ...start,
      zones: {
        ...start.zones,
        [space]: [
          { id: asTokenId('assault-us-troop-1'), type: 'troops', props: { faction: 'US', type: 'troops' } },
          { id: asTokenId('assault-us-troop-2'), type: 'troops', props: { faction: 'US', type: 'troops' } },
          {
            id: asTokenId('assault-us-base-1'),
            type: 'base',
            props: { faction: 'US', type: 'base' },
          },
          {
            id: asTokenId('assault-enemy-g-1'),
            type: 'guerrilla',
            props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
          },
          {
            id: asTokenId('assault-enemy-g-2'),
            type: 'guerrilla',
            props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
          },
          {
            id: asTokenId('assault-enemy-g-3'),
            type: 'guerrilla',
            props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
          },
        ],
      },
    };

    const template = legalMoves(def, modifiedStart).find(
      (move) => move.actionId === asActionId('assault') && Object.keys(move.params).length === 0,
    );
    assert.ok(template, 'Expected template move for assault');

    const selected = completeProfileMoveDeterministically(
      { ...template!, actionClass: 'limitedOperation' },
      (request) => {
        if (request.name === 'targetSpaces') return [space];
        if (request.name === '$arvnFollowupSpaces') return [];
        return pickDeterministicDecisionValue(request);
      },
      def,
      modifiedStart,
    );

    const beforeCoinResources = modifiedStart.globalVars.coinResources;
    const result = applyMove(def, modifiedStart, selected);
    const final = result.state;

    assert.equal(final.globalVars.coinResources, beforeCoinResources, 'US Assault should not spend coinResources');
    assert.equal(final.globalVars.sweepCount, 0);
    assert.equal(
      countFactionTokensInSpace(final, space, ['NVA', 'VC']),
      0,
      'US Assault with Base should remove 2x US troop count of enemy pieces',
    );
  });

  it('executes sweep-us-profile at runtime via decision sequence (no sweep resource spend)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const start = makeIsolatedInitialState(def, 79, 4);

    const targetSpace = 'quang-nam:none';
    const sourceSpace = 'da-nang:none';
    const troopId = 'us-sweep-runtime-1';
    const modifiedStart = {
      ...start,
      zones: {
        ...start.zones,
        [sourceSpace]: [
          ...(start.zones[sourceSpace] ?? []),
          { id: asTokenId(troopId), type: 'troops', props: { faction: 'US', type: 'troops' } },
        ],
        [targetSpace]: [
          ...(start.zones[targetSpace] ?? []),
          {
            id: asTokenId('nva-sweep-target-1'),
            type: 'guerrilla',
            props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
          },
        ],
      },
    };

    const template = legalMoves(def, modifiedStart).find(
      (move) => move.actionId === asActionId('sweep') && Object.keys(move.params).length === 0,
    );
    assert.ok(template, 'Expected template move for sweep');

    const selected = completeProfileMoveDeterministically(
      { ...template!, actionClass: 'limitedOperation' },
      (request) => {
        if (request.name === 'targetSpaces') return [targetSpace];
        if (request.name === '$movingAdjacentTroops') return [troopId];
        if (request.name === '$hopLocs') return [];
        if (request.name === '$movingHopTroops') return [];
        return pickDeterministicDecisionValue(request);
      },
      def,
      modifiedStart,
    );

    const beforeCoinResources = modifiedStart.globalVars.coinResources;
    const result = applyMove(def, modifiedStart, selected);
    const final = result.state;

    assert.equal(final.globalVars.coinResources, beforeCoinResources, 'US Sweep should not spend coinResources');
    assert.equal(
      (final.zones[targetSpace] ?? []).some((token) => String(token.id) === troopId),
      true,
      'Selected US troop should move into the target sweep space',
    );
    assert.equal(
      (final.zones[sourceSpace] ?? []).some((token) => String(token.id) === troopId),
      false,
      'Selected US troop should no longer remain in its source space',
    );
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('sweep-us-profile structure', () => {
    const getSweepUsProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'sweep-us-profile');
      assert.ok(profile, 'sweep-us-profile must exist');
      return profile;
    };

    const parseSweepUsProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'sweep-us-profile',
      );
      assert.ok(profile, 'sweep-us-profile must exist in parsed doc');
      return profile;
    };

    it('compiles sweep-us-profile without diagnostics', () => {
      getSweepUsProfile();
    });

    it('uses actionId sweep and always-legal zero-cost top-level fields', () => {
      const profile = getSweepUsProfile();
      assert.equal(String(profile.actionId), 'sweep');
      assert.equal(profile.legality, true);
      assert.equal(profile.costValidation, null);
      assert.deepEqual(profile.costEffects, []);
    });

    it('has five stages including capability-only Sweep branches', () => {
      const profile = getSweepUsProfile();
      assert.deepEqual(
        profile.stages.map((stage) => stage.stage),
        ['select-spaces', 'move-troops', 'activate-guerrillas', 'cap-cobras-bonus-removal', 'cap-booby-traps-troop-cost'],
      );
    });

    it('select-spaces filters provinces/cities and excludes northVietnam, with LimOp max 1', () => {
      const profile = getSweepUsProfile();
      const selectSpaces = profile.stages[0]!;
      assert.equal(selectSpaces.stage, 'select-spaces');

      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp branch for __actionClass == limitedOperation');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) => node?.chooseN?.max === 1);
      const normalChooseN = findDeep(limOpIf[0].if.else, (node: any) => node?.chooseN?.max === 99);
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 for LimOp');
      assert.ok(normalChooseN.length >= 1, 'Expected chooseN max:99 for full operation');

      const categoryGuards = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '==' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'category' &&
        (node?.right === 'province' || node?.right === 'city'),
      );
      assert.ok(categoryGuards.length >= 4, 'Expected province/city filters in both selection branches');

      const northVietnamExclusions = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '!=' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'country' &&
        node?.right === 'northVietnam',
      );
      assert.ok(northVietnamExclusions.length >= 2, 'Expected northVietnam exclusion in both selection branches');
    });

    it('move-troops includes direct adjacent movement and sweep-loc-hop macro call', () => {
      const parsed = parseSweepUsProfile();
      const moveTroops = parsed.stages[1];
      assert.equal(moveTroops.stage, 'move-troops');

      const directMoveQuery = findDeep(moveTroops.effects, (node: any) =>
        node?.query === 'tokensInAdjacentZones' &&
        node?.zone === '$space' &&
        Array.isArray(node?.filter) &&
        node.filter.some((f: any) => f.prop === 'faction' && f.eq === 'US') &&
        node.filter.some((f: any) => f.prop === 'type' && f.eq === 'troops'),
      );
      assert.ok(directMoveQuery.length >= 1, 'Expected direct adjacent US troop movement query');

      const hopMacroCall = findDeep(moveTroops.effects, (node: any) =>
        node?.macro === 'sweep-loc-hop' &&
        node?.args?.space === '$space' &&
        node?.args?.troopFaction === 'US',
      );
      assert.ok(hopMacroCall.length >= 1, 'Expected sweep-loc-hop macro call with US troopFaction');
    });

    it('activate-guerrillas invokes sweep-activation macro with US cube+SF args', () => {
      const parsed = parseSweepUsProfile();
      const activate = parsed.stages[2];
      assert.equal(activate.stage, 'activate-guerrillas');

      const sweepMacroCall = findDeep(activate.effects, (node: any) =>
        node?.macro === 'sweep-activation' &&
        node?.args?.cubeFaction === 'US' &&
        node?.args?.sfType === 'irregular',
      );
      assert.ok(sweepMacroCall.length >= 1, 'Expected sweep-activation macro call with US/irregular args');
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('sweep-arvn-profile structure', () => {
    const getSweepArvnProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'sweep-arvn-profile');
      assert.ok(profile, 'sweep-arvn-profile must exist');
      return profile;
    };

    const parseSweepArvnProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'sweep-arvn-profile',
      );
      assert.ok(profile, 'sweep-arvn-profile must exist in parsed doc');
      return profile;
    };

    it('AC1: compiles sweep-arvn-profile without diagnostics', () => {
      getSweepArvnProfile();
    });

    it('AC2: ARVN Sweep has top-level legality/costValidation at arvnResources >= 3', () => {
      const profile = getSweepArvnProfile();
      const expected = { op: '>=', left: { ref: 'gvar', var: 'arvnResources' }, right: 3 };
      assert.deepEqual(profile.legality, expected);
      assert.deepEqual(profile.costValidation, expected);
      assert.deepEqual(profile.costEffects, []);
    });

    it('AC3: has four stages including capability-only Sweep branches', () => {
      const profile = getSweepArvnProfile();
      assert.deepEqual(
        profile.stages.map((stage) => stage.stage),
        ['select-spaces', 'resolve-per-space', 'cap-cobras-bonus-removal', 'cap-booby-traps-troop-cost'],
      );
    });

    it('AC4: select-spaces is LimOp-aware and filters province/city excluding northVietnam', () => {
      const profile = getSweepArvnProfile();
      const selectSpaces = profile.stages[0]!;
      assert.equal(selectSpaces.stage, 'select-spaces');

      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp check');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) => node?.chooseN?.max === 1);
      const affordabilityCap = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max?.op === 'floorDiv' &&
        node?.chooseN?.max?.left?.ref === 'gvar' &&
        node?.chooseN?.max?.left?.var === 'arvnResources' &&
        node?.chooseN?.max?.right === 3,
      );
      const capabilityMinCap = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max?.op === 'min' &&
        node?.chooseN?.max?.left === 2 &&
        node?.chooseN?.max?.right?.op === 'floorDiv' &&
        node?.chooseN?.max?.right?.left?.ref === 'gvar' &&
        node?.chooseN?.max?.right?.left?.var === 'arvnResources' &&
        node?.chooseN?.max?.right?.right === 3,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');
      assert.ok(affordabilityCap.length >= 1, 'Expected full-op branch affordability max floorDiv(arvnResources, 3)');
      assert.ok(capabilityMinCap.length >= 1, 'Expected cap_caps shaded branch max equivalent to min(2, floorDiv(arvnResources, 3))');

      const categoryGuards = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '==' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'category' &&
        (node?.right === 'province' || node?.right === 'city'),
      );
      assert.ok(categoryGuards.length >= 4, 'Expected province/city filters in both branches');

      const northVietnamExclusions = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '!=' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'country' &&
        node?.right === 'northVietnam',
      );
      assert.ok(northVietnamExclusions.length >= 2, 'Expected northVietnam exclusion in both branches');
    });

    it('AC5/AC6: resolve-per-space uses free-op guarded per-space cost and adjacent ARVN troop movement', () => {
      const parsed = parseSweepArvnProfile();
      const resolvePerSpace = parsed.stages[1];
      assert.equal(resolvePerSpace.stage, 'resolve-per-space');

      const freeOpGuard = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === '!=' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__freeOperation' &&
        node?.if?.when?.right === true &&
        findDeep(node?.if?.then, (thenNode: any) =>
          thenNode?.addVar?.var === 'arvnResources' && thenNode?.addVar?.delta === -3,
        ).length > 0,
      );
      assert.ok(freeOpGuard.length >= 1, 'Expected __freeOperation guard around per-space -3 ARVN cost');

      const adjacentMoveQuery = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.query === 'tokensInAdjacentZones' &&
        node?.zone === '$space' &&
        Array.isArray(node?.filter) &&
        node.filter.some((f: any) => f.prop === 'faction' && f.eq === 'ARVN') &&
        node.filter.some((f: any) => f.prop === 'type' && f.eq === 'troops'),
      );
      assert.ok(adjacentMoveQuery.length >= 1, 'Expected adjacent ARVN troop movement query');
    });

    it('AC7: resolve-per-space invokes sweep-activation with ARVN cubes + Rangers', () => {
      const parsed = parseSweepArvnProfile();
      const resolvePerSpace = parsed.stages[1];

      const sweepMacroCall = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.macro === 'sweep-activation' &&
        node?.args?.cubeFaction === 'ARVN' &&
        node?.args?.sfType === 'ranger',
      );
      assert.ok(sweepMacroCall.length >= 1, 'Expected sweep-activation macro call with ARVN/ranger args');
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  describe('sweep-arvn-profile runtime behavior', () => {
    const chooseSweepArvnParams = (targetSpace: string, movingTroops: readonly string[]) =>
      (request: ChoicePendingRequest) => {
        if (request.name === 'targetSpaces') return [targetSpace];
        if (request.name.startsWith('$movingTroops@')) return [...movingTroops];
        return pickDeterministicDecisionValue(request);
      };

    it('AC8: free operation skips per-space ARVN resource cost', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 97, 4);
      const sourceSpace = 'saigon:none';
      const targetSpace = 'tay-ninh:none';
      const troopId = 'arvn-sweep-freeop-1';
      const troopToken = { id: asTokenId(troopId), type: 'troops', props: { faction: 'ARVN', type: 'troops' } };

      const modifiedStart: GameState = {
        ...start,
        activePlayer: asPlayerId(1),
        zones: {
          ...start.zones,
          [sourceSpace]: [...(start.zones[sourceSpace] ?? []), troopToken],
          [targetSpace]: [
            ...(start.zones[targetSpace] ?? []),
            { id: asTokenId('arvn-sweep-freeop-nva-g1'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' } },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find(
        (move) => move.actionId === asActionId('sweep') && Object.keys(move.params).length === 0,
      );
      assert.ok(template, 'Expected template move for sweep');

      const stateWithGrant = withPendingFreeOperationGrant(modifiedStart, {
        actionIds: ['sweep'],
        operationClass: 'limitedOperation',
      });
      const selected = completeProfileMoveDeterministically(
        { ...template!, freeOperation: true, actionClass: 'limitedOperation' },
        chooseSweepArvnParams(targetSpace, [troopId]),
        def,
        stateWithGrant,
      );
      const beforeArvnResources = Number(stateWithGrant.globalVars.arvnResources);
      const result = applyMove(def, stateWithGrant, selected);
      const final = result.state;
      const targetTokens = final.zones[targetSpace] ?? [];
      const guerrillas = targetTokens.filter((token) => token.type === 'guerrilla');
      const activeGuerrillas = guerrillas.filter((token) => token.props.activity === 'active');

      assert.equal(final.globalVars.arvnResources, beforeArvnResources, 'Free ARVN Sweep should not spend arvnResources');
      assert.equal(activeGuerrillas.length, 0, 'Jungle sweep with 1 sweeper should activate 0 guerrillas (no runtime error)');
    });

    it('AC9: jungle activation uses floor((ARVN cubes + Rangers) / 2)', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 101, 4);
      const sourceSpace = 'saigon:none';
      const targetSpace = 'tay-ninh:none';
      const movingTroopIds = ['arvn-sweep-jungle-move-1', 'arvn-sweep-jungle-move-2'];

      const modifiedStart: GameState = {
        ...start,
        activePlayer: asPlayerId(1),
        zones: {
          ...start.zones,
          [sourceSpace]: [
            ...(start.zones[sourceSpace] ?? []),
            { id: asTokenId(movingTroopIds[0]!), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId(movingTroopIds[1]!), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
          ],
          [targetSpace]: [
            ...(start.zones[targetSpace] ?? []),
            { id: asTokenId('arvn-sweep-jungle-police-1'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            { id: asTokenId('arvn-sweep-jungle-ranger-1'), type: 'ranger', props: { faction: 'ARVN', type: 'ranger' } },
            { id: asTokenId('arvn-sweep-jungle-nva-g1'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' } },
            { id: asTokenId('arvn-sweep-jungle-nva-g2'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' } },
            { id: asTokenId('arvn-sweep-jungle-vc-g1'), type: 'guerrilla', props: { faction: 'VC', type: 'guerrilla', activity: 'underground' } },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find(
        (move) => move.actionId === asActionId('sweep') && Object.keys(move.params).length === 0,
      );
      assert.ok(template, 'Expected template move for sweep');

      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'limitedOperation' },
        chooseSweepArvnParams(targetSpace, movingTroopIds),
        def,
        modifiedStart,
      );

      const beforeArvnResources = Number(modifiedStart.globalVars.arvnResources);
      const result = applyMove(def, modifiedStart, selected);
      const final = result.state;
      const targetTokens = final.zones[targetSpace] ?? [];
      const guerrillas = targetTokens.filter((token) => token.type === 'guerrilla');
      const activeGuerrillas = guerrillas.filter((token) => token.props.activity === 'active');
      const movedTroopsInTarget = targetTokens.filter((token) => movingTroopIds.includes(String(token.id)));

      assert.equal(final.globalVars.arvnResources, beforeArvnResources - 3, 'Non-free ARVN Sweep should spend 3 resources for one space');
      assert.equal(movedTroopsInTarget.length, 2, 'Both selected adjacent ARVN troops should move into the target');
      assert.equal(activeGuerrillas.length, 2, 'Jungle should activate floor((2 moved troops + 1 police + 1 ranger) / 2) = 2 guerrillas');
    });
  });

  describe('train-arvn-profile structure', () => {
    const getArvnProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(profile, 'train-arvn-profile must exist');
      return profile;
    };

    it('compiles train-arvn-profile without diagnostics', () => {
      getArvnProfile();
    });

    it('has four stages: select-spaces, resolve-per-space, sub-action, rvn-leader-minh-aid-bonus', () => {
      const profile = getArvnProfile();
      assert.deepEqual(
        profile.stages.map((s) => s.stage),
        ['select-spaces', 'resolve-per-space', 'sub-action', 'rvn-leader-minh-aid-bonus'],
      );
    });

    it('uses actionId train', () => {
      const profile = getArvnProfile();
      assert.equal(String(profile.actionId), 'train');
    });

    it('has legality when: true (always legal)', () => {
      const profile = getArvnProfile();
      assert.equal(profile.legality, true);
    });

    it('has no top-level cost (cost is per-space in stages)', () => {
      const profile = getArvnProfile();
      assert.deepEqual(profile.costEffects, []);
    });

    it('forbids partial execution', () => {
      const profile = getArvnProfile();
      assert.equal(profile.atomicity, 'atomic');
    });
  });

  describe('train-arvn-profile acceptance criteria (AC2-AC10)', () => {
    const compileArvnProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(profile, 'train-arvn-profile must exist');
      return profile;
    };

    /** Returns the pre-compilation (parsed YAML) profile with full filter detail. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseArvnProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'train-arvn-profile',
      );
      assert.ok(profile, 'train-arvn-profile must exist in parsed doc');
      return profile;
    };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    it('AC2: space filter excludes spaces with NVA Control', () => {
      // Verify the compiled GameDef preserves map-space query filters including
      // explicit "without NVA control" token-count predicate.
      const profile = compileArvnProfile();
      const selectSpaces = profile.stages[0]!;
      assert.equal(selectSpaces.stage, 'select-spaces');

      // Both LimOp (then) and normal (else) branches must include:
      //   nvaCount <= coinPlusVcCount
      const nvaExclusions = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '<=' &&
        node?.left?.aggregate?.op === 'count' &&
        node?.right?.aggregate?.op === 'count' &&
        node?.left?.aggregate?.query?.query === 'tokensInZone' &&
        node?.right?.aggregate?.query?.query === 'tokensInZone',
      );
      assert.ok(
        nvaExclusions.length >= 2,
        `Expected NVA Control exclusion in both LimOp and normal branches, found ${nvaExclusions.length}`,
      );

      // Verify the filter is inside a compiled mapSpaces query filter.condition.
      const zonesWithConditionFilter = findDeep(selectSpaces.effects, (node: any) =>
        node?.query === 'mapSpaces' && node?.filter?.condition !== undefined,
      );
      assert.ok(
        zonesWithConditionFilter.length >= 2,
        `Expected compiled mapSpaces queries with condition filters in both branches, found ${zonesWithConditionFilter.length}`,
      );
    });

    it('AC3: costs 3 ARVN Resources when placing pieces', () => {
      const profile = compileArvnProfile();
      const resolvePerSpace = profile.stages[1]!;
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
      // Verify macro args at YAML level (ranger, maxPieces: 2) and compiled forEach limit
      const parsed = parseArvnProfile();
      const resolvePerSpace = parsed.stages[1];

      // Pre-compilation: macro call specifies pieceType: ranger, maxPieces: 2
      const rangerMacro = findDeep(resolvePerSpace!.effects, (node: any) =>
        node?.macro === 'place-from-available-or-map' &&
        node?.args?.pieceType === 'ranger' &&
        node?.args?.maxPieces === 2,
      );
      assert.ok(rangerMacro.length >= 1, 'Expected place-from-available-or-map macro for ranger with maxPieces: 2');

      // Post-compilation: forEach with limit 2 sourcing from available-ARVN with type filter
      const compiled = compileArvnProfile();
      const compiledRps = compiled.stages[1]!;
      const rangerForEach = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach !== undefined &&
        node.forEach.limit === 2 &&
        node.forEach.over?.query === 'tokensInZone' &&
        node.forEach.over?.zone?.zoneExpr?.concat?.join?.('') === 'available-ARVN:none',
      );
      assert.ok(rangerForEach.length >= 1, 'Expected compiled forEach with limit 2 from available-ARVN');

      // Verify compiled token filter preserves piece type
      const rangerFiltered = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach?.over?.query === 'tokensInZone' &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'ranger'),
      );
      assert.ok(rangerFiltered.length >= 1, 'Expected compiled tokensInZone filter for type=ranger');
    });

    it('AC5: places cubes at Cities or at COIN Bases up to 6', () => {
      // Verify macro args at YAML level (troops, maxPieces: 6)
      const parsed = parseArvnProfile();
      const resolvePerSpace = parsed.stages[1];

      const cubeMacro = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.macro === 'place-from-available-or-map' &&
        node?.args?.pieceType === 'troops' &&
        node?.args?.maxPieces === 6,
      );
      assert.ok(cubeMacro.length >= 1, 'Expected place-from-available-or-map macro for troops with maxPieces: 6');

      // Post-compilation: forEach with limit 6 and city-or-COIN-base condition
      const compiled = compileArvnProfile();
      const compiledRps = compiled.stages[1]!;
      const cubeForEach = findDeep(compiledRps.effects, (node: any) =>
        node?.forEach !== undefined &&
        node.forEach.limit === 6 &&
        node.forEach.over?.query === 'tokensInZone' &&
        node.forEach.over?.zone?.zoneExpr?.concat?.join?.('') === 'available-ARVN:none',
      );
      assert.ok(cubeForEach.length >= 1, 'Expected compiled forEach with limit 6 from available-ARVN');

      // The cube placement branch must require city or COIN base (or condition)
      const cityOrBaseCondition = findDeep(compiledRps.effects, (node: any) =>
        node?.op === 'or' &&
        Array.isArray(node?.args) &&
        findDeep(node.args, (n: any) =>
          n?.op === '==' && n?.left?.ref === 'zoneProp' && n?.left?.prop === 'category' && n?.right === 'city',
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
      const subAction = profile.stages[2]!;
      assert.equal(subAction.stage, 'sub-action');

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
      const subAction = profile.stages[2]!;

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
      const subAction = profile.stages[2]!;

      const replaceIfNodes = findDeep(subAction.effects, (node: any) =>
        node?.if !== undefined &&
        findDeep(node.if.when, (n: any) => n?.right === 'replace-cubes-with-base').length > 0,
      );
      assert.ok(replaceIfNodes.length >= 1, 'Expected if block for replace-cubes-with-base');

      const replaceThen = replaceIfNodes[0].if.then as readonly Record<string, unknown>[];
      const directCost = replaceThen.find(
        (eff: any) => eff?.addVar?.var === 'arvnResources' && eff?.addVar?.delta === -3,
      );
      assert.ok(directCost, 'Expected direct addVar -3 arvnResources (not guarded by __freeOperation)');
    });

    it('AC9: LimOp variant limits to max 1 space', () => {
      const profile = compileArvnProfile();
      const selectSpaces = profile.stages[0]!;

      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected if block for __actionClass == limitedOperation');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) =>
        node?.chooseN?.max === 1,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');

      const normalChooseN = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max === 99,
      );
      assert.ok(normalChooseN.length >= 1, 'Expected chooseN max:99 in normal branch');
    });

    it('AC10: free operation variant skips per-space cost (but base replacement still costs)', () => {
      const profile = compileArvnProfile();
      const resolvePerSpace = profile.stages[1]!;

      const freeOpGuards = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === '!=' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__freeOperation' &&
        node?.if?.when?.right === true,
      );
      assert.ok(
        freeOpGuards.length >= 2,
        `Expected at least 2 __freeOperation guards (rangers + cubes), found ${freeOpGuards.length}`,
      );

      for (const guard of freeOpGuards) {
        const costEffect = findDeep(guard.if.then, (node: any) =>
          node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -3,
        );
        assert.ok(costEffect.length >= 1, 'Expected arvnResources cost inside __freeOperation guard');
      }
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('assault-us-profile acceptance criteria', () => {
    const getAssaultUsProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'assault-us-profile');
      assert.ok(profile, 'assault-us-profile must exist');
      return profile;
    };

    const parseAssaultUsProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'assault-us-profile',
      );
      assert.ok(profile, 'assault-us-profile must exist in parsed doc');
      return profile;
    };

    it('AC1/AC2: compiles with momentum-aware legality and zero-cost top-level fields', () => {
      const profile = getAssaultUsProfile();
      assert.equal(String(profile.actionId), 'assault');
      assert.equal((profile.legality as any)?.op, 'or');
      const freeOpBypass = findDeep(profile.legality, (node: any) =>
        node?.op === '==' &&
        node?.left?.ref === 'binding' &&
        node?.left?.name === '__freeOperation' &&
        node?.right === true,
      );
      assert.ok(freeOpBypass.length >= 1, 'Expected __freeOperation legality bypass on assault-us-profile');
      const lansdaleGuard = findDeep(profile.legality, (node: any) =>
        node?.op === '!=' &&
        node?.left?.ref === 'gvar' &&
        node?.left?.var === 'mom_generalLansdale' &&
        node?.right === true,
      );
      assert.ok(lansdaleGuard.length >= 1, 'Expected mom_generalLansdale legality guard on assault-us-profile');
      assert.equal(profile.costValidation, null);
      assert.deepEqual(profile.costEffects, []);
    });

    it('AC3/AC10: select-spaces requires US Troops and enemy pieces, with LimOp max 1', () => {
      const parsed = parseAssaultUsProfile();
      const selectSpaces = parsed.stages[0];
      assert.equal(selectSpaces.stage, 'select-spaces');

      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp branch for __actionClass == limitedOperation');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) => node?.chooseN?.max === 1);
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');

      const troopFilterCountChecks = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '>' &&
        node?.left?.aggregate?.query?.filter?.some((f: any) => f.prop === 'faction' && f.eq === 'US') &&
        node?.left?.aggregate?.query?.filter?.some((f: any) => f.prop === 'type' && f.eq === 'troops'),
      );
      assert.ok(troopFilterCountChecks.length >= 2, 'Expected US Troops filter in both branches');

      const enemyFilterCountChecks = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '>' &&
        node?.left?.aggregate?.query?.filter?.some(
          (f: any) =>
            f.prop === 'faction' &&
            f.op === 'in' &&
            Array.isArray(f.value) &&
            f.value.includes('NVA') &&
            f.value.includes('VC'),
        ),
      );
      assert.ok(enemyFilterCountChecks.length >= 2, 'Expected enemy (NVA/VC) filter in both branches');
    });

    it('AC4/AC5/AC6: US damage formula applies base/highland/normal branches', () => {
      const parsed = parseAssaultUsProfile();
      const resolvePerSpace = parsed.stages.find((stage: { stage: string }) => stage.stage === 'resolve-per-space');
      assert.ok(resolvePerSpace, 'Expected resolve-per-space stage');

      const baseDoubleBranch = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === '>' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '$hasUSBase' &&
        node?.if?.then?.op === '*' &&
        node?.if?.then?.right === 2,
      );
      assert.ok(baseDoubleBranch.length >= 1, 'Expected 2x damage branch when US Base is present');

      const highlandHalfBranch = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === 'zonePropIncludes' &&
        node?.if?.when?.value === 'highland' &&
        node?.if?.then?.op === '/' &&
        node?.if?.then?.right === 2,
      );
      assert.ok(highlandHalfBranch.length >= 1, 'Expected highland floor(usTroops/2) branch');

      const macroCall = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.macro === 'coin-assault-removal-order',
      );
      assert.ok(macroCall.length >= 1, 'Expected coin-assault-removal-order call');
      assert.equal(macroCall.some((node: any) => node?.args?.actorFaction !== undefined), false, 'Expected no actorFaction arg');
    });

    it('AC8/AC9: ARVN follow-up is optional, costs 3, and uses ARVN highland/non-highland formulas', () => {
      const parsed = parseAssaultUsProfile();
      const arvnFollowup = parsed.stages.find((stage: { stage: string }) => stage.stage === 'arvn-followup');
      assert.ok(arvnFollowup, 'Expected arvn-followup stage');
      assert.equal(arvnFollowup.stage, 'arvn-followup');

      const followupGuard = findDeep(arvnFollowup.effects, (node: any) => node?.if?.when?.op === 'or');
      assert.ok(followupGuard.length >= 1, 'Expected momentum-aware follow-up eligibility guard');
      const hasBodyCountGuard = findDeep(arvnFollowup.effects, (node: any) =>
        node?.left?.ref === 'gvar' && node?.left?.var === 'mom_bodyCount' && node?.right === true,
      );
      assert.ok(hasBodyCountGuard.length >= 1, 'Expected mom_bodyCount override in follow-up guard');

      const arvnCost = findDeep(arvnFollowup.effects, (node: any) =>
        node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -3,
      );
      assert.ok(arvnCost.length >= 1, 'Expected ARVN follow-up to spend 3 arvnResources');

      const highlandThird = findDeep(arvnFollowup.effects, (node: any) =>
        node?.if?.when?.op === 'zonePropIncludes' &&
        node?.if?.when?.value === 'highland' &&
        node?.if?.then?.op === '/' &&
        node?.if?.then?.right === 3,
      );
      assert.ok(highlandThird.length >= 1, 'Expected highland floor(arvnCubes/3) branch');

      const nonHighlandHalf = findDeep(arvnFollowup.effects, (node: any) =>
        node?.if?.else?.op === '/' && node?.if?.else?.right === 2,
      );
      assert.ok(nonHighlandHalf.length >= 1, 'Expected non-highland floor(arvnCubes/2) branch');

      const macroCall = findDeep(arvnFollowup.effects, (node: any) =>
        node?.macro === 'coin-assault-removal-order',
      );
      assert.ok(macroCall.length >= 1, 'Expected ARVN follow-up to call coin-assault-removal-order');
      assert.equal(macroCall.some((node: any) => node?.args?.actorFaction !== undefined), false, 'Expected no actorFaction arg');
    });

    it('runtime: highland without US Base uses floor(usTroops / 2)', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 91, 4);
      const space = 'quang-nam:none';

      const modifiedStart: GameState = {
        ...start,
        zones: {
          ...start.zones,
          [space]: [
            { id: asTokenId('assault-hi-us-1'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            { id: asTokenId('assault-hi-us-2'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            { id: asTokenId('assault-hi-us-3'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            {
              id: asTokenId('assault-hi-enemy-1'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-hi-enemy-2'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-hi-enemy-3'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected template move for assault');
      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'limitedOperation' },
        (request) => {
          if (request.name === 'targetSpaces') return [space];
          if (request.name === '$arvnFollowupSpaces') return [];
          return pickDeterministicDecisionValue(request);
        },
        def,
        modifiedStart,
      );

      const final = applyMove(def, modifiedStart, selected).state;
      assert.equal(
        countFactionTokensInSpace(final, space, ['NVA', 'VC']),
        2,
        'Expected only 1 enemy piece removed in highland without US base',
      );
    });

    it('runtime: non-highland without US Base uses 1 enemy per US Troop', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 92, 4);
      const space = 'quang-tin-quang-ngai:none';

      const modifiedStart: GameState = {
        ...start,
        zones: {
          ...start.zones,
          [space]: [
            { id: asTokenId('assault-lo-us-1'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            { id: asTokenId('assault-lo-us-2'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            {
              id: asTokenId('assault-lo-enemy-1'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-lo-enemy-2'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-lo-enemy-3'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected template move for assault');
      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'limitedOperation' },
        (request) => {
          if (request.name === 'targetSpaces') return [space];
          if (request.name === '$arvnFollowupSpaces') return [];
          return pickDeterministicDecisionValue(request);
        },
        def,
        modifiedStart,
      );

      const final = applyMove(def, modifiedStart, selected).state;
      assert.equal(
        countFactionTokensInSpace(final, space, ['NVA', 'VC']),
        1,
        'Expected 2 enemy pieces removed in non-highland without US base',
      );
    });

    it('runtime: insurgent Base removal adds +6 Aid', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 93, 4);
      const space = 'quang-tin-quang-ngai:none';

      const modifiedStart: GameState = {
        ...start,
        zones: {
          ...start.zones,
          [space]: [
            { id: asTokenId('assault-aid-us-1'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            {
              id: asTokenId('assault-aid-us-base'),
              type: 'base',
              props: { faction: 'US', type: 'base' },
            },
            {
              id: asTokenId('assault-aid-enemy-g'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-aid-enemy-base'),
              type: 'base',
              props: { faction: 'VC', type: 'base', tunnel: 'untunneled' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected template move for assault');
      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'limitedOperation' },
        (request) => {
          if (request.name === 'targetSpaces') return [space];
          if (request.name === '$arvnFollowupSpaces') return [];
          return pickDeterministicDecisionValue(request);
        },
        def,
        modifiedStart,
      );

      const beforeAid = Number(modifiedStart.globalVars.aid ?? 0);
      const final = applyMove(def, modifiedStart, selected).state;
      assert.equal(final.globalVars.aid, beforeAid + 6, 'Expected +6 Aid from one insurgent Base removed');
    });

    it('runtime: ARVN follow-up spends 3 and uses highland floor(arvnCubes / 3)', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 94, 4);
      const space = 'quang-nam:none';

      const modifiedStart: GameState = {
        ...start,
        zones: {
          ...start.zones,
          [space]: [
            { id: asTokenId('assault-fu-us-1'), type: 'troops', props: { faction: 'US', type: 'troops' } },
            { id: asTokenId('assault-fu-arvn-1'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('assault-fu-arvn-2'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('assault-fu-arvn-3'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            {
              id: asTokenId('assault-fu-enemy-1'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-fu-enemy-2'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('assault-fu-enemy-3'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected template move for assault');
      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'limitedOperation' },
        (request) => {
          if (request.name === 'targetSpaces') return [space];
          if (request.name === '$arvnFollowupSpaces') return [space];
          return pickDeterministicDecisionValue(request);
        },
        def,
        modifiedStart,
      );

      const beforeArvnResources = Number(modifiedStart.globalVars.arvnResources ?? 0);
      const final = applyMove(def, modifiedStart, selected).state;
      assert.equal(
        final.globalVars.arvnResources,
        beforeArvnResources - 3,
        'Expected ARVN follow-up to cost 3 arvnResources',
      );
      assert.equal(
        countFactionTokensInSpace(final, space, ['NVA', 'VC']),
        2,
        'Expected US damage 0 and ARVN highland follow-up damage 1',
      );
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('assault-arvn-profile structure and runtime', () => {
    const getAssaultArvnProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'assault-arvn-profile');
      assert.ok(profile, 'assault-arvn-profile must exist');
      return profile;
    };

    const parseAssaultArvnProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'assault-arvn-profile',
      );
      assert.ok(profile, 'assault-arvn-profile must exist in parsed doc');
      return profile;
    };

    it('AC1/AC2/AC3: compiles with momentum-aware arvnResources gating and per-space cost model', () => {
      const profile = getAssaultArvnProfile();
      const expected = {
        op: 'or',
        args: [
          { op: '==', left: { ref: 'gvar', var: 'mom_bodyCount' }, right: true },
          { op: '>=', left: { ref: 'gvar', var: 'arvnResources' }, right: 3 },
        ],
      };
      assert.deepEqual(profile.legality, expected);
      assert.deepEqual(profile.costValidation, expected);
      assert.deepEqual(profile.costEffects, []);

      const parsed = parseAssaultArvnProfile();
      const resolvePerSpace = parsed.stages[1];
      const guardedCost = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === 'and' &&
        node?.if?.then?.some?.((eff: any) => eff?.addVar?.var === 'arvnResources' && eff?.addVar?.delta === -3),
      );
      assert.ok(guardedCost.length >= 1, 'Expected per-space arvnResources spend guarded by __freeOperation and mom_bodyCount');
    });

    it('AC4/AC5/AC6/AC7/AC10: selects ARVN+enemy spaces with LimOp max 1 and ARVN damage branches', () => {
      const parsed = parseAssaultArvnProfile();
      const selectSpaces = parsed.stages[0];
      assert.equal(selectSpaces.stage, 'select-spaces');

      const limOpIf = findDeep(selectSpaces.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp branch for __actionClass == limitedOperation');
      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) => node?.chooseN?.max === 1);
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');
      const bodyCountBypass = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max?.if?.when?.op === '==' &&
        node?.chooseN?.max?.if?.when?.left?.ref === 'gvar' &&
        node?.chooseN?.max?.if?.when?.left?.var === 'mom_bodyCount' &&
        node?.chooseN?.max?.if?.when?.right === true &&
        node?.chooseN?.max?.if?.then === 99,
      );
      const affordabilityCap = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max?.if?.else?.op === 'floorDiv' &&
        node?.chooseN?.max?.if?.else?.left?.ref === 'gvar' &&
        node?.chooseN?.max?.if?.else?.left?.var === 'arvnResources' &&
        node?.chooseN?.max?.if?.else?.right === 3,
      );
      assert.ok(bodyCountBypass.length >= 1, 'Expected Body Count max bypass in ARVN Assault select-spaces');
      assert.ok(affordabilityCap.length >= 1, 'Expected non-Body-Count affordability max floorDiv(arvnResources, 3)');

      const arvnCubeFilter = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '>' &&
        node?.left?.aggregate?.query?.filter?.some((f: any) => f.prop === 'faction' && f.eq === 'ARVN') &&
        node?.left?.aggregate?.query?.filter?.some((f: any) => f.prop === 'type' && f.op === 'in'),
      );
      assert.ok(arvnCubeFilter.length >= 2, 'Expected ARVN cube filter in both selection branches');

      const enemyFilter = findDeep(selectSpaces.effects, (node: any) =>
        node?.op === '>' &&
        node?.left?.aggregate?.query?.filter?.some(
          (f: any) =>
            f.prop === 'faction' &&
            f.op === 'in' &&
            Array.isArray(f.value) &&
            f.value.includes('NVA') &&
            f.value.includes('VC'),
        ),
      );
      assert.ok(enemyFilter.length >= 2, 'Expected enemy filter in both selection branches');

      const resolvePerSpace = parsed.stages[1];
      assert.equal(resolvePerSpace.stage, 'resolve-per-space');
      const provinceTroopsOnly = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '$isProvince' &&
        node?.if?.then?.aggregate?.query?.filter?.some((f: any) => f.prop === 'type' && f.eq === 'troops'),
      );
      assert.ok(provinceTroopsOnly.length >= 1, 'Expected province branch to count ARVN troops only');

      const cityLocCubes = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.else?.aggregate?.query?.filter?.some((f: any) => f.prop === 'type' && f.op === 'in'),
      );
      assert.ok(cityLocCubes.length >= 1, 'Expected city/LoC branch to count ARVN troops+police');

      const highlandThird = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.when?.op === 'zonePropIncludes' &&
        node?.if?.when?.value === 'highland' &&
        node?.if?.then?.op === '/' &&
        node?.if?.then?.right === 3,
      );
      assert.ok(highlandThird.length >= 1, 'Expected highland floor(arvnCubes/3) branch');

      const nonHighlandHalf = findDeep(resolvePerSpace.effects, (node: any) =>
        node?.if?.else?.op === '/' && node?.if?.else?.right === 2,
      );
      assert.ok(nonHighlandHalf.length >= 1, 'Expected non-highland floor(arvnCubes/2) branch');

      const macroCall = findDeep(resolvePerSpace.effects, (node: any) => node?.macro === 'coin-assault-removal-order');
      assert.ok(macroCall.length >= 1, 'Expected coin-assault-removal-order usage');
    });

    it('AC4/AC9: runtime province assault excludes police from damage and free operation skips cost', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 96, 4);
      const space = 'quang-tin-quang-ngai:none';

      const modifiedStart: GameState = {
        ...start,
        activePlayer: asPlayerId(1),
        zones: {
          ...start.zones,
          [space]: [
            { id: asTokenId('arvn-assault-prov-t-1'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('arvn-assault-prov-p-1'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            { id: asTokenId('arvn-assault-prov-p-2'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            {
              id: asTokenId('arvn-assault-prov-enemy-1'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected ARVN assault template move');
      const stateWithGrant = withPendingFreeOperationGrant(modifiedStart, {
        actionIds: ['assault'],
        operationClass: 'limitedOperation',
      });
      const selected = completeProfileMoveDeterministically(
        { ...template!, freeOperation: true, actionClass: 'limitedOperation' },
        (request) => {
          if (request.name === 'targetSpaces') return [space];
          return pickDeterministicDecisionValue(request);
        },
        def,
        stateWithGrant,
      );
      const beforeArvnResources = stateWithGrant.globalVars.arvnResources;
      const final = applyMove(def, stateWithGrant, selected).state;
      assert.equal(final.globalVars.arvnResources, beforeArvnResources, 'Free ARVN Assault should skip per-space cost');
      assert.equal(
        countFactionTokensInSpace(final, space, ['NVA', 'VC']),
        1,
        'Province damage should use troops only; 1 troop => floor(1/2)=0 removals',
      );
    });

    it('AC5/AC6/AC7/AC8: runtime city/highland formulas and aid-on-base removal apply', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const def = compiled.gameDef!;
      const start = operationInitialState(def, 97, 4);
      const citySpace = 'hue:none';
      const highlandSpace = 'quang-nam:none';

      const modifiedStart: GameState = {
        ...start,
        activePlayer: asPlayerId(1),
        zones: {
          ...start.zones,
          [citySpace]: [
            { id: asTokenId('arvn-assault-city-t-1'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('arvn-assault-city-p-1'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            { id: asTokenId('arvn-assault-city-p-2'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            { id: asTokenId('arvn-assault-city-p-3'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            {
              id: asTokenId('arvn-assault-city-enemy-g'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('arvn-assault-city-enemy-b'),
              type: 'base',
              props: { faction: 'VC', type: 'base', tunnel: 'untunneled' },
            },
          ],
          [highlandSpace]: [
            { id: asTokenId('arvn-assault-hi-t-1'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('arvn-assault-hi-t-2'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('arvn-assault-hi-t-3'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
            { id: asTokenId('arvn-assault-hi-p-1'), type: 'police', props: { faction: 'ARVN', type: 'police' } },
            {
              id: asTokenId('arvn-assault-hi-enemy-1'),
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'active' },
            },
            {
              id: asTokenId('arvn-assault-hi-enemy-2'),
              type: 'guerrilla',
              props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
            },
          ],
        },
      };

      const template = legalMoves(def, modifiedStart).find((move) => move.actionId === asActionId('assault'));
      assert.ok(template, 'Expected ARVN assault template move');
      const selected = completeProfileMoveDeterministically(
        { ...template!, actionClass: 'operation' },
        (request) => {
          if (request.name === 'targetSpaces') return [citySpace, highlandSpace];
          return pickDeterministicDecisionValue(request);
        },
        def,
        modifiedStart,
      );

      const beforeAid = Number(modifiedStart.globalVars.aid ?? 0);
      const beforeArvnResources = Number(modifiedStart.globalVars.arvnResources ?? 0);
      const final = applyMove(def, modifiedStart, selected).state;

      assert.equal(final.globalVars.arvnResources, beforeArvnResources - 6, 'Expected -3 ARVN Resources per selected space');
      assert.equal(
        countFactionTokensInSpace(final, citySpace, ['NVA', 'VC']),
        0,
        'City should count troops+police: floor(4/2)=2 removes guerrilla then base',
      );
      assert.equal(
        countFactionTokensInSpace(final, highlandSpace, ['NVA', 'VC']),
        1,
        'Highland should use floor(arvnCubes/3)=1 removal',
      );
      assert.equal(final.globalVars.aid, beforeAid + 6, 'Expected +6 Aid when one insurgent base is removed');
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  describe('applicability dispatch for train profiles', () => {
    it('compiles applicability conditions for both train profiles', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);

      const usProfile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'train-us-profile');
      const arvnProfile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(usProfile, 'train-us-profile must exist');
      assert.ok(arvnProfile, 'train-arvn-profile must exist');

      assert.deepEqual(usProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: 0 });
      assert.deepEqual(arvnProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: 1 });
    });

    it('patrol-us-profile has applicability for player 0 (US)', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);

      const patrolProfile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'patrol-us-profile');
      assert.ok(patrolProfile, 'patrol-us-profile must exist');
      assert.deepEqual(patrolProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: 0 });
    });

    it('patrol-arvn-profile has applicability for player 1 (ARVN)', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);

      const patrolProfile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'patrol-arvn-profile');
      assert.ok(patrolProfile, 'patrol-arvn-profile must exist');
      assert.deepEqual(patrolProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: 1 });
    });

    it('sweep/assault profiles have explicit US/ARVN applicability', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);

      const expected = [
        { id: 'sweep-us-profile', right: 0 },
        { id: 'sweep-arvn-profile', right: 1 },
        { id: 'assault-us-profile', right: 0 },
        { id: 'assault-arvn-profile', right: 1 },
      ];
      for (const entry of expected) {
        const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === entry.id);
        assert.ok(profile, `${entry.id} must exist`);
        assert.deepEqual(profile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: entry.right });
      }
    });
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  describe('patrol-us-profile structure', () => {
    const getPatrolProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'patrol-us-profile');
      assert.ok(profile, 'patrol-us-profile must exist');
      return profile;
    };

    const parsePatrolProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'patrol-us-profile',
      );
      assert.ok(profile, 'patrol-us-profile must exist in parsed doc');
      return profile;
    };

    it('AC1: compiles patrol-us-profile without diagnostics', () => {
      getPatrolProfile();
    });

    it('AC2: US Patrol costs 0 (no resource deduction)', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(profile.costEffects, []);
    });

    it('AC2b: legality is always true (no cost check)', () => {
      const profile = getPatrolProfile();
      assert.equal(profile.legality, true);
    });

    it('AC3: targets LoCs only (category filter)', () => {
      const profile = getPatrolProfile();
      const selectLoCs = profile.stages[0]!;
      assert.equal(selectLoCs.stage, 'select-locs');

      const locFilters = findDeep(selectLoCs.effects, (node: any) =>
        node?.op === '==' &&
        node?.left?.ref === 'zoneProp' &&
        node?.left?.prop === 'category' &&
        node?.right === 'loc',
      );
      assert.ok(
        locFilters.length >= 2,
        `Expected LoC filter in both LimOp and normal branches, found ${locFilters.length}`,
      );
    });

    it('AC4: move-cubes stage uses adjacency-or-connected sourcing for US cubes', () => {
      const parsed = parsePatrolProfile();
      const moveCubes = parsed.stages[1];
      assert.equal(moveCubes.stage, 'move-cubes');

      const patrolSourceQueries = findDeep(moveCubes.effects, (node: any) =>
        node?.query === 'tokensInMapSpaces' &&
        Array.isArray(node?.filter) &&
        node.filter.some((f: any) => f.prop === 'faction' && f.eq === 'US') &&
        node?.spaceFilter?.op === 'or' &&
        node.spaceFilter.args?.some?.((arg: any) => arg?.op === 'adjacent') &&
        node.spaceFilter.args?.some?.((arg: any) => arg?.op === 'connected'),
      );
      assert.ok(patrolSourceQueries.length >= 1, 'Expected adjacency-or-connected Patrol source query for US cubes');
    });

    it('AC5: activation stage — 1 guerrilla per US cube (1:1 ratio)', () => {
      const profile = getPatrolProfile();
      const activateStage = profile.stages[2]!;
      assert.equal(activateStage.stage, 'activate-guerrillas');

      const guerrillaForEach = findDeep(activateStage.effects, (node: any) =>
        node?.forEach?.over?.query === 'tokensInZone' &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'type' && f.op === 'eq' && f.value === 'guerrilla') &&
        node?.forEach?.over?.filter?.some?.((f: any) => f.prop === 'activity' && f.op === 'eq' && f.value === 'underground'),
      );
      assert.ok(guerrillaForEach.length >= 1, 'Expected forEach over underground guerrillas');

      const limitedByCount = findDeep(activateStage.effects, (node: any) =>
        node?.forEach?.limit?.ref === 'binding' &&
        node?.forEach?.limit?.name === '$usCubeCount',
      );
      assert.ok(limitedByCount.length >= 1, 'Expected guerrilla forEach limited by $usCubeCount');
    });

    it('AC6: free Assault uses coin-assault-removal-order macro', () => {
      const parsed = parsePatrolProfile();
      const freeAssault = parsed.stages[3];
      assert.equal(freeAssault.stage, 'free-assault');

      const macroRef = findDeep(freeAssault.effects, (node: any) =>
        node?.macro === 'coin-assault-removal-order',
      );
      assert.ok(macroRef.length >= 1, 'Expected coin-assault-removal-order macro in free-assault');
    });

    it('AC7: free Assault damage formula considers US Base (doubled with base)', () => {
      const profile = getPatrolProfile();
      const freeAssault = profile.stages[3]!;
      assert.equal(freeAssault.stage, 'free-assault');

      const damageConditional = findDeep(freeAssault.effects, (node: any) =>
        node?.if?.when?.op === '>' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '$hasUSBase',
      );
      assert.ok(damageConditional.length >= 1, 'Expected damage conditional on hasUSBase');

      const doubledDamage = findDeep(freeAssault.effects, (node: any) =>
        node?.op === '*' && node?.right === 2,
      );
      assert.ok(doubledDamage.length >= 1, 'Expected damage * 2 when US Base present');
    });

    it('AC8: LimOp variant — max 1 LoC', () => {
      const profile = getPatrolProfile();
      const selectLoCs = profile.stages[0]!;

      const limOpIf = findDeep(selectLoCs.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp check');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) =>
        node?.chooseN?.max === 1,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');

      const normalChooseN = findDeep(limOpIf[0].if.else, (node: any) =>
        node?.chooseN?.max === 99,
      );
      assert.ok(normalChooseN.length >= 1, 'Expected chooseN max:99 in normal branch');
    });

    it('AC9: free Assault limited to at most 1 LoC', () => {
      const profile = getPatrolProfile();
      const freeAssault = profile.stages[3]!;

      const assaultChooseN = findDeep(freeAssault.effects, (node: any) =>
        node?.chooseN?.max === 1 && node?.chooseN?.min === 0,
      );
      assert.ok(assaultChooseN.length >= 1, 'Expected chooseN max:1 for free assault LoC selection');
    });

    it('has four stages stages: select-locs, move-cubes, activate-guerrillas, free-assault', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(
        profile.stages.map((s: any) => s.stage),
        ['select-locs', 'move-cubes', 'activate-guerrillas', 'free-assault'],
      );
    });

    it('forbids partial execution', () => {
      const profile = getPatrolProfile();
      assert.equal(profile.atomicity, 'atomic');
    });
  });

  describe('patrol-arvn-profile structure', () => {
    const getPatrolProfile = () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null);
      const profile = compiled.gameDef!.actionPipelines!.find((p) => p.id === 'patrol-arvn-profile');
      assert.ok(profile, 'patrol-arvn-profile must exist');
      return profile;
    };

    const parsePatrolProfile = (): any => {
      const { parsed } = compileProductionSpec();
      const profile = parsed.doc.actionPipelines?.find(
        (p: { id: string }) => p.id === 'patrol-arvn-profile',
      );
      assert.ok(profile, 'patrol-arvn-profile must exist in parsed doc');
      return profile;
    };

    it('AC1: compiles patrol-arvn-profile without diagnostics', () => {
      getPatrolProfile();
    });

    it('AC2: ARVN Patrol spends 3 upfront unless Body Count is active', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(profile.costEffects, [
        {
          if: {
            when: { op: '!=', left: { ref: 'gvar', var: 'mom_bodyCount' }, right: true },
            then: [{ addVar: { scope: 'global', var: 'arvnResources', delta: -3 } }],
          },
        },
      ]);
    });

    it('AC3: legality and costValidation allow Body Count override or arvnResources >= 3', () => {
      const profile = getPatrolProfile();
      const expected = {
        op: 'or',
        args: [
          { op: '==', left: { ref: 'gvar', var: 'mom_bodyCount' }, right: true },
          { op: '>=', left: { ref: 'gvar', var: 'arvnResources' }, right: 3 },
        ],
      };
      assert.deepEqual(profile.legality, expected);
      assert.deepEqual(profile.costValidation, expected);
    });

    it('AC4: move-cubes stage uses adjacency-or-connected sourcing for ARVN cubes', () => {
      const parsed = parsePatrolProfile();
      const moveCubes = parsed.stages[1];
      assert.equal(moveCubes.stage, 'move-cubes');

      const patrolSourceQueries = findDeep(moveCubes.effects, (node: any) =>
        node?.query === 'tokensInMapSpaces' &&
        Array.isArray(node?.filter) &&
        node.filter.some((f: any) => f.prop === 'faction' && f.eq === 'ARVN') &&
        node?.spaceFilter?.op === 'or' &&
        node.spaceFilter.args?.some?.((arg: any) => arg?.op === 'adjacent') &&
        node.spaceFilter.args?.some?.((arg: any) => arg?.op === 'connected'),
      );
      assert.ok(patrolSourceQueries.length >= 1, 'Expected adjacency-or-connected Patrol source query for ARVN cubes');
    });

    it('AC5: activation stage uses ARVN cube count as guerrilla activation limit', () => {
      const profile = getPatrolProfile();
      const activateStage = profile.stages[2]!;
      assert.equal(activateStage.stage, 'activate-guerrillas');

      const limitedByCount = findDeep(activateStage.effects, (node: any) =>
        node?.forEach?.limit?.ref === 'binding' &&
        node?.forEach?.limit?.name === '$arvnCubeCount',
      );
      assert.ok(limitedByCount.length >= 1, 'Expected guerrilla activation limited by $arvnCubeCount');
    });

    it('AC6: free Assault damage uses ARVN cubes / 2 and ARVN actor faction', () => {
      const profile = getPatrolProfile();
      const freeAssault = profile.stages[3]!;
      assert.equal(freeAssault.stage, 'free-assault');

      const divideByTwo = findDeep(freeAssault.effects, (node: any) =>
        node?.op === '/' &&
        node?.left?.ref === 'binding' &&
        node?.left?.name === '$arvnCubes' &&
        node?.right === 2,
      );
      assert.ok(divideByTwo.length >= 1, 'Expected ARVN patrol free-assault damage formula arvnCubes/2');

      const parsed = parsePatrolProfile();
      const parsedFreeAssault = parsed.stages[3];
      const macroRef = findDeep(parsedFreeAssault.effects, (node: any) =>
        node?.macro === 'coin-assault-removal-order',
      );
      assert.ok(macroRef.length >= 1, 'Expected coin-assault-removal-order in ARVN free-assault');
      assert.equal(macroRef.some((node: any) => node?.args?.actorFaction !== undefined), false, 'Expected no actorFaction arg');
    });

    it('AC7: LimOp variant limits destination selection to max 1 LoC', () => {
      const profile = getPatrolProfile();
      const selectLoCs = profile.stages[0]!;

      const limOpIf = findDeep(selectLoCs.effects, (node: any) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIf.length >= 1, 'Expected LimOp check');

      const limOpChooseN = findDeep(limOpIf[0].if.then, (node: any) =>
        node?.chooseN?.max === 1,
      );
      assert.ok(limOpChooseN.length >= 1, 'Expected chooseN max:1 in LimOp branch');
    });

    it('has four stages stages: select-locs, move-cubes, activate-guerrillas, free-assault', () => {
      const profile = getPatrolProfile();
      assert.deepEqual(
        profile.stages.map((s: any) => s.stage),
        ['select-locs', 'move-cubes', 'activate-guerrillas', 'free-assault'],
      );
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
