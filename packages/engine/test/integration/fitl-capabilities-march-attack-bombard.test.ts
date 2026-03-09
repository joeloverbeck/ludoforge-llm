import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameDef, type GameState, type Move, type MoveParamValue, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type MarkerState = 'inactive' | 'unshaded' | 'shaded';
type AttackMode = 'guerrilla-attack' | 'troops-attack';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const SECOND_ATTACK_SPACE = 'quang-nam:none';
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

const addTokensToZone = (state: GameState, zone: string, tokens: readonly Token[]): GameState =>
  tokens.reduce((acc, token) => addTokenToZone(acc, zone, token), state);

const countTokensInZone = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter(predicate).length;

const makePt76State = (def: GameDef, marker: MarkerState, seed: number, nvaResources = 7): GameState => {
  const base = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  return withGlobalMarker(
    {
      ...base,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...base.globalVars,
        nvaResources,
      },
    },
    'cap_pt76',
    marker,
  );
};

const buildAttackModeParams = (
  targetSpaces: readonly string[],
  modeBySpace: Readonly<Record<string, AttackMode>>,
): Record<string, string> => {
  if (targetSpaces.length === 1) {
    const firstSpace = targetSpaces[0]!;
    return { $attackMode: modeBySpace[firstSpace] ?? 'troops-attack' };
  }
  return Object.fromEntries(
    targetSpaces.map((space, index) => [`$attackMode#${index + 1}`, modeBySpace[space] ?? 'troops-attack']),
  );
};

const runNvaAttack = (
  def: GameDef,
  state: GameState,
  targetSpaces: readonly string[],
  modeBySpace: Readonly<Record<string, AttackMode>>,
  options?: {
    readonly freeOperation?: boolean;
    readonly extraParams?: Readonly<Record<string, MoveParamValue>>;
    readonly compound?: {
      readonly specialActivity: {
        readonly actionId: ReturnType<typeof asActionId>;
        readonly params: Record<string, MoveParamValue>;
      };
      readonly timing: 'during' | 'after';
      readonly insertAfterStage?: number;
      readonly replaceRemainingStages?: boolean;
    };
  },
): GameState => {
  const move: Move = {
    actionId: asActionId('attack'),
    params: {
      $targetSpaces: [...targetSpaces],
      ...buildAttackModeParams(targetSpaces, modeBySpace),
      ...(options?.extraParams ?? {}),
    },
    ...(options?.freeOperation === undefined ? {} : { freeOperation: options.freeOperation }),
    ...(options?.compound === undefined ? {} : { compound: options.compound }),
  };
  return applyMoveWithResolvedDecisionIds(def, state, move).state;
};

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
      $targetSpaces: [LOC_SPACE],
      [`$movingGuerrillas@${LOC_SPACE}`]: [mover1, mover2],
      [`$movingTroops@${LOC_SPACE}`]: [],
    },
  }).state;
};

const runNvaAttackWithPt76 = (def: GameDef, marker: MarkerState, seed: number, freeOperation = false): GameState => {
  const setup = addTokensToZone(makePt76State(def, marker, seed), ATTACK_SPACE, [
    makeToken(`attack-${marker}-nva-1`, 'troops', 'NVA'),
    makeToken(`attack-${marker}-nva-2`, 'troops', 'NVA'),
    makeToken(`attack-${marker}-arvn-1`, 'troops', 'ARVN'),
  ]);
  return runNvaAttack(def, setup, [ATTACK_SPACE], { [ATTACK_SPACE]: 'troops-attack' }, { freeOperation });
};

const runNvaAttackDamageWithPt76 = (def: GameDef, marker: MarkerState, seed: number): GameState => {
  const setup = addTokensToZone(makePt76State(def, marker, seed), ATTACK_SPACE, [
    makeToken(`damage-${marker}-nva-1`, 'troops', 'NVA'),
    makeToken(`damage-${marker}-nva-2`, 'troops', 'NVA'),
    makeToken(`damage-${marker}-nva-3`, 'troops', 'NVA'),
    makeToken(`damage-${marker}-arvn-1`, 'troops', 'ARVN'),
    makeToken(`damage-${marker}-arvn-2`, 'troops', 'ARVN'),
    makeToken(`damage-${marker}-arvn-3`, 'troops', 'ARVN'),
  ]);
  return runNvaAttack(def, setup, [ATTACK_SPACE], { [ATTACK_SPACE]: 'troops-attack' }, { freeOperation: true });
};

