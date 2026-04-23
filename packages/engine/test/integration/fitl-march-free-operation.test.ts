// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  applyDecision,
  asActionId,
  assertValidatedGameDef,
  asPlayerId,
  asTokenId,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  type GameDef,
  type GameState,
  type Move,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { evaluateZoneFilterForMove } from '../../src/kernel/free-operation-grant-authorization.js';
import { runGame } from '../../src/sim/index.js';

const CARD_ID = 'card-71';
const HUE = 'hue:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const SAIGON = 'saigon:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return assertValidatedGameDef(compiled.gameDef!);
};

const setupState = (def: GameDef): GameState => {
  const base = clearAllZones(initialState(def, 71006, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(2),
    zones: {
      ...base.zones,
      [QUANG_TRI]: [
        makeToken('march-freeop-t1', 'troops', 'NVA'),
        makeToken('march-freeop-t2', 'troops', 'NVA'),
        makeToken('march-freeop-t3', 'troops', 'NVA'),
        makeToken('march-freeop-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [HUE]: [
        makeToken('march-freeop-hue-us-1', 'troops', 'US'),
        makeToken('march-freeop-hue-us-2', 'troops', 'US'),
      ],
      [SAIGON]: [
        makeToken('march-freeop-saigon-us', 'troops', 'US'),
      ],
    },
  };
};

const DEF = compileDef();
const PLAYER_COUNT = 4;
const FAILING_MARCH_GUERRILLA_KEY =
  'decision:doc.actionPipelines.10.stages[1].effects.0.forEach.effects.0.if.else.0.chooseN::$movingGuerrillas@quang-nam:none[0]';

const findSeed1006MarchWitnessMicroturn = (): ReturnType<typeof publishMicroturn> => {
  const def = DEF;
  const runtime = createGameDefRuntime(def);
  const agent = new PolicyAgent({ traceLevel: 'summary' });
  let state = initialState(def, 1006, PLAYER_COUNT).state;
  let rng = createRng(1006n);

  for (let step = 0; step < 220; step += 1) {
    const microturn = publishMicroturn(def, state, runtime);
    if (
      microturn.kind === 'chooseNStep'
      && microturn.legalActions.some(
        (decision) =>
          decision.kind === 'chooseNStep'
          && decision.decisionKey === FAILING_MARCH_GUERRILLA_KEY,
      )
    ) {
      return microturn;
    }

    const selected = agent.chooseDecision({ def, state, microturn, rng, runtime });
    rng = selected.rng;
    state = applyDecision(def, state, selected.decision, undefined, runtime).state;
  }

  assert.fail('Expected to reach the seed-1006 required free-operation March witness within 220 decisions');
};

describe('FITL march free operation probe', () => {
  it('treats per-zone binding gaps as deferred during turn-flow eligibility probing', () => {
    const def = DEF;
    const state = setupState(def);
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    const grant = card?.shaded?.freeOperationGrants?.[0];
    if (card?.shaded === undefined || grant?.zoneFilter === undefined || grant.moveZoneBindings === undefined) {
      assert.fail('Expected An Loc shaded March free-operation grant with a zone filter');
    }

    const result = evaluateZoneFilterForMove(
      def,
      state,
      {
        actionId: asActionId('march'),
        freeOperation: true,
        params: {
          $targetSpaces: [HUE],
          [`$movingGuerrillas@${HUE}`]: [],
          [`$movingTroops@${HUE}`]: [
            asTokenId('march-freeop-t1'),
            asTokenId('march-freeop-t2'),
            asTokenId('march-freeop-t3'),
          ],
        },
      } satisfies Move,
      {
        seat: grant.seat,
        moveZoneBindings: grant.moveZoneBindings,
        sequenceBatchId: 'test-batch',
        ...(grant.executeAsSeat === undefined ? {} : { executeAsSeat: grant.executeAsSeat }),
      },
      grant.zoneFilter,
      'turnFlowEligibility',
    );

    assert.equal(result.status, 'resolved');
    assert.equal(result.matched, true);
  });

  it('does not publish the empty required free-operation March confirm on the live seed-1006 witness', () => {
    const microturn = findSeed1006MarchWitnessMicroturn();

    assert.equal(
      microturn.legalActions.some(
        (decision) =>
          decision.kind === 'chooseNStep'
          && decision.decisionKey === FAILING_MARCH_GUERRILLA_KEY
          && decision.command === 'confirm',
      ),
      false,
      'publication must suppress the empty guerrilla confirm that only leads to an unresolved required free-operation grant',
    );
  });

  it('keeps FITL seed 1006 executable through the former required free-operation March witness', () => {
    const runtime = createGameDefRuntime(DEF);
    const agents = Array.from({ length: PLAYER_COUNT }, () => new PolicyAgent({ traceLevel: 'summary' }));

    assert.doesNotThrow(() => {
      runGame(DEF, 1006, agents, 20, PLAYER_COUNT, undefined, runtime);
    });
  });
});
