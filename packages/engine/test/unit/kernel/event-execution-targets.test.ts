import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  executeEventMove,
  resolveEventEligibilityOverrides,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  resolveEventEffectList,
  resolveEventFreeOperationGrants,
  resolveEventTargetDefs,
  shouldDeferIncompleteDecisionValidationForMove,
  synthesizeEventTargetEffects,
  type EventCardDef,
  type EventTargetDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const makeBaseDef = (card: EventCardDef): GameDef =>
  ({
    metadata: { id: 'event-target-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [card],
      },
    ],
  }) as unknown as GameDef;

const makeBaseState = (cardId: string): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  markers: {},
  playerCount: 2,
  zones: {
    'draw:none': [],
    'discard:none': [{ id: asTokenId(cardId), type: 'card', props: {} }],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
});

const withActions = (def: GameDef, actions: readonly unknown[]): GameDef =>
  ({ ...def, actions: [...actions] }) as unknown as GameDef;

const withCardDrivenState = (state: GameState): GameState =>
  ({
    ...state,
    turnOrderState: { type: 'cardDriven' },
  }) as unknown as GameState;

describe('event target synthesis', () => {
  it('maps exact n=1 to chooseOne', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$targetCity',
        selector: { query: 'enums', values: ['saigon:none', 'hue:none'] },
        cardinality: { n: 1 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 1);
    assert.ok('chooseOne' in effects[0]!);
    if (!('chooseOne' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseOne.bind, '$targetCity');
    assert.deepEqual(effects[0].chooseOne.options, { query: 'enums', values: ['saigon:none', 'hue:none'] });
  });

  it('maps exact n>1 to chooseN with exact n', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$targets',
        selector: { query: 'enums', values: ['a', 'b', 'c'] },
        cardinality: { n: 2 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 1);
    assert.ok('chooseN' in effects[0]!);
    if (!('chooseN' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseN.bind, '$targets');
    assert.equal(effects[0].chooseN.n, 2);
  });

  it('maps range min/max to choice effects, using chooseOne for max=1', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$optionalSingle',
        selector: { query: 'enums', values: ['x'] },
        cardinality: { max: 1 },
      },
      {
        id: '$range',
        selector: { query: 'enums', values: ['x', 'y', 'z'] },
        cardinality: { min: 1, max: 2 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 2);

    assert.ok('chooseOne' in effects[0]!);
    if (!('chooseOne' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseOne.bind, '$optionalSingle');

    assert.ok('chooseN' in effects[1]!);
    if (!('chooseN' in effects[1]!)) {
      return;
    }
    assert.equal(effects[1].chooseN.bind, '$range');
    assert.equal(effects[1].chooseN.min, 1);
    assert.equal(effects[1].chooseN.max, 2);
  });

  it('returns an empty list when no targets are provided', () => {
    assert.deepEqual(synthesizeEventTargetEffects([]), []);
  });
});

describe('event target resolution and effect ordering', () => {
  it('collects side targets before branch targets', () => {
    const side: NonNullable<EventCardDef['unshaded']> = {
      targets: [
        { id: '$sideA', selector: { query: 'enums', values: ['a'] }, cardinality: { n: 1 } },
        { id: '$sideB', selector: { query: 'enums', values: ['b'] }, cardinality: { n: 1 } },
      ],
      effects: [],
      branches: [
        {
          id: 'branch',
          targets: [{ id: '$branchA', selector: { query: 'enums', values: ['c'] }, cardinality: { n: 1 } }],
        },
      ],
    };

    const branch = side.branches?.[0] ?? null;
    const ids = resolveEventTargetDefs(side, branch).map((target) => target.id);
    assert.deepEqual(ids, ['$sideA', '$sideB', '$branchA']);
  });

  it('prepends synthetic target effects before side and branch effects', () => {
    const card: EventCardDef = {
      id: 'card-1',
      title: 'Targeted event',
      sideMode: 'single',
      unshaded: {
        targets: [{ id: '$sideTarget', selector: { query: 'enums', values: ['saigon:none'] }, cardinality: { n: 1 } }],
        effects: [{ addVar: { scope: 'global', var: 'sideCounter', delta: 1 } }],
        branches: [
          {
            id: 'branch-a',
            targets: [{ id: '$branchTarget', selector: { query: 'enums', values: ['hue:none'] }, cardinality: { max: 1 } }],
            effects: [{ addVar: { scope: 'global', var: 'branchCounter', delta: 1 } }],
          },
        ],
      },
    };

    const def = makeBaseDef(card);
    const state = makeBaseState(card.id);
    const move: Move = {
      actionId: 'event' as Move['actionId'],
      params: {
        eventCardId: card.id,
        side: 'unshaded',
        branch: 'branch-a',
      },
    };

    const effects = resolveEventEffectList(def, state, move);
    assert.deepEqual(
      effects.map((effect) => Object.keys(effect)[0]),
      ['chooseOne', 'chooseOne', 'addVar', 'addVar'],
    );

    assert.ok('chooseOne' in effects[0]!);
    assert.ok('chooseOne' in effects[1]!);
    if (!('chooseOne' in effects[0]!) || !('chooseOne' in effects[1]!)) {
      return;
    }

    assert.equal(effects[0].chooseOne.bind, '$sideTarget');
    assert.equal(effects[1].chooseOne.bind, '$branchTarget');
  });
});

