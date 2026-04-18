// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type ChoicePendingRequest,
  type DecisionKey,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { completeMoveDecisionSequenceOrThrow, pickDeterministicDecisionValue } from '../helpers/move-decision-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const makeDef = (action: ActionDef): GameDef =>
  ({
    metadata: { id: 'move-decision-helper-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [action],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
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
});

const makeMove = (): Move => ({ actionId: asActionId('op'), params: {} });

describe('move decision helpers', () => {
  it('returns undefined when deterministic chooser cannot select a value', () => {
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('$target'),
      name: '$target',
      type: 'chooseOne',
      options: [],
      targetKinds: [],
    };

    assert.equal(pickDeterministicDecisionValue(request), undefined);
  });

  it('throws actionable diagnostics when a move decision sequence remains incomplete', () => {
    const def = makeDef({
      id: asActionId('op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        }) as ActionDef['effects'][number],
      ],
      limits: [],
    });

    assert.throws(
      () =>
        completeMoveDecisionSequenceOrThrow(
          makeMove(),
          def,
          makeState(),
          (request) => pickDeterministicDecisionValue(request),
        ),
      /Scripted move could not be completed for actionId=op: illegal=emptyDomain/,
    );
  });

  it('completes stochastic branch-local decisions through the shared completion path', () => {
    const def = makeDef({
      id: asActionId('op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 2,
            in: [
              eff({
                if: {
                  when: { op: '==', left: { _t: 2, ref: 'binding', name: '$roll' }, right: 1 },
                  then: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$alpha',
                        bind: '$alpha',
                        options: { query: 'enums', values: ['alpha'] },
                      },
                    }) as ActionDef['effects'][number],
                  ],
                  else: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$beta',
                        bind: '$beta',
                        options: { query: 'enums', values: ['beta'] },
                      },
                    }) as ActionDef['effects'][number],
                  ],
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }) as ActionDef['effects'][number],
      ],
      limits: [],
    });

    const resolved = completeMoveDecisionSequenceOrThrow(
      makeMove(),
      def,
      makeState(),
      (request) => pickDeterministicDecisionValue(request),
    );

    assert.equal(typeof resolved.params.$roll, 'number');
    if (resolved.params.$roll === 1) {
      assert.equal(resolved.params['$alpha'], 'alpha');
      return;
    }
    assert.equal(resolved.params.$roll, 2);
    assert.equal(resolved.params['$beta'], 'beta');
  });
});
