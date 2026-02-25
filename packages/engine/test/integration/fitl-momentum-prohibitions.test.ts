import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  type GameDef,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
});

const withMom = (state: GameState, vars: Record<string, boolean>): GameState => ({
  ...state,
  globalVars: {
    ...state.globalVars,
    ...vars,
  },
});

const withPendingFreeGrant = (
  state: GameState,
  actionId: string,
  operationClass: 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' = 'operation',
): GameState => {
  if (state.turnOrderState.type !== 'cardDriven') {
    return state;
  }
  return {
    ...state,
    turnOrderState: {
      ...state.turnOrderState,
      runtime: {
        ...state.turnOrderState.runtime,
        pendingFreeOperationGrants: [
          ...(state.turnOrderState.runtime.pendingFreeOperationGrants ?? []),
          {
            grantId: `test-free-grant-${actionId}`,
            seat: String(state.activePlayer),
            operationClass,
            actionIds: [actionId],
            remainingUses: 1,
          },
        ],
      },
    },
  };
};

const assertMomentumBlockedActionAllowsGrantedFreeVariant = (
  def: GameDef,
  blockedState: GameState,
  actionId: string,
  operationClass: 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' = 'operation',
): void => {
  const blockedMoves = legalMoves(def, blockedState).filter((move) => String(move.actionId) === actionId);
  assert.equal(
    blockedMoves.some((move) => move.freeOperation !== true),
    false,
    `${actionId} should remain blocked for paid/non-free moves under momentum`,
  );

  const grantedState = withPendingFreeGrant(blockedState, actionId, operationClass);
  const grantedMoves = legalMoves(def, grantedState).filter((move) => String(move.actionId) === actionId);
  const freeMove = grantedMoves.find((move) => move.freeOperation === true);
  assert.notEqual(freeMove, undefined, `${actionId} should expose a free-operation variant when granted`);

  assert.doesNotThrow(
    () => applyMoveWithResolvedDecisionIds(def, grantedState, freeMove!),
    `${actionId} free-operation variant should execute`,
  );
};

const withLookaheadCoup = (def: GameDef, state: GameState, isCoup: boolean): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone];
  if (lookahead === undefined || lookahead.length === 0) {
    return state;
  }
  const top = lookahead[0];
  if (top === undefined) {
    return state;
  }
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [
        {
          ...top,
          props: {
            ...top.props,
            isCoup,
          },
        },
        ...lookahead.slice(1),
      ],
    },
  };
};

