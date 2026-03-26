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
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
import {
  applyMoveWithResolvedDecisionIds,
  normalizeDecisionParamsForMove,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-74';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const HUE = 'hue:none';
const PARROTS_BEAK = 'the-parrots-beak:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const DEF = compileDef();

const buildCardMove = (def: GameDef, side: 'unshaded' | 'shaded'): Move => {
  const eventDeckId = def.eventDecks?.[0]?.id;
  if (eventDeckId === undefined) {
    assert.fail('Expected FITL event deck');
  }
  return {
    actionId: asActionId('event'),
    params: {
      eventCardId: CARD_ID,
      eventDeckId,
      side,
    },
  };
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
  globalVars?: Partial<GameState['globalVars']>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');
  const nextGlobalVars: Record<string, number | boolean> = { ...base.globalVars };
  for (const [name, value] of Object.entries(globalVars ?? {})) {
    if (value !== undefined) {
      nextGlobalVars[name] = value;
    }
  }

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: nextGlobalVars,
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

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-74 Lam Son 719', () => {
  it('compiles exact text, Laos-only ARVN placement, a Laos-scoped free LimOp grant, and shaded Laos piece counting', () => {
    const card = DEF.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-74 in production deck');

    assert.equal(card?.title, 'Lam Son 719');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'US', 'VC']);
    assert.equal(
      card?.unshaded?.text,
      'Place up to 6 ARVN Troops in a Laos space. ARVN executes a free LimOp there. Degrade Trail 2 boxes.',
    );
    assert.equal(
      card?.shaded?.text,
      'NVA Resources +6 and +1 more for each ARVN piece in Laos.',
    );

    const unshadedEffects = card?.unshaded?.effects ?? [];
    const unshadedTarget = card?.unshaded?.targets?.[0];
    const targetEffects = unshadedTarget?.effects ?? [];
    assert.deepEqual(unshadedEffects[0], tagEffectAsts({ setActivePlayer: { player: { id: 1 } } }));
    assert.equal(unshadedTarget?.id, '$lamSon719LaosSpace');
    assert.equal(unshadedTarget?.selector?.query, 'mapSpaces');
    assert.deepEqual(unshadedTarget?.cardinality, { max: 1 });
    assert.equal(unshadedTarget?.application, 'aggregate');
    assert.equal((targetEffects[0] as { chooseN?: { bind?: string; min?: unknown } }).chooseN?.bind, '$lamSon719ArvnTroops');
    assert.equal((targetEffects[0] as { chooseN?: { min?: unknown } }).chooseN?.min, 0);
    assert.deepEqual(targetEffects[2], tagEffectAsts({ addVar: { scope: 'global', var: 'trail', delta: -2 } }));
    assert.deepEqual((targetEffects[3] as { if?: unknown }).if, tagEffectAsts({
      when: {
        op: '>',
        left: {
          _t: 5,
          aggregate: {
            op: 'count',
            query: {
              query: 'tokensInZone',
              zone: '$lamSon719LaosSpace',
              filter: {
                op: 'and',
                args: [
                  { prop: 'faction', op: 'eq', value: 'ARVN' },
                  { prop: 'type', op: 'in', value: ['troops', 'police'] },
                ],
              },
            },
          },
        },
        right: 0,
      },
      then: [
        {
          grantFreeOperation: {
            seat: 'arvn',
            sequence: { batch: 'lam-son-719-arvn', step: 0 },
            viabilityPolicy: 'requireUsableAtIssue',
            completionPolicy: 'required',
            outcomePolicy: 'mustChangeGameplayState',
            postResolutionTurnFlow: 'resumeCardFlow',
            operationClass: 'limitedOperation',
            moveZoneBindings: ['$targetSpaces', '$targetLoCs'],
            executionContext: {
              selectedSpace: { _t: 2, ref: 'binding', name: '$lamSon719LaosSpace' },
            },
            zoneFilter: {
              op: '==',
              left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'id' },
              right: { _t: 2, ref: 'grantContext', key: 'selectedSpace' },
            },
          },
        },
      ],
    }));

    assert.deepEqual(card?.shaded?.effects, tagEffectAsts([
      {
        addVar: {
          scope: 'global',
          var: 'nvaResources',
          delta: {
            _t: 6,
            op: '+',
            left: 6,
            right: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInMapSpaces',
                  spaceFilter: {
                    condition: {
                      op: '==',
                      left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'country' },
                      right: 'laos',
                    },
                  },
                  filter: {
                    prop: 'faction',
                    op: 'eq',
                    value: 'ARVN',
                  },
                },
              },
            },
          },
        },
      },
    ]));
  });

  it('unshaded places ARVN troops in the chosen Laos space, immediately hands ARVN the required Laos-scoped LimOp, and clears the window after a legal resolution', () => {
    const setup = setupCardDrivenState(
      DEF,
      74001,
      2,
      'arvn',
      'nva',
      {
        'available-ARVN:none': [
          makeToken('lam-74-avail-1', 'troops', 'ARVN'),
          makeToken('lam-74-avail-2', 'troops', 'ARVN'),
          makeToken('lam-74-avail-3', 'troops', 'ARVN'),
          makeToken('lam-74-avail-4', 'troops', 'ARVN'),
          makeToken('lam-74-avail-5', 'troops', 'ARVN'),
          makeToken('lam-74-avail-6', 'troops', 'ARVN'),
          makeToken('lam-74-avail-7', 'troops', 'ARVN'),
        ],
        [CENTRAL_LAOS]: [makeToken('lam-74-central-vc', 'guerrilla', 'VC', { activity: 'active' })],
        [HUE]: [
          makeToken('lam-74-hue-arvn', 'troops', 'ARVN'),
          makeToken('lam-74-hue-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      { trail: 3, arvnResources: 0 },
    );

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (request) => request.name === '$lamSon719LaosSpace', value: CENTRAL_LAOS },
      {
        when: (request) => request.name === '$lamSon719ArvnTroops',
        value: ['lam-74-avail-1', 'lam-74-avail-2', 'lam-74-avail-3', 'lam-74-avail-4'],
      },
    ];
    const resolvedEventMove = normalizeDecisionParamsForMove(DEF, setup, buildCardMove(DEF, 'unshaded'), { overrides });
    const afterEvent = applyMove(DEF, setup, resolvedEventMove, { advanceToDecisionPoint: false }).state;

    assert.equal(afterEvent.globalVars.trail, 1, 'Unshaded should degrade Trail by 2');
    assert.equal(
      countTokens(afterEvent, CENTRAL_LAOS, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      4,
    );
    assert.equal(
      countTokens(afterEvent, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      3,
    );

    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 1, 'Expected one ARVN LimOp grant');
    assert.equal(pending[0]?.seat, 'arvn');
    assert.equal(pending[0]?.completionPolicy, 'required');
    assert.equal(pending[0]?.outcomePolicy, 'mustChangeGameplayState');
    assert.equal(pending[0]?.postResolutionTurnFlow, 'resumeCardFlow');
    assert.equal(pending[0]?.operationClass, 'limitedOperation');
    assert.deepEqual(pending[0]?.moveZoneBindings, ['$targetSpaces', '$targetLoCs']);
    assert.deepEqual(pending[0]?.executionContext, { selectedSpace: CENTRAL_LAOS });
    assert.equal(afterEvent.activePlayer, asPlayerId(1), 'Required grant should hand control to ARVN immediately');

    const forcedMoves = legalMoves(DEF, afterEvent);
    assert.equal(
      forcedMoves.some((move) => move.freeOperation !== true),
      false,
      'Required grant window should suppress ordinary moves until the LimOp resolves',
    );
    const grantedMove = forcedMoves.find((move) => move.freeOperation === true);
    assert.notEqual(grantedMove, undefined, 'Expected at least one required ARVN LimOp surface');
    const resolvedGrantMove = normalizeDecisionParamsForMove(DEF, afterEvent, {
      ...grantedMove!,
      actionClass: 'limitedOperation',
    });
    const final = applyMove(DEF, afterEvent, resolvedGrantMove, { advanceToDecisionPoint: false }).state;

    assert.equal(final.globalVars.arvnResources, 0, 'The granted LimOp should cost no ARVN Resources');
    const finalRuntime = requireCardDrivenRuntime(final);
    assert.deepEqual(finalRuntime.pendingFreeOperationGrants ?? [], []);
  });

  it('unshaded still grants the Laos-scoped LimOp when no troops are available but ARVN already has pieces in the selected Laos space', () => {
    const setup = setupCardDrivenState(
      DEF,
      74002,
      2,
      'arvn',
      'nva',
      {
        [SOUTHERN_LAOS]: [
          makeToken('lam-74-existing-arvn-1', 'troops', 'ARVN'),
          makeToken('lam-74-existing-arvn-2', 'troops', 'ARVN'),
          makeToken('lam-74-existing-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      { trail: 2, arvnResources: 0 },
    );

    const resolvedEventMove = normalizeDecisionParamsForMove(DEF, setup, buildCardMove(DEF, 'unshaded'), {
      overrides: [{ when: (request) => request.name === '$lamSon719LaosSpace', value: SOUTHERN_LAOS }],
    });
    const afterEvent = applyMove(DEF, setup, resolvedEventMove, { advanceToDecisionPoint: false }).state;

    assert.equal(afterEvent.globalVars.trail, 0, 'Trail degradation should still resolve even with zero available troops');
    assert.equal(
      countTokens(afterEvent, SOUTHERN_LAOS, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'No new troops should appear when none are available',
    );
    assert.equal(
      (requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? []).length,
      1,
      'Existing ARVN presence in Laos should keep the required LimOp usable',
    );
    assert.equal(afterEvent.activePlayer, asPlayerId(1), 'The usable required LimOp should still hand control to ARVN immediately');
  });

  it('unshaded degrades Trail but suppresses the grant cleanly when ARVN cannot execute any operation in the selected Laos space', () => {
    const setup = setupCardDrivenState(
      DEF,
      74003,
      2,
      'arvn',
      'nva',
      {
        [CENTRAL_LAOS]: [makeToken('lam-74-no-op-vc', 'guerrilla', 'VC', { activity: 'active' })],
        [HUE]: [
          makeToken('lam-74-hue-arvn-outside', 'troops', 'ARVN'),
          makeToken('lam-74-hue-vc-outside', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      { trail: 4 },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(DEF, setup, buildCardMove(DEF, 'unshaded'), {
      overrides: [{ when: (request) => request.name === '$lamSon719LaosSpace', value: CENTRAL_LAOS }],
    }).state;

    assert.equal(afterEvent.globalVars.trail, 2);
    assert.equal(
      (requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? []).length,
      0,
      'The grant should be skipped rather than leaked when no ARVN LimOp is usable in Laos',
    );
  });

  it('shaded adds 6 NVA Resources plus one per ARVN piece in Laos only', () => {
    const setup = setupCardDrivenState(
      DEF,
      74004,
      2,
      'nva',
      'arvn',
      {
        [CENTRAL_LAOS]: [
          makeToken('lam-74-laos-troop', 'troops', 'ARVN'),
          makeToken('lam-74-laos-police', 'police', 'ARVN'),
        ],
        [SOUTHERN_LAOS]: [
          makeToken('lam-74-laos-ranger', 'ranger', 'ARVN'),
          makeToken('lam-74-laos-base', 'base', 'ARVN'),
        ],
        [PARROTS_BEAK]: [makeToken('lam-74-cambodia-arvn', 'troops', 'ARVN')],
        [HUE]: [makeToken('lam-74-vietnam-arvn', 'police', 'ARVN')],
      },
      { nvaResources: 5 },
    );

    const final = applyMoveWithResolvedDecisionIds(DEF, setup, buildCardMove(DEF, 'shaded')).state;
    assert.equal(final.globalVars.nvaResources, 15, 'Shaded should count only the 4 ARVN pieces in Laos');
  });
});
