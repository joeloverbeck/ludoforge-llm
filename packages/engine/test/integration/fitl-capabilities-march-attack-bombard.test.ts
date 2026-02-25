import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type MarkerState = 'inactive' | 'unshaded' | 'shaded';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const LOC_SPACE = 'loc-hue-da-nang:none';
const MARCH_ORIGIN = 'quang-nam:none';
const BOMBARD_SPACE_1 = 'quang-tri-thua-thien:none';
const BOMBARD_SPACE_2 = 'quang-nam:none';
const BOMBARD_SPACE_3 = 'quang-tin-quang-ngai:none';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const withGlobalMarker = (state: GameState, marker: string, value: MarkerState): GameState => ({
  ...state,
  globalMarkers: {
    ...state.globalMarkers,
    [marker]: value,
  },
});

const addTokenToZone = (state: GameState, zone: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zone]: [...(state.zones[zone] ?? []), token],
  },
});

const countTokensInZone = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter(predicate).length;

const runVcMarchWithMainForceBns = (def: GameDef, marker: MarkerState, seed: number): GameState => {
  const mover1 = asTokenId(`march-${marker}-g1`);
  const mover2 = asTokenId(`march-${marker}-g2`);
  const start = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });

  const setupBase = withGlobalMarker(
    {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 6,
      },
    },
    'cap_mainForceBns',
    marker,
  );

  const setup = addTokenToZone(
    addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          setupBase,
          MARCH_ORIGIN,
          makeToken(`march-${marker}-g1`, 'guerrilla', 'VC', { activity: 'underground' }),
        ),
        MARCH_ORIGIN,
        makeToken(`march-${marker}-g2`, 'guerrilla', 'VC', { activity: 'underground' }),
      ),
      LOC_SPACE,
      makeToken(`march-${marker}-us1`, 'troops', 'US'),
    ),
    LOC_SPACE,
    makeToken(`march-${marker}-us2`, 'troops', 'US'),
  );

  return applyMoveWithResolvedDecisionIds(def, setup, {
    actionId: asActionId('march'),
    params: {
      targetSpaces: [LOC_SPACE],
      [`$movingGuerrillas@${LOC_SPACE}`]: [mover1, mover2],
      [`$movingTroops@${LOC_SPACE}`]: [],
    },
  }).state;
};

const runNvaAttackWithPt76 = (def: GameDef, marker: MarkerState, seed: number, freeOperation = false): GameState => {
  const base = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  const start = withGlobalMarker(
    {
      ...base,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...base.globalVars,
        nvaResources: 7,
      },
    },
    'cap_pt76',
    marker,
  );

  const setup = addTokenToZone(
    addTokenToZone(
      addTokenToZone(start, ATTACK_SPACE, makeToken(`attack-${marker}-nva-1`, 'troops', 'NVA')),
      ATTACK_SPACE,
      makeToken(`attack-${marker}-nva-2`, 'troops', 'NVA'),
    ),
    ATTACK_SPACE,
    makeToken(`attack-${marker}-arvn-1`, 'troops', 'ARVN'),
  );

  return applyMoveWithResolvedDecisionIds(def, setup, {
    actionId: asActionId('attack'),
    freeOperation,
    params: {
      targetSpaces: [ATTACK_SPACE],
      $attackMode: 'troops-attack',
    },
  }).state;
};

const runNvaAttackDamageWithPt76 = (def: GameDef, marker: MarkerState, seed: number): GameState => {
  const base = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  const start = withGlobalMarker(
    {
      ...base,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...base.globalVars,
        nvaResources: 7,
      },
    },
    'cap_pt76',
    marker,
  );

  const withNva = addTokenToZone(
    addTokenToZone(
      addTokenToZone(start, ATTACK_SPACE, makeToken(`damage-${marker}-nva-1`, 'troops', 'NVA')),
      ATTACK_SPACE,
      makeToken(`damage-${marker}-nva-2`, 'troops', 'NVA'),
    ),
    ATTACK_SPACE,
    makeToken(`damage-${marker}-nva-3`, 'troops', 'NVA'),
  );
  const setup = addTokenToZone(
    addTokenToZone(
      addTokenToZone(withNva, ATTACK_SPACE, makeToken(`damage-${marker}-arvn-1`, 'troops', 'ARVN')),
      ATTACK_SPACE,
      makeToken(`damage-${marker}-arvn-2`, 'troops', 'ARVN'),
    ),
    ATTACK_SPACE,
    makeToken(`damage-${marker}-arvn-3`, 'troops', 'ARVN'),
  );

  return applyMoveWithResolvedDecisionIds(def, setup, {
    actionId: asActionId('attack'),
    freeOperation: true,
    params: {
      targetSpaces: [ATTACK_SPACE],
      $attackMode: 'troops-attack',
    },
  }).state;
};

const bombardSelectionIsLegal = (def: GameDef, marker: MarkerState, targetSpaces: string[], seed: number): boolean => {
  const start = withGlobalMarker(
    {
      ...makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' }),
      activePlayer: asPlayerId(2),
    },
    'cap_longRangeGuns',
    marker,
  );

  const spaces = [BOMBARD_SPACE_1, BOMBARD_SPACE_2, BOMBARD_SPACE_3];
  const setup = spaces.reduce((acc, space, index) => {
    let next = acc;
    for (let i = 0; i < 3; i += 1) {
      next = addTokenToZone(next, space, makeToken(`bomb-${marker}-${index}-nva-${i}`, 'troops', 'NVA'));
      next = addTokenToZone(next, space, makeToken(`bomb-${marker}-${index}-us-${i}`, 'troops', 'US'));
    }
    return next;
  }, start);

  try {
    applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('bombard'),
      params: { targetSpaces },
    });
    return true;
  } catch {
    return false;
  }
};