describe('FITL momentum prohibition preconditions', () => {
  it('encodes free-operation legality bypass on momentum-blocked profiles (Rule 5.1.2)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const profiles: ReadonlyArray<{ id: string; momentumVars: readonly string[] }> = [
      { id: 'assault-us-profile', momentumVars: ['mom_generalLansdale'] },
      { id: 'air-lift-profile', momentumVars: ['mom_medevacShaded', 'mom_typhoonKate'] },
      { id: 'air-strike-profile', momentumVars: ['mom_rollingThunder', 'mom_daNang', 'mom_bombingPause'] },
      { id: 'transport-profile', momentumVars: ['mom_typhoonKate'] },
      { id: 'infiltrate-profile', momentumVars: ['mom_mcnamaraLine'] },
      { id: 'bombard-profile', momentumVars: ['mom_typhoonKate'] },
      { id: 'nva-ambush-profile', momentumVars: ['mom_claymores'] },
      { id: 'vc-ambush-profile', momentumVars: ['mom_claymores'] },
    ];

    for (const profileExpectation of profiles) {
      const profile = def.actionPipelines?.find((candidate) => candidate.id === profileExpectation.id);
      assert.ok(profile, `Missing expected action pipeline profile: ${profileExpectation.id}`);
      const freeOpGuards = findDeep(profile.legality, (node: unknown) =>
        (node as { op?: string; left?: { ref?: string; name?: string }; right?: unknown })?.op === '==' &&
        (node as { op?: string; left?: { ref?: string; name?: string }; right?: unknown })?.left?.ref === 'binding' &&
        (node as { op?: string; left?: { ref?: string; name?: string }; right?: unknown })?.left?.name === '__freeOperation' &&
        (node as { op?: string; left?: { ref?: string; name?: string }; right?: unknown })?.right === true,
      );
      assert.ok(freeOpGuards.length >= 1, `${profileExpectation.id} must include __freeOperation legality bypass`);

      for (const momentumVar of profileExpectation.momentumVars) {
        const momentumRefs = findDeep(profile.legality, (node: unknown) =>
          (node as { ref?: string; var?: string })?.ref === 'gvar' &&
          (node as { ref?: string; var?: string })?.var === momentumVar,
        );
        assert.ok(momentumRefs.length >= 1, `${profileExpectation.id} should still reference ${momentumVar}`);
      }
    }
  });

  it('keeps Typhoon blocking paid Air Lift but allows granted free Air Lift', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const blocked = withMom(withActivePlayer(initialState(def, 9014, 4).state, 0), { mom_typhoonKate: true });

    const blockedAirLiftMoves = legalMoves(def, blocked).filter((move) => String(move.actionId) === 'airLift');
    assert.equal(
      blockedAirLiftMoves.some((move) => move.freeOperation !== true),
      false,
      'Typhoon should still block paid/non-free Air Lift',
    );

    const granted = withPendingFreeGrant(blocked, 'airLift');
    const grantedAirLiftMoves = legalMoves(def, granted).filter((move) => String(move.actionId) === 'airLift');
    const freeAirLift = grantedAirLiftMoves.find((move) => move.freeOperation === true);
    assert.notEqual(freeAirLift, undefined, 'Granted free Air Lift should be legal despite Typhoon');
    assert.equal(
      grantedAirLiftMoves.some((move) => move.freeOperation !== true),
      false,
      'Grant must not unban paid/non-free Air Lift',
    );

    const beforeCount = Number(granted.globalVars.airLiftCount ?? 0);
    const applied = applyMoveWithResolvedDecisionIds(def, granted, freeAirLift!);
    assert.ok(Number(applied.state.globalVars.airLiftCount ?? 0) > beforeCount, 'Free Air Lift should execute normally');
  });

  it('allows granted free variants for momentum-blocked Transport when granted', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const blockedTransport = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9021, 4).state,
          zones: {
            ...initialState(def, 9021, 4).state.zones,
            'da-nang:none': [makeToken('free-transport-arvn', 'troops', 'ARVN', { type: 'troops' })],
            'loc-hue-da-nang:none': [],
          },
        },
        1,
      ),
      { mom_typhoonKate: true },
    );
    assertMomentumBlockedActionAllowsGrantedFreeVariant(
      def,
      blockedTransport,
      'transport',
      'operation',
    );
  });

  it('prohibits Air Strike when any Air Strike momentum is active, but not from unrelated momentum', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const base = withActivePlayer(initialState(def, 9001, 4).state, 0);

    const runAirStrike = (state: GameState) =>
      applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('airStrike'),
        params: {
          spaces: [],
          $degradeTrail: 'no',
        },
      });

    assert.doesNotThrow(() => runAirStrike(base));
    assert.doesNotThrow(() => runAirStrike(withMom(base, { mom_claymores: true })));

    for (const blocker of ['mom_rollingThunder', 'mom_daNang', 'mom_bombingPause'] as const) {
      assert.throws(
        () => runAirStrike(withMom(base, { [blocker]: true })),
        /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
        `${blocker} should prohibit Air Strike`,
      );
    }
  });

  it('prohibits Air Lift from Medevac shaded or Typhoon Kate', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const base = withActivePlayer(initialState(def, 9002, 4).state, 0);

    const runAirLift = (state: GameState) =>
      applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('airLift'),
        params: {
          spaces: ['saigon:none'],
        },
      });

    assert.doesNotThrow(() => runAirLift(base));
    assert.throws(() => runAirLift(withMom(base, { mom_medevacShaded: true })), /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/);
    assert.throws(() => runAirLift(withMom(base, { mom_typhoonKate: true })), /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/);
  });

  it('prohibits US Assault only, keeping ARVN Assault legal', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'quang-nam:none';

    const usState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9003, 4).state,
          zones: {
            ...initialState(def, 9003, 4).state.zones,
            [space]: [
              makeToken('us-assault-t', 'troops', 'US', { type: 'troops' }),
              makeToken('us-assault-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
            ],
          },
        },
        0,
      ),
      { mom_generalLansdale: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, usState, {
          actionId: asActionId('assault'),
          params: {
            targetSpaces: [space],
            $arvnFollowupSpaces: [],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const arvnState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9004, 4).state,
          zones: {
            ...initialState(def, 9004, 4).state.zones,
            [space]: [
              makeToken('arvn-assault-t', 'troops', 'ARVN', { type: 'troops' }),
              makeToken('arvn-assault-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
            ],
          },
        },
        1,
      ),
      { mom_generalLansdale: true },
    );

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, arvnState, {
        actionId: asActionId('assault'),
        params: {
          targetSpaces: [space],
        },
      }),
    );
  });

  it('prohibits both NVA and VC Ambush under Claymores', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nvaSpace = 'quang-nam:none';
    const nvaState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9005, 4).state,
          zones: {
            ...initialState(def, 9005, 4).state.zones,
            [nvaSpace]: [
              makeToken('nva-ambush-g', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
              makeToken('nva-ambush-us', 'troops', 'US', { type: 'troops' }),
            ],
          },
        },
        2,
      ),
      { mom_claymores: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaState, {
          actionId: asActionId('ambushNva'),
          params: {
            targetSpaces: [nvaSpace],
            [`$ambushTargetMode@${nvaSpace}`]: 'self',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const vcSpace = 'tay-ninh:none';
    const vcState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9006, 4).state,
          zones: {
            ...initialState(def, 9006, 4).state.zones,
            [vcSpace]: [
              makeToken('vc-ambush-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
              makeToken('vc-ambush-us', 'troops', 'US', { type: 'troops' }),
            ],
          },
        },
        3,
      ),
      { mom_claymores: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcState, {
          actionId: asActionId('ambushVc'),
          params: {
            targetSpaces: [vcSpace],
            [`$ambushTargetMode@${vcSpace}`]: 'self',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('prohibits Infiltrate and blocks Rally trail improvement under McNamara Line', () => {
    const { parsed, compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const infilSpace = 'quang-tri-thua-thien:none';
    const infiltrateState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9007, 4).state,
          zones: {
            ...initialState(def, 9007, 4).state.zones,
            [infilSpace]: [
              makeToken('inf-nva-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
              makeToken('inf-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
            ],
          },
        },
        2,
      ),
      { mom_mcnamaraLine: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, infiltrateState, {
          actionId: asActionId('infiltrate'),
          params: {
            targetSpaces: [infilSpace],
            [`$infiltrateMode@${infilSpace}`]: 'build-up',
            [`$infiltrateGuerrillasToReplace@${infilSpace}`]: [],
          },
      }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const rallyProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'rally-nva-profile');
    assert.ok(rallyProfile, 'Expected rally-nva-profile in parsed production doc');

    const trailStage = rallyProfile.stages.find((stage) => stage.stage === 'trail-improvement');
    assert.ok(trailStage, 'Expected rally-nva-profile trail-improvement stage');

    const includesMcNamaraGuard = JSON.stringify(trailStage.effects).includes('mom_mcnamaraLine');
    assert.equal(includesMcNamaraGuard, true, 'Rally trail improvement should be guarded by mom_mcnamaraLine');
  });

  it('prohibits Transport and Bombard under Typhoon Kate and caps remaining SAs to 1 space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'da-nang:none';
    const destination = 'loc-hue-da-nang:none';
    const transportState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9009, 4).state,
          zones: {
            ...initialState(def, 9009, 4).state.zones,
            [origin]: [makeToken('typhoon-transport-arvn', 'troops', 'ARVN', { type: 'troops' })],
            [destination]: [],
          },
        },
        1,
      ),
      { mom_typhoonKate: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, transportState, {
          actionId: asActionId('transport'),
          params: {
            $transportOrigin: origin,
            $transportDestination: destination,
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const bombardSpace = 'quang-nam:none';
    const bombardState = withMom(
      withActivePlayer(
        {
          ...initialState(def, 9010, 4).state,
          zones: {
            ...initialState(def, 9010, 4).state.zones,
            [bombardSpace]: [
              makeToken('typhoon-bombard-nva-1', 'troops', 'NVA', { type: 'troops' }),
              makeToken('typhoon-bombard-nva-2', 'troops', 'NVA', { type: 'troops' }),
              makeToken('typhoon-bombard-nva-3', 'troops', 'NVA', { type: 'troops' }),
              makeToken('typhoon-bombard-us-1', 'troops', 'US', { type: 'troops' }),
              makeToken('typhoon-bombard-us-2', 'troops', 'US', { type: 'troops' }),
              makeToken('typhoon-bombard-us-3', 'troops', 'US', { type: 'troops' }),
            ],
          },
        },
        2,
      ),
      { mom_typhoonKate: true },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, bombardState, {
          actionId: asActionId('bombard'),
          params: {
            targetSpaces: [bombardSpace],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const adviseBase = withActivePlayer(withLookaheadCoup(def, initialState(def, 9011, 4).state, false), 0);
    const twoSpaceAdviseMove = legalMoves(def, adviseBase).find(
      (move) =>
        move.actionId === asActionId('advise') &&
        Array.isArray(move.params.targetSpaces) &&
        move.params.targetSpaces.length === 2,
    );
    if (twoSpaceAdviseMove !== undefined) {
      assert.doesNotThrow(() =>
        applyMoveWithResolvedDecisionIds(def, adviseBase, twoSpaceAdviseMove),
      );

      const adviseTyphoon = withMom(adviseBase, { mom_typhoonKate: true });
      assert.throws(
        () =>
          applyMoveWithResolvedDecisionIds(def, adviseTyphoon, twoSpaceAdviseMove),
        /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      );
    } else {
      const adviseMoves = legalMoves(def, adviseBase).filter((move) => move.actionId === asActionId('advise'));
      assert.equal(
        adviseMoves.every(
          (move) => !Array.isArray(move.params.targetSpaces) || move.params.targetSpaces.length <= 1,
        ),
        true,
        'Expected advise to expose only one-space targeting in this deterministic setup',
      );
    }

    const raidA = 'quang-nam:none';
    const raidB = 'tay-ninh:none';
    const raidBase = withActivePlayer(withLookaheadCoup(def, initialState(def, 9012, 4).state, false), 1);

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, raidBase, {
        actionId: asActionId('raid'),
        params: {
          targetSpaces: [raidA, raidB],
          [`$raidIncomingFrom@${raidA}`]: [],
          [`$raidIncomingFrom@${raidB}`]: [],
          [`$raidRemove@${raidA}`]: 'no',
          [`$raidRemove@${raidB}`]: 'no',
        },
      }),
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withMom(raidBase, { mom_typhoonKate: true }), {
          actionId: asActionId('raid'),
          params: {
            targetSpaces: [raidA, raidB],
            [`$raidIncomingFrom@${raidA}`]: [],
            [`$raidIncomingFrom@${raidB}`]: [],
            [`$raidRemove@${raidA}`]: 'no',
            [`$raidRemove@${raidB}`]: 'no',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('blocks Air Strike trail degrade under Oriskany while still allowing Air Strike', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'quang-nam:none';

    const baseState = withActivePlayer(
      {
        ...initialState(def, 9013, 4).state,
        globalVars: {
          ...initialState(def, 9013, 4).state.globalVars,
          trail: 2,
        },
        zones: {
          ...initialState(def, 9013, 4).state.zones,
          [space]: [
            makeToken('oriskany-us', 'troops', 'US', { type: 'troops' }),
            makeToken('oriskany-vc-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
            makeToken('oriskany-vc-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          ],
        },
      },
      0,
    );

    const withoutOriskany = applyMoveWithResolvedDecisionIds(def, baseState, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    });
    assert.equal(withoutOriskany.state.globalVars.trail, 1, 'Air Strike should degrade Trail without Oriskany');

    const withOriskany = applyMoveWithResolvedDecisionIds(def, withMom(baseState, { mom_oriskany: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    });
    assert.equal(withOriskany.state.globalVars.trail, 2, 'Oriskany should prevent Air Strike trail degrade');
  });
});
