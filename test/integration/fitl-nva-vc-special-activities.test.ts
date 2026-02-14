import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, type EffectAST, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const operationInitialState = (
  def: Parameters<typeof initialState>[0],
  seed: number,
  playerCount: number,
): GameState => ({
  ...initialState(def, seed, playerCount),
  activePlayer: asPlayerId(2),
  turnOrderState: { type: 'roundRobin' },
});

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (
  state: GameState,
  zone: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zone] ?? []).filter(predicate).length;

describe('FITL NVA/VC special activities integration', () => {
  it('compiles NVA/VC special-activity profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileSummaries = profiles.map((profile) => ({
      id: profile.id,
      actionId: String(profile.actionId),
      windows: profile.linkedWindows ?? [],
    }));

    for (const expected of [
      { id: 'infiltrate-profile', actionId: 'infiltrate', windows: ['nva-special-window'] },
      { id: 'bombard-profile', actionId: 'bombard', windows: ['nva-special-window'] },
      { id: 'nva-ambush-profile', actionId: 'ambushNva', windows: ['nva-special-window'] },
      { id: 'tax-profile', actionId: 'tax', windows: ['vc-special-window'] },
      { id: 'subvert-profile', actionId: 'subvert', windows: ['vc-special-window'] },
      { id: 'vc-ambush-profile', actionId: 'ambushVc', windows: ['vc-special-window'] },
    ]) {
      const found = profileSummaries.find((p) => p.id === expected.id);
      assert.ok(found, `Expected profile ${expected.id}`);
      assert.equal(found!.actionId, expected.actionId);
      assert.deepEqual(found!.windows, expected.windows);
    }
  });

  it('executes infiltrate build-up and guerrilla replacement without spending resources', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'quang-nam:none';
    const start = operationInitialState(def, 131, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        trail: 2,
        nvaResources: 10,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('inf-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
          makeToken('inf-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('inf-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('inf-avail-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t3', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t4', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const result = applyMove(def, modifiedStart, {
      actionId: asActionId('infiltrate'),
      params: {
        targetSpaces: [space],
        [`$infiltrateMode@${space}`]: 'build-up',
        [`$infiltrateGuerrillasToReplace@${space}`]: [asTokenId('inf-g1')],
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.infiltrateCount, 1);
    assert.equal(final.globalVars.nvaResources, 10, 'Infiltrate should have no additional resource cost');
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      4,
      'Build-up should place trail+bases troops and replacement should add one more troop',
    );
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      1,
      'Selected NVA guerrilla should be replaced by a troop',
    );
  });

  it('executes infiltrate takeover with opposition shift and tunneled-base tunnel transfer', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'tay-ninh:none';
    const start = operationInitialState(def, 177, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 9,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('take-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('take-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('take-nva-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('take-vc-base', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
        ],
        'available-NVA:none': [
          makeToken('take-avail-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
      markers: {
        ...start.markers,
        [space]: {
          ...(start.markers[space] ?? {}),
          supportOpposition: 'passiveOpposition',
        },
      },
    };

    const result = applyMove(def, modifiedStart, {
      actionId: asActionId('infiltrate'),
      params: {
        targetSpaces: [space],
        [`$infiltrateMode@${space}`]: 'takeover',
        [`$infiltrateTakeoverReplace@${space}`]: 'yes',
        [`$infiltrateTakeoverTargetType@${space}`]: 'base',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.nvaResources, 9, 'Infiltrate takeover should have zero additional resource cost');
    assert.equal(final.markers[space]?.supportOpposition, 'neutral', 'Takeover should shift opposition one level toward neutral');
    assert.equal(countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'base'), 0);

    const nvaBase = (final.zones[space] ?? []).find((token) => token.props.faction === 'NVA' && token.type === 'base');
    assert.ok(nvaBase, 'Takeover should place an NVA counterpart base');
    assert.equal(nvaBase!.props.tunnel, 'tunneled', 'Replacing a tunneled VC base should transfer tunnel status to NVA base');
  });

  it('executes bombard automatically, routes US losses to casualties, and uses no die roll', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const profile = (def.actionPipelines ?? []).find((candidate) => candidate.id === 'bombard-profile');
    assert.ok(profile, 'Expected bombard-profile to exist');

    const hasRollRandom = (effects: readonly EffectAST[]): boolean =>
      effects.some((effect) => {
        if ('rollRandom' in effect) return true;
        if ('if' in effect) return hasRollRandom(effect.if.then) || (effect.if.else !== undefined && hasRollRandom(effect.if.else));
        if ('forEach' in effect) return hasRollRandom(effect.forEach.effects) || (effect.forEach.in !== undefined && hasRollRandom(effect.forEach.in));
        if ('let' in effect) return hasRollRandom(effect.let.in);
        if ('removeByPriority' in effect) return effect.removeByPriority.in !== undefined && hasRollRandom(effect.removeByPriority.in);
        return false;
      });
    assert.equal(hasRollRandom(profile!.stages.flatMap((stage) => stage.effects)), false, 'Bombard should be automatic (no die roll)');

    const space = 'quang-tri-thua-thien:none';
    const start = operationInitialState(def, 223, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 7,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('bomb-us-1', 'troops', 'US', { type: 'troops' }),
          makeToken('bomb-us-2', 'troops', 'US', { type: 'troops' }),
          makeToken('bomb-us-3', 'troops', 'US', { type: 'troops' }),
          makeToken('bomb-nva-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('bomb-nva-2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('bomb-nva-3', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const casualtiesBefore = modifiedStart.zones['casualties-US:none']?.length ?? 0;
    const result = applyMove(def, modifiedStart, {
      actionId: asActionId('bombard'),
      params: { targetSpaces: [space] },
    });

    const final = result.state;
    assert.equal(final.globalVars.bombardCount, 1);
    assert.equal(final.globalVars.nvaResources, 7, 'Bombard should have no additional resource cost');
    assert.equal(countTokens(final, space, (token) => token.props.faction === 'US' && token.type === 'troops'), 2);
    assert.equal((final.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore, 1, 'Bombard should send removed US troops to casualties');
  });

  it('executes NVA ambush with one-guerrilla activation, no attacker losses, and LoC-adjacent targeting', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const locSpace = 'loc-hue-khe-sanh:none';
    const adjacentTarget = 'hue:none';
    const start = operationInitialState(def, 227, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 8,
      },
      zones: {
        ...start.zones,
        [locSpace]: [
          makeToken('amb-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('amb-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ],
        [adjacentTarget]: [
          makeToken('amb-us-t1', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const nvaBefore = countTokens(modifiedStart, locSpace, (token) => token.props.faction === 'NVA');
    const casualtiesBefore = modifiedStart.zones['casualties-US:none']?.length ?? 0;

    const result = applyMove(def, modifiedStart, {
      actionId: asActionId('ambushNva'),
      params: {
        targetSpaces: [locSpace],
        [`$nvaAmbushTargetMode@${locSpace}`]: 'adjacent',
        [`$nvaAmbushAdjacentTargets@${locSpace}`]: [adjacentTarget],
      },
    });

    const final = result.state;
    const nvaAfter = countTokens(final, locSpace, (token) => token.props.faction === 'NVA');
    assert.equal(final.globalVars.nvaAmbushCount, 1);
    assert.equal(final.globalVars.nvaResources, 8, 'Ambush should have no additional resource cost');
    assert.equal(nvaAfter, nvaBefore, 'NVA Ambush should not inflict attacker attrition');
    assert.equal(
      countTokens(final, locSpace, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
      'Ambush should activate exactly one underground NVA guerrilla',
    );
    assert.equal(countTokens(final, adjacentTarget, (token) => token.props.faction === 'US' && token.type === 'troops'), 0);
    assert.equal((final.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore, 1, 'LoC ambush may remove from adjacent space');
  });

  it('rejects infiltrate when accompanied by an operation outside accompanyingOps', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 313, 2);

    assert.throws(
      () => applyMove(compiled.gameDef!, state, {
        actionId: asActionId('usOp'),
        params: {},
        compound: {
          specialActivity: { actionId: asActionId('infiltrate'), params: {} },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        assert.equal(details.reason, 'special activity cannot accompany this operation');
        assert.equal(details.metadata?.code, 'SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED');
        return true;
      },
    );
  });

  it('allows bombard when accompanyingOps is any', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 229, 4);
    const assaultSpace = 'quang-tri-thua-thien:none';
    const nvaSupportSpace = 'hue:none';
    const seeded: GameState = {
      ...state,
      globalVars: {
        ...state.globalVars,
        nvaResources: 0,
        trail: 4,
      },
      zones: {
        ...state.zones,
        [assaultSpace]: [
          makeToken('any-arvn-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('any-arvn-t2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('any-arvn-t3', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [nvaSupportSpace]: [
          makeToken('any-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('any-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('any-nva-t3', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const result = applyMove(compiled.gameDef!, seeded, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [] },
      compound: {
        specialActivity: { actionId: asActionId('bombard'), params: { targetSpaces: [assaultSpace] } },
        timing: 'after',
      },
    });
    assert.equal(result.state.globalVars.bombardCount, 1);
  });

  it('rejects NVA ambush when SA targetSpaces are not a subset of operation targetSpaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 347, 4);
    const seeded: GameState = {
      ...state,
      zones: {
        ...state.zones,
        'quang-nam:none': [
          makeToken('subset-nva-g', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('subset-us-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, seeded, {
        actionId: asActionId('march'),
        params: {
          targetSpaces: ['quang-tri-thua-thien:none'],
          $movingGuerrillas: [],
          $movingTroops: [],
          chainSpaces: [],
        },
        compound: {
          specialActivity: {
            actionId: asActionId('ambushNva'),
            params: {
              targetSpaces: ['quang-nam:none'],
              '$nvaAmbushTargetMode@quang-nam:none': 'self',
            },
          },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as { readonly reason?: string; readonly metadata?: { readonly code?: string; readonly relation?: string } };
        assert.equal(details.reason, 'special activity violates compound param constraints');
        assert.equal(details.metadata?.code, 'SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED');
        assert.equal(details.metadata?.relation, 'subset');
        return true;
      },
    );
  });

});
