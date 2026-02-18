import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { completeMoveDecisionSequenceOrThrow, pickDeterministicDecisionValue } from '../helpers/move-decision-helpers.js';

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
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeMove = (): Move => ({ actionId: asActionId('op'), params: {} });

describe('move decision helpers', () => {
  it('returns undefined when deterministic chooser cannot select a value', () => {
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'decision:$target',
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
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        } as ActionDef['effects'][number],
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
      /Scripted move could not be completed for actionId=op: choice="\$target" options=0 min=0/,
    );
  });
});
