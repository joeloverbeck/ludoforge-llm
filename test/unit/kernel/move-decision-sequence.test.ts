import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  isMoveDecisionSequenceSatisfiable,
  resolveMoveDecisionSequence,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'move-decision-sequence-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
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

const makeMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

describe('move decision sequence helpers', () => {
  it('completes a satisfiable chooseOne decision sequence using default chooser', () => {
    const action: ActionDef = {
      id: asActionId('choose-one-op'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'choose-one-profile',
      actionId: asActionId('choose-one-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('choose-one-op'));
    assert.equal(result.complete, true);
    assert.equal(result.move.params['decision:$target'], 'a');
  });

  it('returns incomplete for unsatisfiable chooseN', () => {
    const action: ActionDef = {
      id: asActionId('unsat-op'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsat-profile',
      actionId: asActionId('unsat-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseN: {
                internalDecisionId: 'decision:$targets',
                bind: '$targets',
                options: { query: 'enums', values: [] },
                min: 1,
                max: 1,
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('unsat-op'));
    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.name, '$targets');
    assert.equal(result.nextDecision?.type, 'chooseN');
    assert.equal((result.nextDecision?.options ?? []).length, 0);
    assert.equal(result.nextDecision?.min, 1);
    assert.equal(isMoveDecisionSequenceSatisfiable(def, makeBaseState(), makeMove('unsat-op')), false);
  });

  it('respects custom chooser for decision sequence completion', () => {
    const action: ActionDef = {
      id: asActionId('custom-choose-op'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'custom-choose-profile',
      actionId: asActionId('custom-choose-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b', 'c'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('custom-choose-op'), {
      choose: (request) => request.options?.[2],
    });
    assert.equal(result.complete, true);
    assert.equal(result.move.params['decision:$target'], 'c');
  });

  it('throws for malformed decision-path expressions instead of treating them as unsatisfiable', () => {
    const action: ActionDef = {
      id: asActionId('broken-decision-op'),
      actor: 'active',
      phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'broken-decision-profile',
      actionId: asActionId('broken-decision-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              if: {
                when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();
    const move = makeMove('broken-decision-op');

    assert.throws(() => isMoveDecisionSequenceSatisfiable(def, state, move));
  });
});
