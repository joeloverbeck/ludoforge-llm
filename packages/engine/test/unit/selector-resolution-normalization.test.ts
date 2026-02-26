import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, buildAdjacencyGraph, createCollector } from '../../src/kernel/index.js';
import { effectRuntimeError, isEffectErrorCode } from '../../src/kernel/effect-error.js';
import { isEvalErrorCode, missingBindingError } from '../../src/kernel/eval-error.js';
import {
  normalizeSelectorResolutionError,
  resolveZoneWithNormalization,
  selectorResolutionFailurePolicyForMode,
} from '../../src/kernel/selector-resolution-normalization.js';
import type { EvalContext } from '../../src/kernel/eval-context.js';
import type { GameDef, GameState } from '../../src/kernel/types.js';

const makeEvalCtx = (): EvalContext => {
  const def: GameDef = {
    metadata: { id: 'selector-resolution-normalization-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: 'zone-a:none' as never, owner: 'none', visibility: 'public', ordering: 'stack' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
  const state: GameState = {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: { 'zone-a:none': [] },
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

  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    collector: createCollector(),
  };
};

describe('selector-resolution-normalization', () => {
  it('rethrows existing EffectRuntimeError unchanged', () => {
    const original = effectRuntimeError('variableRuntimeValidationFailed', 'already normalized', {
      effectType: 'setVar',
      scope: 'pvar',
      selector: { chosen: '$actor' },
    });

    assert.throws(
      () =>
        normalizeSelectorResolutionError(original, {
          code: 'variableRuntimeValidationFailed',
          effectType: 'setVar',
          message: 'should not wrap',
          scope: 'pvar',
          payloadField: 'selector',
          payload: { chosen: '$ignored' },
        }),
      (error: unknown) => error === original,
    );
  });

  it('normalizes eval errors with canonical context fields', () => {
    const evalError = missingBindingError('Missing binding: $who', { binding: '$who' });

    assert.throws(
      () =>
        normalizeSelectorResolutionError(evalError, {
          code: 'variableRuntimeValidationFailed',
          effectType: 'setVar',
          message: 'selector resolution failed',
          scope: 'pvar',
          payloadField: 'selector',
          payload: { chosen: '$who' },
          context: { endpoint: 'setVar.player' },
        }),
      (error: unknown) => {
        if (!isEffectErrorCode(error, 'EFFECT_RUNTIME')) {
          return false;
        }

        assert.equal(error.context?.reason, 'variableRuntimeValidationFailed');
        assert.equal(error.context?.effectType, 'setVar');
        assert.equal(error.context?.scope, 'pvar');
        assert.deepEqual(error.context?.selector, { chosen: '$who' });
        assert.equal(error.context?.sourceErrorCode, 'MISSING_BINDING');
        assert.equal(error.context?.endpoint, 'setVar.player');
        assert.equal(error.context?.errorName, 'EvalError');
        assert.equal(error.context?.errorMessage, 'Missing binding: $who');
        return true;
      },
    );
  });

  it('normalizes non-Error throwables into deterministic context', () => {
    assert.throws(
      () =>
        normalizeSelectorResolutionError('unexpected throw', {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          message: 'zone resolution failed',
          scope: 'zoneVar',
          payloadField: 'zone',
          payload: { zoneExpr: { ref: 'binding', name: '$zone' } },
        }),
      (error: unknown) => {
        if (!isEffectErrorCode(error, 'EFFECT_RUNTIME')) {
          return false;
        }

        assert.equal(error.context?.reason, 'resourceRuntimeValidationFailed');
        assert.equal(error.context?.effectType, 'transferVar');
        assert.equal(error.context?.scope, 'zoneVar');
        assert.equal(error.context?.thrown, 'unexpected throw');
        assert.deepEqual(error.context?.zone, { zoneExpr: { ref: 'binding', name: '$zone' } });
        return true;
      },
    );
  });

  it('applies explicit failure policy (normalize vs passthrough) independent of context shape', () => {
    const evalCtx = makeEvalCtx();

    assert.throws(
      () =>
        resolveZoneWithNormalization({ zoneExpr: { ref: 'binding', name: '$missingZone' } }, evalCtx, {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          scope: 'zoneVar',
          resolutionFailureMessage: 'zone resolution failed',
          onResolutionFailure: 'passthrough',
        }),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );

    assert.throws(
      () =>
        resolveZoneWithNormalization({ zoneExpr: { ref: 'binding', name: '$missingZone' } }, evalCtx, {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          scope: 'zoneVar',
          resolutionFailureMessage: 'zone resolution failed',
          onResolutionFailure: 'normalize',
        }),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('zone resolution failed') &&
        String(error).includes('sourceErrorCode'),
    );
  });

  it('maps interpreter mode to a canonical selector-resolution failure policy', () => {
    assert.equal(selectorResolutionFailurePolicyForMode('execution'), 'normalize');
    assert.equal(selectorResolutionFailurePolicyForMode('discovery'), 'passthrough');
  });
});