describe('event playability context parity', () => {
  const eventCard: EventCardDef = {
    id: 'event-card',
    title: 'Event',
    sideMode: 'single',
    playCondition: {
      op: '>=',
      left: { ref: 'gvar', var: 'canPlay' },
      right: 1,
    },
    unshaded: {
      effectTiming: 'afterGrants',
      effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 1 } }],
      freeOperationGrants: [{ seat: '0', sequence: { chain: 'seq', step: 0 }, operationClass: 'operation', actionIds: ['operation'] }],
      eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'window-a' }],
    },
  };

  const eventAction = {
    id: 'event',
    capabilities: ['cardEvent'],
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };

  const nonEventAction = {
    ...eventAction,
    capabilities: [],
  };

  const move: Move = {
    actionId: 'event' as Move['actionId'],
    params: {},
  };

  it('returns no grants/overrides, no deferred leniency, and no event execution for non-card-event moves', () => {
    const def = withActions(makeBaseDef(eventCard), [nonEventAction]);
    const state = withCardDrivenState({
      ...makeBaseState(eventCard.id),
      globalVars: { canPlay: 1, resolved: 0 },
    });

    assert.deepEqual(resolveEventFreeOperationGrants(def, state, move), []);
    assert.deepEqual(resolveEventEligibilityOverrides(def, state, move), []);
    assert.equal(shouldDeferIncompleteDecisionValidationForMove(def, state, move), false);

    const result = executeEventMove(def, state, { state: state.rng }, move);
    assert.equal(result.state, state);
    assert.equal(result.rng.state, state.rng);
    assert.deepEqual(result.emittedEvents, []);
    assert.equal(result.deferredEventEffect, undefined);
  });

  it('returns no grants/overrides, no deferred leniency, and no event execution when playCondition is false', () => {
    const def = withActions(
      {
        ...makeBaseDef(eventCard),
        globalVars: [{ name: 'canPlay', type: 'int', init: 0, min: 0, max: 1 }, { name: 'resolved', type: 'int', init: 0, min: 0, max: 10 }],
      } as unknown as GameDef,
      [eventAction],
    );
    const state = withCardDrivenState({
      ...makeBaseState(eventCard.id),
      globalVars: { canPlay: 0, resolved: 0 },
    });

    assert.deepEqual(resolveEventFreeOperationGrants(def, state, move), []);
    assert.deepEqual(resolveEventEligibilityOverrides(def, state, move), []);
    assert.equal(shouldDeferIncompleteDecisionValidationForMove(def, state, move), false);

    const result = executeEventMove(def, state, { state: state.rng }, move);
    assert.equal(result.state, state);
    assert.equal(result.rng.state, state.rng);
    assert.deepEqual(result.emittedEvents, []);
    assert.equal(result.deferredEventEffect, undefined);
  });

  it('returns grants/overrides and enables deferred leniency for playable afterGrants event moves', () => {
    const def = withActions(
      {
        ...makeBaseDef(eventCard),
        globalVars: [{ name: 'canPlay', type: 'int', init: 1, min: 0, max: 1 }, { name: 'resolved', type: 'int', init: 0, min: 0, max: 10 }],
      } as unknown as GameDef,
      [eventAction],
    );
    const state = withCardDrivenState({
      ...makeBaseState(eventCard.id),
      globalVars: { canPlay: 1, resolved: 0 },
    });

    const grants = resolveEventFreeOperationGrants(def, state, move);
    const overrides = resolveEventEligibilityOverrides(def, state, move);
    assert.equal(grants.length, 1);
    assert.equal(overrides.length, 1);
    assert.equal(shouldDeferIncompleteDecisionValidationForMove(def, state, move), true);

    const result = executeEventMove(def, state, { state: state.rng }, move);
    assert.equal(result.state.globalVars.resolved, 0);
    assert.equal(result.deferredEventEffect?.effects.length, 1);
    assert.equal(result.deferredEventEffect?.actionId, 'event');
  });
});
