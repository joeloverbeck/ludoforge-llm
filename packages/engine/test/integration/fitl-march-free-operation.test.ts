// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  asActionId,
  assertValidatedGameDef,
  asPlayerId,
  asTokenId,
  createGameDefRuntime,
  initialState,
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

  it('keeps FITL seed 1006 executable through the former required free-operation March witness', () => {
    const runtime = createGameDefRuntime(DEF);
    const agents = Array.from({ length: PLAYER_COUNT }, () => new PolicyAgent({ traceLevel: 'summary' }));

    assert.doesNotThrow(() => {
      runGame(DEF, 1006, agents, 20, PLAYER_COUNT, undefined, runtime);
    });
  });
});
