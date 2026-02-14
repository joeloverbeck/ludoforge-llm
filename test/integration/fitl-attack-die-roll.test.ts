import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, serializeGameState, type EffectAST, type GameDef, type GameState, type SerializedGameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';

const hasRollRandom = (effects: readonly EffectAST[]): boolean =>
  effects.some((effect) => {
    if ('rollRandom' in effect) return true;
    if ('if' in effect) {
      return hasRollRandom(effect.if.then) || (effect.if.else !== undefined && hasRollRandom(effect.if.else));
    }
    if ('forEach' in effect) {
      return hasRollRandom(effect.forEach.effects) || (effect.forEach.in !== undefined && hasRollRandom(effect.forEach.in));
    }
    if ('let' in effect) return hasRollRandom(effect.let.in);
    if ('removeByPriority' in effect) return effect.removeByPriority.in !== undefined && hasRollRandom(effect.removeByPriority.in);
    return false;
  });

const collectIfBranches = (effects: readonly EffectAST[]): readonly Extract<EffectAST, { if: unknown }>[] => {
  const branches: Extract<EffectAST, { if: unknown }>[] = [];
  for (const effect of effects) {
    if ('if' in effect) {
      branches.push(effect);
      branches.push(...collectIfBranches(effect.if.then));
      if (effect.if.else !== undefined) {
        branches.push(...collectIfBranches(effect.if.else));
      }
    }
    if ('forEach' in effect) {
      branches.push(...collectIfBranches(effect.forEach.effects));
      if (effect.forEach.in !== undefined) {
        branches.push(...collectIfBranches(effect.forEach.in));
      }
    }
    if ('let' in effect) {
      branches.push(...collectIfBranches(effect.let.in));
    }
    if ('rollRandom' in effect) {
      branches.push(...collectIfBranches(effect.rollRandom.in));
    }
    if ('removeByPriority' in effect && effect.removeByPriority.in !== undefined) {
      branches.push(...collectIfBranches(effect.removeByPriority.in));
    }
  }
  return branches;
};

const addToken = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const makeAttackReadyState = (def: GameDef, seed: number): GameState => {
  const start = initialState(def, seed, 4);
  const withNvaPlayer = {
    ...start,
    activePlayer: asPlayerId(2),
    globalVars: {
      ...start.globalVars,
      nvaResources: 20,
    },
  };
  const nvaGuerrilla: Token = {
    id: asTokenId(`test-nva-g-${seed}`),
    type: 'nva-guerrillas',
    props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
  };
  const usTroop: Token = {
    id: asTokenId(`test-us-t-${seed}`),
    type: 'us-troops',
    props: { faction: 'US', type: 'troops' },
  };
  return addToken(addToken(withNvaPlayer, ATTACK_SPACE, nvaGuerrilla), ATTACK_SPACE, usTroop);
};

const countFactionTokens = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => String(token.props.faction) === faction).length;

const countActiveNvaGuerrillas = (state: GameState, zoneId: string): number =>
  (state.zones[zoneId] ?? []).filter(
    (token) =>
      String(token.props.faction) === 'NVA' &&
      String(token.props.type) === 'guerrilla' &&
      String(token.props.activity) === 'active',
  ).length;

const countNvaGuerrillas = (state: GameState, zoneId: string): number =>
  (state.zones[zoneId] ?? []).filter(
    (token) => String(token.props.faction) === 'NVA' && String(token.props.type) === 'guerrilla',
  ).length;

describe('FITL attack die roll integration', () => {
  it('attack-nva-profile uses rollRandom in guerrilla mode and avoids rollRandom in troops mode', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const profile = compiled.gameDef!.actionPipelines?.find((entry) => entry.id === 'attack-nva-profile');
    assert.ok(profile, 'Expected attack-nva-profile in production pipelines');

    const allEffects = profile.stages.flatMap((stage) => stage.effects);
    const ifBranches = collectIfBranches(allEffects);
    const guerrillaBranch = ifBranches.find((branch) => JSON.stringify(branch.if.when).includes('"guerrilla-attack"'));
    const troopsBranch = ifBranches.find((branch) => JSON.stringify(branch.if.when).includes('"troops-attack"'));

    assert.ok(guerrillaBranch, 'Expected guerrilla attack branch');
    assert.ok(troopsBranch, 'Expected troops attack branch');
    assert.equal(hasRollRandom(guerrillaBranch.if.then), true, 'Guerrilla branch should include rollRandom');
    assert.equal(hasRollRandom(troopsBranch.if.then), false, 'Troops branch should not include rollRandom');
  });

  it('guerrilla attack die roll is deterministic for the same seed and same choices', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const run = (seed: number): SerializedGameState => {
      const state = makeAttackReadyState(def, seed);
      const move = {
        actionId: asActionId('attack'),
        params: {
          targetSpaces: [ATTACK_SPACE],
          $attackMode: 'guerrilla-attack',
          $targetFactionFirst: 'US',
        },
      };
      const next = applyMove(def, state, move).state;
      return serializeGameState(next);
    };

    const first = run(173);
    const second = run(173);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
  });

  it('guerrilla mode covers both hit and miss outcomes and preserves attacker/defender invariants', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const run = (seed: number): GameState => {
      const state = makeAttackReadyState(def, seed);
      const move = {
        actionId: asActionId('attack'),
        params: {
          targetSpaces: [ATTACK_SPACE],
          $attackMode: 'guerrilla-attack',
          $targetFactionFirst: 'US',
        },
      };
      return applyMove(def, state, move).state;
    };

    let hitState: GameState | null = null;
    let missState: GameState | null = null;

    for (let seed = 1; seed <= 64; seed += 1) {
      const next = run(seed);
      const usRemainingInSpace = countFactionTokens(next, ATTACK_SPACE, 'US');
      const usInCasualties = countFactionTokens(next, 'casualties-US:none', 'US');
      if (usInCasualties >= 1 && hitState === null) {
        hitState = next;
      }
      if (usRemainingInSpace >= 1 && usInCasualties === 0 && missState === null) {
        missState = next;
      }
      if (hitState !== null && missState !== null) break;
    }

    assert.ok(hitState !== null, 'Expected at least one deterministic seed in [1..64] to hit in guerrilla mode');
    assert.ok(missState !== null, 'Expected at least one deterministic seed in [1..64] to miss in guerrilla mode');

    assert.equal(countFactionTokens(hitState!, ATTACK_SPACE, 'US'), 0, 'Hit should remove US defender from the attacked space');
    assert.equal(countFactionTokens(hitState!, 'casualties-US:none', 'US'), 1, 'Hit should route US loss to casualties');
    assert.equal(
      countNvaGuerrillas(hitState!, ATTACK_SPACE) + countNvaGuerrillas(hitState!, 'available-NVA:none'),
      1,
      'Hit should preserve attacker count (activate first, then attrition can remove exactly one attacker)',
    );

    assert.equal(countFactionTokens(missState!, ATTACK_SPACE, 'US'), 1, 'Miss should leave US defender in place');
    assert.equal(countFactionTokens(missState!, 'casualties-US:none', 'US'), 0, 'Miss should not remove a US defender');
    assert.equal(countActiveNvaGuerrillas(missState!, ATTACK_SPACE), 1, 'NVA guerrilla should become active on miss');
  });
});
