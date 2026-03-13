import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-77';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';
const BINH_DINH = 'binh-dinh:none';
const PLEIKU = 'pleiku-darlac:none';
const BINH_TUY = 'binh-tuy-binh-thuan:none';
const KIEN_HOA = 'kien-hoa-vinh-binh:none';

const VC_RALLY_SPACES = [QUANG_TRI, QUANG_NAM, QUANG_TIN, BINH_DINH, PLEIKU, BINH_TUY, KIEN_HOA] as const;

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

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
  globals?: {
    readonly arvnResources?: number;
    readonly nvaResources?: number;
    readonly vcResources?: number;
    readonly trail?: number;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      ...(globals?.arvnResources === undefined ? {} : { arvnResources: globals.arvnResources }),
      ...(globals?.nvaResources === undefined ? {} : { nvaResources: globals.nvaResources }),
      ...(globals?.vcResources === undefined ? {} : { vcResources: globals.vcResources }),
      ...(globals?.trail === undefined ? {} : { trail: globals.trail }),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCardMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch),
  );

const countFactionType = (state: GameState, zone: string, faction: string, type: string): number =>
  (state.zones[zone] ?? []).filter(
    (token) => token.props?.faction === faction && token.props?.type === type,
  ).length;

describe('FITL card-77 Detente', () => {
  it('unshaded floors NVA and VC resources, leaves ARVN untouched, and sends up to 5 available NVA Troops out of play', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 77001, 1, 'arvn', 'nva', {
      'available-NVA:none': Array.from({ length: 7 }, (_unused, index) =>
        makeToken(`detente-nva-t-${index + 1}`, 'troops', 'NVA'),
      ),
    }, {
      arvnResources: 31,
      nvaResources: 11,
      vcResources: 9,
    });

    const after = applyMove(def, setup, findCardMove(def, setup, 'unshaded')!).state;

    assert.equal(after.globalVars.arvnResources, 31, 'ARVN resources must be unaffected');
    assert.equal(after.globalVars.nvaResources, 5, 'NVA resources should floor-divide by 2');
    assert.equal(after.globalVars.vcResources, 4, 'VC resources should floor-divide by 2');
    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'troops'), 2, 'Exactly 5 available NVA Troops should leave the pool');
    assert.equal(countFactionType(after, 'out-of-play-NVA:none', 'NVA', 'troops'), 5, 'Moved NVA Troops should enter the NVA out-of-play box');
  });

  it('unshaded moves all available NVA Troops when fewer than 5 exist', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 77002, 1, 'arvn', 'nva', {
      'available-NVA:none': [
        makeToken('detente-few-1', 'troops', 'NVA'),
        makeToken('detente-few-2', 'troops', 'NVA'),
        makeToken('detente-few-3', 'troops', 'NVA'),
      ],
    }, {
      nvaResources: 2,
      vcResources: 1,
    });

    const after = applyMove(def, setup, findCardMove(def, setup, 'unshaded')!).state;

    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'troops'), 0);
    assert.equal(countFactionType(after, 'out-of-play-NVA:none', 'NVA', 'troops'), 3);
    assert.equal(after.globalVars.nvaResources, 1);
    assert.equal(after.globalVars.vcResources, 0);
  });

  it('shaded resource branch adds 9 NVA Resources and limits the VC free Rally to at most 6 spaces', () => {
    const def = compileDef();
    const base = setupCardDrivenState(def, 77003, 2, 'nva', 'vc', {
      'available-VC:none': Array.from({ length: 7 }, (_unused, index) =>
        makeToken(`detente-vc-g-${index + 1}`, 'guerrilla', 'VC', { activity: 'underground' }),
      ),
    }, {
      nvaResources: 4,
      vcResources: 0,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...base.markers,
        ...Object.fromEntries(
          VC_RALLY_SPACES.map((space) => [
            space,
            {
              ...(base.markers[space] ?? {}),
              supportOpposition: 'neutral',
            },
          ]),
        ),
      },
    };

    const afterEvent = applyMove(def, setup, findCardMove(def, setup, 'shaded', 'detente-nva-add-resources')!).state;
    assert.equal(afterEvent.globalVars.nvaResources, 13, 'The resource branch should add 9 NVA Resources immediately');

    const passToVc = legalMoves(def, afterEvent).find((move) => String(move.actionId) === 'pass');
    const vcWindow = passToVc === undefined ? afterEvent : applyMove(def, afterEvent, passToVc).state;
    assert.equal(vcWindow.activePlayer, asPlayerId(3), 'The follow-up free Rally should resolve under VC control');

    const freeRally = legalMoves(def, vcWindow).find(
      (move) => String(move.actionId) === 'rally' && move.freeOperation === true,
    );
    assert.notEqual(freeRally, undefined, 'Expected a VC free Rally');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcWindow, {
          ...freeRally!,
          params: {
            ...freeRally!.params,
            $targetSpaces: [...VC_RALLY_SPACES],
            $noBaseChoice: 'place-guerrilla',
          },
        }),
      (error: unknown) =>
        error instanceof Error
        && /chooseN selection cardinality mismatch|outside options domain|Illegal move/.test(error.message),
      'The free Rally must not accept more than 6 spaces',
    );

    const final = applyMoveWithResolvedDecisionIds(def, vcWindow, {
      ...freeRally!,
      params: {
        ...freeRally!.params,
        $targetSpaces: [...VC_RALLY_SPACES.slice(0, 6)],
        $noBaseChoice: 'place-guerrilla',
      },
    }).state;

    assert.equal(countFactionType(final, 'available-VC:none', 'VC', 'guerrilla'), 1, 'Only 6 VC Guerrillas should be spent');
    for (const space of VC_RALLY_SPACES.slice(0, 6)) {
      assert.equal(countFactionType(final, space, 'VC', 'guerrilla'), 1, `Expected a VC Guerrilla in ${space}`);
    }
    assert.equal(countFactionType(final, KIEN_HOA, 'VC', 'guerrilla'), 0, 'The seventh unselected space must remain unchanged');
  });

  it('shaded infiltrate branch is legal only when NVA can actually Infiltrate, and it delays the VC Rally until after Infiltrate resolves', () => {
    const def = compileDef();
    const unusable = setupCardDrivenState(def, 77004, 2, 'nva', 'vc', {}, {
      nvaResources: 0,
      vcResources: 0,
      trail: 1,
    });

    assert.equal(
      findCardMove(def, unusable, 'shaded', 'detente-nva-infiltrate'),
      undefined,
      'The infiltrate branch should not be offered when NVA cannot Infiltrate',
    );
    assert.notEqual(
      findCardMove(def, unusable, 'shaded', 'detente-nva-add-resources'),
      undefined,
      'The resource branch should remain legal when Infiltrate is unusable',
    );

    const usable = setupCardDrivenState(def, 77005, 2, 'nva', 'vc', {
      [QUANG_TRI]: [makeToken('detente-nva-base', 'base', 'NVA', { tunnel: 'untunneled' })],
      'available-NVA:none': [
        makeToken('detente-infiltrate-t-1', 'troops', 'NVA'),
        makeToken('detente-infiltrate-t-2', 'troops', 'NVA'),
      ],
      'available-VC:none': [makeToken('detente-follow-vc', 'guerrilla', 'VC', { activity: 'underground' })],
    }, {
      nvaResources: 0,
      vcResources: 0,
      trail: 1,
    });

    const afterEvent = applyMove(def, usable, findCardMove(def, usable, 'shaded', 'detente-nva-infiltrate')!).state;
    const queuedAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.deepEqual(
      queuedAfterEvent.map((grant) => ({ seat: grant.seat, actionId: grant.actionIds?.[0] })),
      [{ seat: 'nva', actionId: 'infiltrate' }],
      'Only the NVA Infiltrate should be queued before the branch follow-up effect fires',
    );

    const freeInfiltrate = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'infiltrate' && move.freeOperation === true,
    );
    assert.notEqual(freeInfiltrate, undefined, 'Expected the free NVA Infiltrate');

    const afterInfiltrate = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeInfiltrate!,
      params: {
        ...freeInfiltrate!.params,
        $targetSpaces: [QUANG_TRI],
        [`$infiltrateMode@${QUANG_TRI}`]: 'build-up',
        [`$infiltrateGuerrillasToReplace@${QUANG_TRI}`]: [],
      },
    }).state;

    assert.equal(countFactionType(afterInfiltrate, QUANG_TRI, 'NVA', 'troops'), 2, 'The free Infiltrate should place up to Trail + Base-count NVA Troops');
    const queuedAfterInfiltrate = requireCardDrivenRuntime(afterInfiltrate).pendingFreeOperationGrants ?? [];
    assert.deepEqual(
      queuedAfterInfiltrate.map((grant) => ({ seat: grant.seat, actionId: grant.actionIds?.[0] })),
      [{ seat: 'vc', actionId: 'rally' }],
      'The VC Rally should appear only after the Infiltrate branch resolves',
    );
  });
});