const bombardSelectionIsLegal = (def: GameDef, marker: MarkerState, $targetSpaces: string[], seed: number): boolean => {
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
      params: { $targetSpaces },
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
    const attackText = JSON.stringify(attackNva);
    const bombardText = JSON.stringify(bombard.stages);
    assert.ok(marchText.includes('"marker":"cap_mainForceBns"') && marchText.includes('"unshaded"'));
    assert.ok(attackText.includes('"marker":"cap_pt76"') && attackText.includes('"unshaded"'));
    assert.ok(attackText.includes('"marker":"cap_pt76"') && attackText.includes('"shaded"'));
    assert.ok(attackText.includes('"$pt76EnhancedSpace"'), 'Expected attack-nva-profile to choose a single PT-76 shaded space');
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

  it('applies cap_pt76 unshaded troop payment when an NVA troop is present in the attacked space', () => {
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

  it('falls back to normal resource payment for unshaded PT-76 when no NVA troop is present', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const makeNoTroopAttackState = (marker: MarkerState, seed: number): GameState =>
      addTokensToZone(makePt76State(def, marker, seed), ATTACK_SPACE, [
        makeToken(`pt76-no-troops-${marker}-g`, 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken(`pt76-no-troops-${marker}-arvn`, 'troops', 'ARVN'),
      ]);

    const inactive = runNvaAttack(
      def,
      makeNoTroopAttackState('inactive', 3201),
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
    );
    const unshaded = runNvaAttack(
      def,
      makeNoTroopAttackState('unshaded', 3202),
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
    );

    assert.equal(inactive.globalVars.nvaResources, 6, 'Inactive PT-76 should spend the baseline NVA resource');
    assert.equal(unshaded.globalVars.nvaResources, 6, 'Unshaded PT-76 should fall back to the baseline NVA resource spend');
    assert.equal(
      countTokensInZone(unshaded, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'Unshaded PT-76 should not fabricate a troop payment when no NVA troop is present',
    );
  });

  it('lets unshaded PT-76 fund additional NVA Attack spaces via troop payment when each selected space contains an NVA troop', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const targetSpaces = [ATTACK_SPACE, SECOND_ATTACK_SPACE] as const;
    const makeTwoSpaceState = (marker: MarkerState, seed: number): GameState => {
      let state = makePt76State(def, marker, seed, 0);
      state = addTokensToZone(state, ATTACK_SPACE, [
        makeToken(`pt76-afford-${marker}-nva-1`, 'troops', 'NVA'),
        makeToken(`pt76-afford-${marker}-us-1`, 'troops', 'US'),
      ]);
      return addTokensToZone(state, SECOND_ATTACK_SPACE, [
        makeToken(`pt76-afford-${marker}-nva-2`, 'troops', 'NVA'),
        makeToken(`pt76-afford-${marker}-us-2`, 'troops', 'US'),
      ]);
    };

    assert.throws(
      () =>
        runNvaAttack(
          def,
          makeTwoSpaceState('inactive', 3203),
          targetSpaces,
          { [ATTACK_SPACE]: 'troops-attack', [SECOND_ATTACK_SPACE]: 'troops-attack' },
        ),
      /(?:Illegal move|choiceRuntimeValidationFailed|cost validation failed|ACTION_PIPELINE_COST_VALIDATION_FAILED)/,
      'Inactive PT-76 should not allow two paid Attack spaces with zero NVA resources',
    );

    const unshaded = runNvaAttack(
      def,
      makeTwoSpaceState('unshaded', 3204),
      targetSpaces,
      { [ATTACK_SPACE]: 'troops-attack', [SECOND_ATTACK_SPACE]: 'troops-attack' },
    );

    assert.equal(unshaded.globalVars.nvaResources, 0, 'Unshaded PT-76 should preserve NVA resources when each selected space pays with a troop');
    assert.equal(
      countTokensInZone(unshaded, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Unshaded PT-76 should remove one NVA troop from each selected Attack space that can pay the cost',
    );
  });

  it('removes the PT-76 unshaded troop before NVA Attack plus Ambush resolves', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokensToZone(makePt76State(def, 'unshaded', 3205), ATTACK_SPACE, [
      makeToken('pt76-ambush-t', 'troops', 'NVA'),
      makeToken('pt76-ambush-g', 'guerrilla', 'NVA', { activity: 'underground' }),
      makeToken('pt76-ambush-us', 'troops', 'US'),
    ]);

    const final = runNvaAttack(
      def,
      setup,
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
      {
        compound: {
          specialActivity: {
            actionId: asActionId('ambushNva'),
            params: {
              $targetSpaces: [ATTACK_SPACE],
              [`$ambushTargetMode@${ATTACK_SPACE}`]: 'self',
            },
          },
          timing: 'during',
          insertAfterStage: 1,
          replaceRemainingStages: true,
        },
      },
    );

    assert.equal(final.globalVars.nvaResources, 7, 'Unshaded PT-76 should replace the Attack resource cost even when Ambush replaces combat');
    assert.equal(
      countTokensInZone(final, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'PT-76 unshaded should remove the NVA troop before the compound Ambush resolves',
    );
    assert.equal(
      countTokensInZone(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      1,
      'The PT-76 troop payment should route to Available',
    );
    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'The accompanying NVA Ambush should still remove the enemy piece normally',
    );
  });

  it('applies cap_pt76 shaded only to one chosen Attack space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let setup = makePt76State(def, 'shaded', 3206);
    setup = addTokensToZone(setup, ATTACK_SPACE, [
      makeToken('pt76-shaded-a-nva-1', 'troops', 'NVA'),
      makeToken('pt76-shaded-a-nva-2', 'troops', 'NVA'),
      makeToken('pt76-shaded-a-arvn-1', 'troops', 'ARVN'),
      makeToken('pt76-shaded-a-arvn-2', 'troops', 'ARVN'),
    ]);
    setup = addTokensToZone(setup, SECOND_ATTACK_SPACE, [
      makeToken('pt76-shaded-b-nva-1', 'troops', 'NVA'),
      makeToken('pt76-shaded-b-nva-2', 'troops', 'NVA'),
      makeToken('pt76-shaded-b-arvn-1', 'troops', 'ARVN'),
      makeToken('pt76-shaded-b-arvn-2', 'troops', 'ARVN'),
    ]);

    const final = runNvaAttack(
      def,
      setup,
      [ATTACK_SPACE, SECOND_ATTACK_SPACE],
      { [ATTACK_SPACE]: 'troops-attack', [SECOND_ATTACK_SPACE]: 'troops-attack' },
      {
        freeOperation: true,
        extraParams: { $pt76EnhancedSpace: SECOND_ATTACK_SPACE },
      },
    );

    assert.equal(
      countTokensInZone(final, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      1,
      'Non-selected spaces should keep the baseline floor(troops/2) Attack damage',
    );
    assert.equal(
      countTokensInZone(final, SECOND_ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'The chosen PT-76 shaded space should remove one enemy per NVA troop',
    );
  });

  it('applies cap_pt76 shaded to guerrilla attacks when NVA troops are present and has no effect when they are not', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const withTroops = addTokensToZone(makePt76State(def, 'shaded', 3207), ATTACK_SPACE, [
      makeToken('pt76-guerrilla-troop-1', 'troops', 'NVA'),
      makeToken('pt76-guerrilla-troop-2', 'troops', 'NVA'),
      makeToken('pt76-guerrilla-g', 'guerrilla', 'NVA', { activity: 'underground' }),
      makeToken('pt76-guerrilla-arvn-1', 'troops', 'ARVN'),
      makeToken('pt76-guerrilla-arvn-2', 'troops', 'ARVN'),
    ]);

    const shadedWithTroops = runNvaAttack(
      def,
      withTroops,
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
      {
        freeOperation: true,
        extraParams: { $pt76EnhancedSpace: ATTACK_SPACE },
      },
    );

    assert.equal(
      countTokensInZone(shadedWithTroops, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'Shaded PT-76 should remove one enemy per NVA troop even during guerrilla attack mode',
    );
    const activatedGuerrilla = (shadedWithTroops.zones[ATTACK_SPACE] ?? []).find((token) => token.id === asTokenId('pt76-guerrilla-g'));
    assert.equal(activatedGuerrilla?.props.activity, 'active', 'Guerrilla attack mode should still activate the NVA guerrilla first');

    const makeNoTroopsState = (marker: MarkerState, seed: number): GameState =>
      addTokensToZone(makePt76State(def, marker, seed), ATTACK_SPACE, [
        makeToken(`pt76-shaded-no-troops-${marker}-g`, 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken(`pt76-shaded-no-troops-${marker}-arvn`, 'troops', 'ARVN'),
      ]);

    const inactiveNoTroops = runNvaAttack(
      def,
      makeNoTroopsState('inactive', 3208),
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
      { freeOperation: true },
    );
    const shadedNoTroops = runNvaAttack(
      def,
      makeNoTroopsState('shaded', 3208),
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'guerrilla-attack' },
      {
        freeOperation: true,
        extraParams: { $pt76EnhancedSpace: ATTACK_SPACE },
      },
    );

    assert.equal(
      countTokensInZone(shadedNoTroops, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      countTokensInZone(inactiveNoTroops, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      'Shaded PT-76 should leave defender losses unchanged when the chosen space has no NVA troops',
    );
    assert.equal(
      countTokensInZone(shadedNoTroops, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla' && token.props.activity === 'active'),
      countTokensInZone(inactiveNoTroops, ATTACK_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla' && token.props.activity === 'active'),
      'Shaded PT-76 should leave guerrilla-only attacks unchanged when the chosen space has no NVA troops',
    );
    assert.equal(
      countTokensInZone(shadedNoTroops, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      countTokensInZone(inactiveNoTroops, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      'Shaded PT-76 should not change attacker losses when it has no troop-based effect',
    );
    assert.equal(
      countTokensInZone(shadedNoTroops, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      countTokensInZone(inactiveNoTroops, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      'Shaded PT-76 should not change defender losses when it has no troop-based effect',
    );
  });

  it('applies cap_pt76 shaded only to increase NVA troops-attack damage to one enemy per troop', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const inactive = runNvaAttackDamageWithPt76(def, 'inactive', 3209);
    const shaded = runNvaAttack(
      def,
      addTokensToZone(makePt76State(def, 'shaded', 3210), ATTACK_SPACE, [
        makeToken('damage-shaded-nva-1', 'troops', 'NVA'),
        makeToken('damage-shaded-nva-2', 'troops', 'NVA'),
        makeToken('damage-shaded-nva-3', 'troops', 'NVA'),
        makeToken('damage-shaded-arvn-1', 'troops', 'ARVN'),
        makeToken('damage-shaded-arvn-2', 'troops', 'ARVN'),
        makeToken('damage-shaded-arvn-3', 'troops', 'ARVN'),
      ]),
      [ATTACK_SPACE],
      { [ATTACK_SPACE]: 'troops-attack' },
      {
        freeOperation: true,
        extraParams: { $pt76EnhancedSpace: ATTACK_SPACE },
      },
    );
    const unshaded = runNvaAttackDamageWithPt76(def, 'unshaded', 3211);

    assert.equal(
      countTokensInZone(inactive, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Inactive cap_pt76 should keep baseline floor(troops/2) damage for troops-attack mode',
    );
    assert.equal(
      countTokensInZone(shaded, ATTACK_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'Shaded cap_pt76 should remove one enemy per NVA troop in the chosen troops-attack space',
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
