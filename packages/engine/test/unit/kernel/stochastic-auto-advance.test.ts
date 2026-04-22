// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceAutoresolvable,
  applyDecision,
  asActionId,
  asPhaseId,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type GameDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const phaseId = asPhaseId('main');

const createDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'stochastic-auto-advance', players: { min: 2, max: 2 } },
  seats: [{ id: '0' }, { id: '1' }],
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: asActionId('roll'),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
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
                when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$roll' }, right: 1 },
                then: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
                else: [eff({ addVar: { scope: 'global', var: 'score', delta: 2 } })],
              },
            }) as ActionDef['effects'][number],
          ],
        },
      }) as ActionDef['effects'][number],
    ],
    limits: [],
  } satisfies ActionDef],
  triggers: [],
  terminal: { conditions: [] },
});

describe('stochastic auto advance', () => {
  it('resolves stochasticResolve contexts before the next player publication and preserves determinism for the same rng', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const start = initialState(def, 7, 2).state;
    const actionSelection = publishMicroturn(def, start, runtime);
    const afterAction = applyDecision(def, start, actionSelection.legalActions[0]!, undefined, runtime).state;

    const pending = publishMicroturn(def, afterAction, runtime);
    assert.equal(pending.kind, 'stochasticResolve');

    const left = advanceAutoresolvable(def, afterAction, createRng(91n), runtime);
    const right = advanceAutoresolvable(def, afterAction, createRng(91n), runtime);
    assert.deepEqual(left.state, right.state);
    assert.deepEqual(left.autoResolvedLogs, right.autoResolvedLogs);
    assert.equal(left.autoResolvedLogs.length, 1);
    assert.equal(left.autoResolvedLogs[0]?.decisionContextKind, 'stochasticResolve');

    const nextMicroturn = publishMicroturn(def, left.state, runtime);
    assert.notEqual(nextMicroturn.kind, 'stochasticResolve');
    assert.ok(left.state.globalVars.score === 1 || left.state.globalVars.score === 2);
  });
});