describe('FITL capability branches (March/Attack/Bombard)', () => {
  it('compiles production spec with side-specific capability checks for March, Attack, and Bombard branches', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const profiles = parsed.doc.actionPipelines ?? [];
    const marchVc = profiles.find((profile) => profile.id === 'march-vc-profile');
    const attackNva = profiles.find((profile) => profile.id === 'attack-nva-profile');
    const bombard = profiles.find((profile) => profile.id === 'bombard-profile');
    assert.ok(marchVc);
    assert.ok(attackNva);
    assert.ok(bombard);

    const marchText = JSON.stringify(marchVc.stages);
    const attackText = JSON.stringify(attackNva.stages);
    const bombardText = JSON.stringify(bombard.stages);
    assert.ok(marchText.includes('"marker":"cap_mainForceBns"') && marchText.includes('"unshaded"'));
    assert.ok(attackText.includes('"marker":"cap_pt76"') && attackText.includes('"unshaded"'));
    assert.ok(attackText.includes('"marker":"cap_pt76"') && attackText.includes('"shaded"'));
    assert.ok(bombardText.includes('"marker":"cap_longRangeGuns"') && bombardText.includes('"unshaded"'));
    assert.ok(bombardText.includes('"marker":"cap_longRangeGuns"') && bombardText.includes('"shaded"'));
  });

  it('applies cap_mainForceBns unshaded only to allow VC March activation of more than one guerrilla', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const inactive = runVcMarchWithMainForceBns(def, 'inactive', 3001);
    const unshaded = runVcMarchWithMainForceBns(def, 'unshaded', 3002);
    const shaded = runVcMarchWithMainForceBns(def, 'shaded', 3003);

    const vcActiveCount = (state: GameState): number =>
      countTokensInZone(
        state,
        LOC_SPACE,
        (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active',
      );

    assert.equal(vcActiveCount(inactive), 1, 'Inactive cap_mainForceBns should keep default max-1 VC guerrilla activation');
    assert.equal(vcActiveCount(unshaded), 2, 'Unshaded cap_mainForceBns should allow activating both moved VC guerrillas');
    assert.equal(vcActiveCount(shaded), 1, 'Shaded cap_mainForceBns should not trigger unshaded March activation bonus');
  });

  it('applies cap_pt76 unshaded only to replace NVA Attack resource cost with troop payment', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const inactive = runNvaAttackWithPt76(def, 'inactive', 3101);
    const unshaded = runNvaAttackWithPt76(def, 'unshaded', 3102);
    const shaded = runNvaAttackWithPt76(def, 'shaded', 3103);

    assert.equal(inactive.globalVars.nvaResources, 6, 'Inactive cap_pt76 should preserve baseline resource spend');
    assert.equal(unshaded.globalVars.nvaResources, 7, 'Unshaded cap_pt76 should skip baseline nvaResources spend');
    assert.equal(shaded.globalVars.nvaResources, 6, 'Shaded cap_pt76 should not trigger unshaded troop-cost branch');

    assert.equal(
      countTokensInZone(inactive, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Inactive cap_pt76 should not remove an NVA troop for cost',
    );
    assert.equal(
      countTokensInZone(unshaded, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      1,
      'Unshaded cap_pt76 should remove one NVA troop from the attack space as cost',
    );
    assert.equal(
      countTokensInZone(shaded, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Shaded cap_pt76 should not apply unshaded troop-cost behavior',
    );
  });

  it('applies cap_pt76 shaded only to increase NVA troops-attack damage to one enemy per troop', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const inactive = runNvaAttackDamageWithPt76(def, 'inactive', 3201);
    const shaded = runNvaAttackDamageWithPt76(def, 'shaded', 3202);
    const unshaded = runNvaAttackDamageWithPt76(def, 'unshaded', 3203);

    assert.equal(
      countTokensInZone(inactive, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Inactive cap_pt76 should keep baseline floor(troops/2) damage for troops-attack mode',
    );
    assert.equal(
      countTokensInZone(shaded, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'Shaded cap_pt76 should remove one enemy per NVA troop in troops-attack mode',
    );
    assert.equal(
      countTokensInZone(unshaded, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Unshaded cap_pt76 should not trigger shaded per-troop damage behavior',
    );
  });

  it('applies cap_longRangeGuns side-specific Bombard selection caps (inactive=2, unshaded=1, shaded=3)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const oneSpace = [BOMBARD_SPACE_1];
    const twoSpaces = [BOMBARD_SPACE_1, BOMBARD_SPACE_2];
    const threeSpaces = [BOMBARD_SPACE_1, BOMBARD_SPACE_2, BOMBARD_SPACE_3];

    assert.equal(bombardSelectionIsLegal(def, 'inactive', oneSpace, 3301), true);
    assert.equal(bombardSelectionIsLegal(def, 'inactive', twoSpaces, 3302), true);
    assert.equal(bombardSelectionIsLegal(def, 'inactive', threeSpaces, 3303), false);

    assert.equal(bombardSelectionIsLegal(def, 'unshaded', oneSpace, 3304), true);
    assert.equal(bombardSelectionIsLegal(def, 'unshaded', twoSpaces, 3305), false);
    assert.equal(bombardSelectionIsLegal(def, 'unshaded', threeSpaces, 3306), false);

    assert.equal(bombardSelectionIsLegal(def, 'shaded', oneSpace, 3307), true);
    assert.equal(bombardSelectionIsLegal(def, 'shaded', twoSpaces, 3308), true);
    assert.equal(bombardSelectionIsLegal(def, 'shaded', threeSpaces, 3309), true);
  });
});
