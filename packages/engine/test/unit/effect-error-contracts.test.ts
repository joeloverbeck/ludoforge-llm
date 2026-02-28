import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  applyEffect,
  applyEffects,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  EFFECT_RUNTIME_REASONS,
  EffectBudgetExceededError,
  EffectRuntimeError,
  effectNotImplementedError,
  isEffectErrorCode,
  type EffectErrorContext,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

describe('effect error context contracts', () => {
  const baseDef: GameDef = {
    metadata: { id: 'effect-error-contracts', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  };

  const baseState: GameState = {
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
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };

  const makeContext = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
    def: baseDef,
    adjacencyGraph: buildAdjacencyGraph(baseDef.zones),
    state: baseState,
    rng: createRng(7n),
    activePlayer: baseState.activePlayer,
    actorPlayer: baseState.activePlayer,
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  ...overrides,
  });

  it('effectNotImplementedError emits typed EFFECT_NOT_IMPLEMENTED context', () => {
    const effect: EffectAST = { draw: { from: 'deck', to: 'hand', count: 1 } };
    const error = effectNotImplementedError('draw', { effect });

    assert.equal(error.code, 'EFFECT_NOT_IMPLEMENTED');
    const context: EffectErrorContext<'EFFECT_NOT_IMPLEMENTED'> = error.context!;
    assert.equal(context.effectType, 'draw');
    assert.deepEqual(context.effect, effect);
  });

  it('EffectBudgetExceededError emits typed EFFECT_BUDGET_EXCEEDED context', () => {
    const error = new EffectBudgetExceededError('budget exceeded', {
      effectType: 'moveToken',
      maxEffectOps: 500,
    });

    assert.ok(isEffectErrorCode(error, 'EFFECT_BUDGET_EXCEEDED'));
    assert.equal(error.code, 'EFFECT_BUDGET_EXCEEDED');
    const context: EffectErrorContext<'EFFECT_BUDGET_EXCEEDED'> = error.context!;
    assert.equal(context.effectType, 'moveToken');
    assert.equal(context.maxEffectOps, 500);
  });

  it('spatial destination errors expose typed contexts', () => {
    const requiredError = new EffectRuntimeError('SPATIAL_DESTINATION_REQUIRED', 'missing direction', {
      effectType: 'moveTokenAdjacent',
      availableBindings: ['$dest'],
      direction: '$dest',
    });
    assert.ok(isEffectErrorCode(requiredError, 'SPATIAL_DESTINATION_REQUIRED'));
    const requiredContext: EffectErrorContext<'SPATIAL_DESTINATION_REQUIRED'> = requiredError.context!;
    assert.equal(requiredContext.effectType, 'moveTokenAdjacent');
    assert.deepEqual(requiredContext.availableBindings, ['$dest']);
    assert.equal(requiredContext.direction, '$dest');

    const adjacentError = new EffectRuntimeError('SPATIAL_DESTINATION_NOT_ADJACENT', 'not adjacent', {
      effectType: 'moveTokenAdjacent',
      fromZoneId: 'a',
      toZoneId: 'b',
      adjacentZones: ['c'],
    });
    assert.ok(isEffectErrorCode(adjacentError, 'SPATIAL_DESTINATION_NOT_ADJACENT'));
    const adjacentContext: EffectErrorContext<'SPATIAL_DESTINATION_NOT_ADJACENT'> = adjacentError.context!;
    assert.equal(adjacentContext.fromZoneId, 'a');
    assert.equal(adjacentContext.toZoneId, 'b');
    assert.deepEqual(adjacentContext.adjacentZones, ['c']);
  });

  it('effectRuntimeError helper emits canonical reasons on runtime failures', () => {
    assert.throws(
      () => applyEffect({ setVar: { scope: 'global', var: 'x', value: 'bad' } }, makeContext()),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );

    assert.throws(
      () => applyEffect(
        { reveal: { zone: asZoneId('board:none'), to: 'all' } },
        makeContext({
          state: {
            ...baseState,
            zones: {},
          },
        }),
      ),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );

    assert.throws(
      () => applyEffect(
        { conceal: { zone: asZoneId('board:none') } },
        makeContext({
          state: {
            ...baseState,
            zones: {},
          },
        }),
      ),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );
  });

  it('effect entry invariant violations emit internalInvariantViolation with mode/ownership context', () => {
    const malformedContext = {
      ...makeContext(),
      mode: 'execution',
      decisionAuthority: {
        source: 'engineRuntime',
        player: asPlayerId(0),
        ownershipEnforcement: 'probe',
      },
    } as unknown as EffectContext;

    for (const invoke of [
      () => applyEffect({ bindValue: { bind: '$noop', value: 1 } }, malformedContext),
      () => applyEffects([{ bindValue: { bind: '$noop', value: 1 } }], malformedContext),
    ]) {
      assert.throws(invoke, (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION);
        assert.equal(error.context?.mode, 'execution');
        assert.equal(error.context?.ownershipEnforcement, 'probe');
        return true;
      });
    }
  });
});
