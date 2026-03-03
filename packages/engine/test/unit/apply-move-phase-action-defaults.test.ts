import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  asZoneId,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type PhaseDef,
  type VariableDef,
} from '../../src/kernel/index.js';

const counterVar: VariableDef = { name: 'counter', type: 'int', init: 0, min: 0, max: 100 };
const afterVar: VariableDef = { name: 'afterCounter', type: 'int', init: 0, min: 0, max: 100 };
const triggerVar: VariableDef = { name: 'triggerFired', type: 'int', init: 0, min: 0, max: 100 };

const incrementCounter: EffectAST = { addVar: { scope: 'global', var: 'counter', delta: 1 } };
const incrementAfterCounter: EffectAST = { addVar: { scope: 'global', var: 'afterCounter', delta: 1 } };

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  phases?: readonly PhaseDef[];
  globalVars?: readonly VariableDef[];
  triggers?: GameDef['triggers'];
}): GameDef =>
  ({
    metadata: { id: 'apply-move-action-defaults-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: overrides?.globalVars ?? [counterVar, afterVar, triggerVar],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: overrides?.phases ?? [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    triggers: overrides?.triggers ?? [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: { counter: 0, afterCounter: 0, triggerFired: 0 },
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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const simpleAction: ActionDef = {
  id: asActionId('doThing'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [incrementCounter],
  limits: [],
};

describe('apply-move phase actionDefaults.afterEffects', () => {
  it('afterEffects execute after action effects', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [incrementAfterCounter] },
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars.counter, 1, 'action effect should increment counter');
    assert.equal(result.state.globalVars.afterCounter, 1, 'afterEffects should increment afterCounter');
  });

  it('afterEffects see state changes from action effects', () => {
    const condAfterEffect: EffectAST = {
      if: {
        when: { op: '>=', left: { ref: 'gvar', var: 'counter' }, right: 1 },
        then: [incrementAfterCounter],
      },
    };
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [condAfterEffect] },
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars.counter, 1, 'action effect should run');
    assert.equal(result.state.globalVars.afterCounter, 1, 'afterEffects should see counter >= 1');
  });

  it('triggers fire AFTER afterEffects complete', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [incrementAfterCounter] },
      }],
      triggers: [{
        id: asTriggerId('checkAfter'),
        event: { type: 'actionResolved', action: asActionId('doThing') },
        effects: [{ addVar: { scope: 'global', var: 'triggerFired', delta: 1 } }],
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars.afterCounter, 1, 'afterEffects should run');
    assert.equal(result.state.globalVars.triggerFired, 1, 'trigger should fire after afterEffects');
  });

  it('afterEffects of originating phase run even if action effects cause phase transition', () => {
    const phaseTransitionAction: ActionDef = {
      id: asActionId('doThing'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        incrementCounter,
        { gotoPhaseExact: { phase: asPhaseId('other') } },
      ],
      limits: [],
    };
    const def = makeBaseDef({
      actions: [phaseTransitionAction],
      phases: [
        {
          id: asPhaseId('main'),
          actionDefaults: { afterEffects: [incrementAfterCounter] },
        },
        { id: asPhaseId('other') },
      ],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move, { advanceToDecisionPoint: false });
    assert.equal(result.state.globalVars.counter, 1, 'action effects should increment counter');
    assert.equal(result.state.globalVars.afterCounter, 1, 'afterEffects of originating (main) phase should still run');
    assert.equal(result.state.currentPhase, asPhaseId('other'), 'phase should have transitioned');
  });

  it('phase with no actionDefaults → behavior unchanged', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{ id: asPhaseId('main') }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars.counter, 1, 'action effect should increment counter');
    assert.equal(result.state.globalVars.afterCounter, 0, 'no afterEffects → afterCounter unchanged');
  });

  it('determinism: same seed + moves = same result', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [incrementAfterCounter] },
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result1 = applyMove(def, state, move);
    const result2 = applyMove(def, state, move);
    assert.deepEqual(result1.state.globalVars, result2.state.globalVars, 'results must be identical');
    assert.deepEqual(result1.state.rng, result2.state.rng, 'RNG state must be identical');
  });

  it('afterEffects trace entries use phaseAfterEffect eventContext', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [incrementAfterCounter] },
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move, { trace: true });
    const trace = result.effectTrace ?? [];
    const afterEntries = trace.filter(
      (entry) => entry.provenance.eventContext === 'phaseAfterEffect',
    );
    assert.ok(afterEntries.length > 0, 'should have at least one phaseAfterEffect trace entry');
    for (const entry of afterEntries) {
      assert.equal(entry.provenance.actionId, 'doThing', 'actionId should match');
      assert.ok(
        entry.provenance.effectPath.includes('afterEffects'),
        'effectPath should contain afterEffects',
      );
    }
  });

  it('action effects use actionEffect eventContext distinct from afterEffects', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{
        id: asPhaseId('main'),
        actionDefaults: { afterEffects: [incrementAfterCounter] },
      }],
    });
    const state = makeBaseState();
    const move: Move = { actionId: asActionId('doThing'), params: {} };
    const result = applyMove(def, state, move, { trace: true });
    const trace = result.effectTrace ?? [];
    const actionEntries = trace.filter(
      (entry) => entry.provenance.eventContext === 'actionEffect',
    );
    const afterEntries = trace.filter(
      (entry) => entry.provenance.eventContext === 'phaseAfterEffect',
    );
    assert.ok(actionEntries.length > 0, 'should have actionEffect trace entries');
    assert.ok(afterEntries.length > 0, 'should have phaseAfterEffect trace entries');
    assert.notEqual(
      actionEntries[0]?.provenance.eventContext,
      afterEntries[0]?.provenance.eventContext,
      'action effects and afterEffects should have distinct eventContext values',
    );
  });
});
