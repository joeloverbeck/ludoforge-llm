// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceChooseN,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  legalChoicesEvaluate,
  resolveMoveDecisionSequence,
  type ActionDef,
  type DecisionKey,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const makeBaseDef = (overrides?: Partial<GameDef>): GameDef =>
  ({
    metadata: { id: 'advance-choose-n-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    ...overrides,
  }) as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const makeMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

describe('advanceChooseN', () => {
  it('recomputes prioritized legality after add and remove without qualifierKey', () => {
    const action: ActionDef = {
      id: asActionId('prioritized-no-qualifier'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: {
              query: 'prioritized',
              tiers: [
                { query: 'enums', values: ['available-a'] },
                { query: 'enums', values: ['reserve-a'] },
              ],
            },
            min: 1,
            max: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const move = makeMove('prioritized-no-qualifier');

    const initial = legalChoicesEvaluate(def, state, move);
    assert.equal(initial.kind, 'pending');
    assert.equal(initial.type, 'chooseN');
    assert.deepEqual(initial.options, [
      { value: 'available-a', legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
    ]);

    const added = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      [],
      { type: 'add', value: 'available-a' },
    );

    assert.equal(added.done, false);
    if (added.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(added.pending.selected, ['available-a']);
    assert.equal(added.pending.canConfirm, true);
    assert.deepEqual(added.pending.options, [
      { value: 'available-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'legal', illegalReason: null, resolution: 'exact' },
    ]);

    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), ['available-a'], { type: 'add', value: 'available-a' }),
      /duplicate selection/,
    );
    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), [], { type: 'add', value: 'reserve-a' }),
      /not currently legal/,
    );

    const removed = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      ['available-a'],
      { type: 'remove', value: 'available-a' },
    );

    assert.equal(removed.done, false);
    if (removed.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(removed.pending.selected, []);
    assert.equal(removed.pending.canConfirm, false);
    assert.deepEqual(removed.pending.options, [
      { value: 'available-a', legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
    ]);
  });

  it('recomputes prioritized legality per qualifierKey independently', () => {
    const action: ActionDef = {
      id: asActionId('prioritized-with-qualifier'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: {
              query: 'prioritized',
              qualifierKey: 'pieceType',
              tiers: [
                { query: 'tokensInZone', zone: 'available:none' },
                { query: 'tokensInZone', zone: 'map:none' },
              ],
            },
            min: 1,
            max: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      zones: [
        { id: asZoneId('available:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: asZoneId('map:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'piece', props: { pieceType: 'string' } }],
    });
    const state = makeBaseState({
      zones: {
        'available:none': [
          { id: asTokenId('available-troop-1'), type: 'piece', props: { pieceType: 'troop' } },
          { id: asTokenId('available-police-1'), type: 'piece', props: { pieceType: 'police' } },
        ],
        'map:none': [
          { id: asTokenId('map-troop-1'), type: 'piece', props: { pieceType: 'troop' } },
          { id: asTokenId('map-base-1'), type: 'piece', props: { pieceType: 'base' } },
        ],
      },
    });
    const move = makeMove('prioritized-with-qualifier');

    const added = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      [],
      { type: 'add', value: asTokenId('available-troop-1') },
    );

    assert.equal(added.done, false);
    if (added.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(added.pending.selected, [asTokenId('available-troop-1')]);
    assert.equal(added.pending.canConfirm, true);
    assert.deepEqual(added.pending.options, [
      { value: asTokenId('available-troop-1'), legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: asTokenId('available-police-1'), legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: asTokenId('map-troop-1'), legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: asTokenId('map-base-1'), legality: 'legal', illegalReason: null, resolution: 'exact' },
    ]);
  });

  it('allows early confirm without unlocking lower tiers when min is already satisfied', () => {
    const action: ActionDef = {
      id: asActionId('prioritized-early-confirm'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: {
              query: 'prioritized',
              tiers: [
                { query: 'enums', values: ['available-a', 'available-b'] },
                { query: 'enums', values: ['reserve-a'] },
              ],
            },
            min: 1,
            max: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const move = makeMove('prioritized-early-confirm');

    const afterFirstAdd = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      [],
      { type: 'add', value: 'available-a' },
    );

    assert.equal(afterFirstAdd.done, false);
    if (afterFirstAdd.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(afterFirstAdd.pending.selected, ['available-a']);
    assert.equal(afterFirstAdd.pending.canConfirm, true);
    assert.deepEqual(afterFirstAdd.pending.options, [
      { value: 'available-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'available-b', legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
    ]);

    const confirmed = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      afterFirstAdd.pending.selected,
      { type: 'confirm' },
    );

    assert.deepEqual(confirmed, { done: true, value: ['available-a'] });
  });

  it('unlocks one tier at a time across three prioritized tiers', () => {
    const action: ActionDef = {
      id: asActionId('prioritized-three-tier'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: {
              query: 'prioritized',
              tiers: [
                { query: 'enums', values: ['available-a'] },
                { query: 'enums', values: ['map-a'] },
                { query: 'enums', values: ['reserve-a'] },
              ],
            },
            min: 1,
            max: 3,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const move = makeMove('prioritized-three-tier');

    const afterAvailable = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      [],
      { type: 'add', value: 'available-a' },
    );

    assert.equal(afterAvailable.done, false);
    if (afterAvailable.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(afterAvailable.pending.options, [
      { value: 'available-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'map-a', legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
    ]);

    const afterMap = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      afterAvailable.pending.selected,
      { type: 'add', value: 'map-a' },
    );

    assert.equal(afterMap.done, false);
    if (afterMap.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(afterMap.pending.options, [
      { value: 'available-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'map-a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'reserve-a', legality: 'legal', illegalReason: null, resolution: 'exact' },
    ]);
  });

  it('keeps non-prioritized chooseN options legal until max selections are reached', () => {
    const action: ActionDef = {
      id: asActionId('plain-choose-n'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            min: 1,
            max: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const move = makeMove('plain-choose-n');

    const afterFirstAdd = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      [],
      { type: 'add', value: 'b' },
    );

    assert.equal(afterFirstAdd.done, false);
    if (afterFirstAdd.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.deepEqual(afterFirstAdd.pending.options, [
      { value: 'a', legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: 'b', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'c', legality: 'legal', illegalReason: null, resolution: 'exact' },
    ]);

    const afterSecondAdd = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      ['b'],
      { type: 'add', value: 'a' },
    );

    assert.equal(afterSecondAdd.done, false);
    if (afterSecondAdd.done) {
      throw new Error('expected pending chooseN state');
    }
    assert.equal(afterSecondAdd.pending.canConfirm, true);
    assert.deepEqual(afterSecondAdd.pending.options, [
      { value: 'a', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'b', legality: 'illegal', illegalReason: null, resolution: 'exact' },
      { value: 'c', legality: 'illegal', illegalReason: null, resolution: 'exact' },
    ]);
    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), ['b', 'a'], { type: 'add', value: 'c' }),
      /not currently legal/,
    );
  });

  it('enforces remove and confirm cardinality validation', () => {
    const action: ActionDef = {
      id: asActionId('confirmable-choose-n'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            min: 1,
            max: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const move = makeMove('confirmable-choose-n');

    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), [], { type: 'remove', value: 'a' }),
      /not selected/,
    );
    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), [], { type: 'confirm' }),
      /cannot be confirmed/,
    );

    const confirmed = advanceChooseN(
      def,
      state,
      move,
      asDecisionKey('$targets'),
      ['a'],
      { type: 'confirm' },
    );
    assert.deepEqual(confirmed, { done: true, value: ['a'] });

    assert.throws(
      () => advanceChooseN(def, state, move, asDecisionKey('$targets'), ['a', 'b', 'c'], { type: 'confirm' }),
      /cardinality mismatch/,
    );
  });

  it('preserves the full-array choose callback fast path in resolveMoveDecisionSequence', () => {
    const action: ActionDef = {
      id: asActionId('ai-fast-path-choose-n'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['a', 'b', 'c'] },
            n: 2,
          },
        }),
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const result = resolveMoveDecisionSequence(
      def,
      makeBaseState(),
      makeMove('ai-fast-path-choose-n'),
      {
        choose: (request) => {
          assert.equal(request.type, 'chooseN');
          return ['b', 'c'];
        },
      },
    );

    assert.equal(result.complete, true);
    assert.deepEqual(result.move.params, { '$targets': ['b', 'c'] });
  });
});
