import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, initialState, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const SPACE_A = 'quang-tri-thua-thien:none';
const SPACE_B = 'quang-nam:none';
const OPERATION_PROFILE_IDS = [
  'train-us-profile',
  'train-arvn-profile',
  'patrol-us-profile',
  'patrol-arvn-profile',
  'sweep-us-profile',
  'sweep-arvn-profile',
  'assault-us-profile',
  'assault-arvn-profile',
  'rally-nva-profile',
  'rally-vc-profile',
  'march-nva-profile',
  'march-vc-profile',
  'attack-nva-profile',
  'attack-vc-profile',
  'terror-nva-profile',
  'terror-vc-profile',
] as const;
const LIMOP_SELECTOR_MACRO_IDS = [
  'insurgent-march-select-destinations',
  'insurgent-attack-select-spaces',
  'insurgent-terror-select-spaces',
] as const;
const operationInitialState = (def: GameDef, seed: number, playerCount: number): GameState => ({
  ...initialState(def, seed, playerCount),
  turnOrderState: { type: 'roundRobin' },
});

const addTokenToZone = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

describe('FITL limited operation integration', () => {
  it('enforces LimOp selector contract across all 16 operation profiles', () => {
    const { parsed } = compileProductionSpec();
    const macros = parsed.doc.effectMacros ?? [];
    const pipelines = parsed.doc.actionPipelines ?? [];

    for (const macroId of LIMOP_SELECTOR_MACRO_IDS) {
      const macro = macros.find((candidate) => candidate.id === macroId);
      assert.ok(macro, `Expected selector macro ${macroId}`);

      const limOpIfNodes = findDeep(macro.effects, (node) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      assert.ok(limOpIfNodes.length >= 1, `Expected LimOp branch in selector macro ${macroId}`);

      const hasContract = limOpIfNodes.some((node) => {
        const limOpChoose = findDeep(node.if.then, (inner) => inner?.chooseN?.max === 1);
        const operationChoose = findDeep(node.if.else ?? [], (inner) =>
          typeof inner?.chooseN?.max === 'number' && inner.chooseN.max > 1,
        );
        return limOpChoose.length >= 1 && operationChoose.length >= 1;
      });
      assert.ok(hasContract, `Expected ${macroId} to enforce LimOp max=1 and operation max>1`);
    }

    for (const profileId of OPERATION_PROFILE_IDS) {
      const profile = pipelines.find((candidate) => candidate.id === profileId);
      assert.ok(profile, `Expected operation profile ${profileId}`);

      const selectorStage = profile.stages.find((stage) => String(stage.stage).startsWith('select-'));
      assert.ok(selectorStage, `Expected selector stage in ${profileId}`);

      const directLimOpNodes = findDeep(selectorStage.effects, (node) =>
        node?.if?.when?.op === '==' &&
        node?.if?.when?.left?.ref === 'binding' &&
        node?.if?.when?.left?.name === '__actionClass' &&
        node?.if?.when?.right === 'limitedOperation',
      );
      const hasDirectContract = directLimOpNodes.some((node) => {
        const limOpChoose = findDeep(node.if.then, (inner) => inner?.chooseN?.max === 1);
        const operationChoose = findDeep(node.if.else ?? [], (inner) =>
          typeof inner?.chooseN?.max === 'number' && inner.chooseN.max > 1,
        );
        return limOpChoose.length >= 1 && operationChoose.length >= 1;
      });

      const selectorMacroCalls = findDeep(
        selectorStage.effects,
        (node) => typeof node?.macro === 'string' && LIMOP_SELECTOR_MACRO_IDS.includes(node.macro),
      );
      assert.ok(
        hasDirectContract || selectorMacroCalls.length >= 1,
        `Expected ${profileId} selector to be LimOp-aware directly or through a shared selector macro`,
      );
    }
  });

  it('enforces attack limitedOperation to at most one selected target space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 509, 4);
    const withNvaActive = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 10,
      },
    };

    const withTargets = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(withNvaActive, SPACE_A, {
            id: asTokenId('limop-nva-a'),
            type: 'nva-troops',
            props: { faction: 'NVA', type: 'troops' },
          }),
          SPACE_A,
          {
            id: asTokenId('limop-us-a'),
            type: 'us-troops',
            props: { faction: 'US', type: 'troops' },
          },
        ),
        SPACE_B,
        {
          id: asTokenId('limop-nva-b'),
          type: 'nva-troops',
          props: { faction: 'NVA', type: 'troops' },
        },
      ),
      SPACE_B,
      {
        id: asTokenId('limop-us-b'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withTargets, {
          actionId: asActionId('attack'),
          actionClass: 'limitedOperation',
          params: {
            targetSpaces: [SPACE_A, SPACE_B],
            $attackMode: 'troops-attack',
          },
        }),
      /Illegal move/,
      'Limited operation attack should reject multiple target spaces',
    );

    const singleSpace = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      actionClass: 'limitedOperation',
      params: {
        targetSpaces: [SPACE_A],
        $attackMode: 'troops-attack',
      },
    }).state;

    assert.equal(singleSpace.globalVars.nvaResources, 9, 'Limited attack should resolve and spend one NVA resource for one targeted space');
  });

  it('enforces VC attack limitedOperation to at most one selected target space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 510, 4);
    const withVcActive = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 10,
      },
    };

    const withTargets = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(withVcActive, SPACE_A, {
            id: asTokenId('limop-vc-a'),
            type: 'vc-guerrillas',
            props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
          }),
          SPACE_A,
          {
            id: asTokenId('limop-vc-us-a'),
            type: 'us-troops',
            props: { faction: 'US', type: 'troops' },
          },
        ),
        SPACE_B,
        {
          id: asTokenId('limop-vc-b'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
        },
      ),
      SPACE_B,
      {
        id: asTokenId('limop-vc-us-b'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withTargets, {
          actionId: asActionId('attack'),
          actionClass: 'limitedOperation',
          params: {
            targetSpaces: [SPACE_A, SPACE_B],
          },
        }),
      /Illegal move/,
      'Limited operation VC attack should reject multiple target spaces',
    );

    const singleSpace = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      actionClass: 'limitedOperation',
      params: {
        targetSpaces: [SPACE_A],
      },
    }).state;

    assert.equal(singleSpace.globalVars.vcResources, 9, 'Limited VC attack should resolve and spend one VC resource for one targeted space');
  });
});
