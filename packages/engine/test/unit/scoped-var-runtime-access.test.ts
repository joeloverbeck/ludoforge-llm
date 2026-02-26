import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, buildAdjacencyGraph, createCollector, createRng, isEffectErrorCode } from '../../src/kernel/index.js';
import type { EffectContext } from '../../src/kernel/effect-context.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import {
  resolveSinglePlayerWithNormalization,
  resolveZoneWithNormalization,
} from '../../src/kernel/selector-resolution-normalization.js';
import {
  readScopedIntVarValue,
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveRuntimeScopedEndpointWithMalformedSupport,
  type ScopedVarMalformedResolvableEndpoint,
  type ScopedVarResolvableEndpoint,
  resolveScopedIntVarDef,
  resolveScopedVarDef,
  writeScopedVarToBranches,
} from '../../src/kernel/scoped-var-runtime-access.js';
import type { GameDef, GameState } from '../../src/kernel/types.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'scoped-var-runtime-access-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'flag', type: 'boolean', init: false },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'ready', type: 'boolean', init: false },
  ],
  zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 20 }],
  zones: [{ id: 'zone-a:none' as never, owner: 'none', visibility: 'public', ordering: 'stack' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 5, flag: true },
  perPlayerVars: {
    '0': { hp: 7, ready: false },
    '1': { hp: 3, ready: true },
  },
  zoneVars: { 'zone-a:none': { supply: 9 } },
  playerCount: 2,
  zones: {},
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

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(7n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

const assertScopedEndpointTypingContracts = () => {
  const strictPvarEndpoint: ScopedVarResolvableEndpoint = { scope: 'pvar', player: 'actor', var: 'hp' };
  const strictZoneEndpoint: ScopedVarResolvableEndpoint = { scope: 'zoneVar', zone: 'zone-a:none', var: 'supply' };
  const tolerantPvarEndpoint: ScopedVarMalformedResolvableEndpoint = { scope: 'pvar', var: 'hp' };
  const tolerantZoneEndpoint: ScopedVarMalformedResolvableEndpoint = { scope: 'zoneVar', var: 'supply' };

  // @ts-expect-error strict endpoint contract requires a player selector for pvar scope.
  const malformedStrictPvar: ScopedVarResolvableEndpoint = { scope: 'pvar', var: 'hp' };
  // @ts-expect-error strict endpoint contract requires a zone selector for zoneVar scope.
  const malformedStrictZone: ScopedVarResolvableEndpoint = { scope: 'zoneVar', var: 'supply' };

  void strictPvarEndpoint;
  void strictZoneEndpoint;
  void tolerantPvarEndpoint;
  void tolerantZoneEndpoint;
  void malformedStrictPvar;
  void malformedStrictZone;
};

assertScopedEndpointTypingContracts();

describe('scoped-var-runtime-access', () => {
  it('resolves scoped variable definitions across global/pvar/zoneVar', () => {
    const ctx = makeCtx();

    const globalDef = resolveScopedVarDef(ctx, { scope: 'global', var: 'score' }, 'setVar', 'variableRuntimeValidationFailed');
    const pvarDef = resolveScopedVarDef(ctx, { scope: 'pvar', var: 'ready' }, 'setVar', 'variableRuntimeValidationFailed');
    const zoneDef = resolveScopedVarDef(ctx, { scope: 'zoneVar', var: 'supply' }, 'setVar', 'variableRuntimeValidationFailed');

    assert.equal(globalDef.type, 'int');
    assert.equal(pvarDef.type, 'boolean');
    assert.equal(zoneDef.type, 'int');
  });

  it('enforces int-only contracts through resolveScopedIntVarDef', () => {
    const ctx = makeCtx();
    assert.throws(
      () => resolveScopedIntVarDef(ctx, { scope: 'global', var: 'flag' }, 'transferVar', 'resourceRuntimeValidationFailed'),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-int variable'),
    );
  });

  it('reads scoped runtime values across global/pvar/zone endpoints', () => {
    const ctx = makeCtx();

    const globalValue = readScopedVarValue(ctx, { scope: 'global', var: 'flag' }, 'setVar', 'variableRuntimeValidationFailed');
    const pvarValue = readScopedVarValue(
      ctx,
      { scope: 'pvar', player: asPlayerId(1), var: 'hp' },
      'setVar',
      'variableRuntimeValidationFailed',
    );
    const zoneValue = readScopedVarValue(
      ctx,
      { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
      'setVar',
      'variableRuntimeValidationFailed',
    );

    assert.equal(globalValue, true);
    assert.equal(pvarValue, 3);
    assert.equal(zoneValue, 9);
  });

  it('reads int-only scoped runtime values across global/pvar/zone endpoints', () => {
    const ctx = makeCtx();

    const globalValue = readScopedIntVarValue(ctx, { scope: 'global', var: 'score' }, 'addVar', 'variableRuntimeValidationFailed');
    const pvarValue = readScopedIntVarValue(
      ctx,
      { scope: 'pvar', player: asPlayerId(1), var: 'hp' },
      'addVar',
      'variableRuntimeValidationFailed',
    );
    const zoneValue = readScopedIntVarValue(
      ctx,
      { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
      'transferVar',
      'resourceRuntimeValidationFailed',
    );

    assert.equal(globalValue, 5);
    assert.equal(pvarValue, 3);
    assert.equal(zoneValue, 9);
  });

  it('throws canonical int-read runtime diagnostics for corrupted global/pvar/zone bool payloads', () => {
    const corruptedCtx = makeCtx({
      state: {
        ...makeState(),
        globalVars: { ...makeState().globalVars, score: true as unknown as number },
        perPlayerVars: {
          ...makeState().perPlayerVars,
          '0': { ...makeState().perPlayerVars['0'], hp: false as unknown as number },
        },
        zoneVars: {
          ...makeState().zoneVars,
          'zone-a:none': { supply: true as unknown as number },
        },
      },
    });

    assert.throws(
      () => readScopedIntVarValue(corruptedCtx, { scope: 'global', var: 'score' }, 'addVar', 'variableRuntimeValidationFailed'),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Global variable state must be a finite safe integer: score'),
    );

    assert.throws(
      () =>
        readScopedIntVarValue(
          corruptedCtx,
          { scope: 'pvar', player: asPlayerId(0), var: 'hp' },
          'transferVar',
          'resourceRuntimeValidationFailed',
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Per-player variable state must be a finite safe integer: hp'),
    );

    assert.throws(
      () =>
        readScopedIntVarValue(
          corruptedCtx,
          { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
          'transferVar',
          'resourceRuntimeValidationFailed',
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Zone variable state is missing: supply in zone zone-a:none'),
    );
  });

  it('throws canonical int-read runtime diagnostics for non-finite and non-integer numbers', () => {
    const baseState = makeState();
    const globalNanCtx = makeCtx({
      state: {
        ...baseState,
        globalVars: { ...baseState.globalVars, score: Number.NaN },
      },
    });

    assert.throws(
      () => readScopedIntVarValue(globalNanCtx, { scope: 'global', var: 'score' }, 'addVar', 'variableRuntimeValidationFailed'),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Global variable state must be a finite safe integer: score'),
    );

    const pvarFractionalCtx = makeCtx({
      state: {
        ...baseState,
        perPlayerVars: {
          ...baseState.perPlayerVars,
          '0': { ...baseState.perPlayerVars['0'], hp: 1.5 as unknown as number },
        },
      },
    });
    assert.throws(
      () =>
        readScopedIntVarValue(
          pvarFractionalCtx,
          { scope: 'pvar', player: asPlayerId(0), var: 'hp' },
          'addVar',
          'variableRuntimeValidationFailed',
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Per-player variable state must be a finite safe integer: hp'),
    );
  });

  it('writes scoped runtime values immutably for each scope', () => {
    const state = makeState();
    const baseBranches = {
      globalVars: state.globalVars,
      perPlayerVars: state.perPlayerVars,
      zoneVars: state.zoneVars,
    };

    const globalWrite = writeScopedVarToBranches(baseBranches, { scope: 'global', var: 'score' }, 8);
    assert.equal(globalWrite.globalVars.score, 8);
    assert.notEqual(globalWrite.globalVars, baseBranches.globalVars);
    assert.equal(globalWrite.perPlayerVars, baseBranches.perPlayerVars);
    assert.equal(globalWrite.zoneVars, baseBranches.zoneVars);

    const pvarWrite = writeScopedVarToBranches(baseBranches, { scope: 'pvar', player: asPlayerId(0), var: 'hp' }, 10);
    assert.equal(pvarWrite.perPlayerVars['0']?.hp, 10);
    assert.notEqual(pvarWrite.perPlayerVars, baseBranches.perPlayerVars);
    assert.equal(pvarWrite.globalVars, baseBranches.globalVars);
    assert.equal(pvarWrite.zoneVars, baseBranches.zoneVars);

    const zoneWrite = writeScopedVarToBranches(
      baseBranches,
      { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
      4,
    );
    assert.equal(zoneWrite.zoneVars['zone-a:none']?.supply, 4);
    assert.notEqual(zoneWrite.zoneVars, baseBranches.zoneVars);
    assert.equal(zoneWrite.globalVars, baseBranches.globalVars);
    assert.equal(zoneWrite.perPlayerVars, baseBranches.perPlayerVars);
  });

  it('normalizes selector resolution failures into effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        resolveSinglePlayerWithNormalization({ chosen: '$missingPlayer' }, ctx, {
          code: 'variableRuntimeValidationFailed',
          effectType: 'setVar',
          scope: 'pvar',
          cardinalityMessage: 'must resolve one player',
          resolutionFailureMessage: 'selector resolution failed',
        }),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('selector resolution failed') &&
        String(error).includes('sourceErrorCode'),
    );
  });

  it('normalizes zone resolution failures into effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        resolveZoneWithNormalization({ zoneExpr: { ref: 'binding', name: '$missingZone' } }, ctx, {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          scope: 'zoneVar',
          resolutionFailureMessage: 'zone endpoint resolution failed',
        }),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('zone endpoint resolution failed') &&
        String(error).includes('sourceErrorCode'),
    );
  });

  it('preserves raw eval errors for discovery-mode zone resolution failures', () => {
    const ctx = makeCtx({ mode: 'discovery' });

    assert.throws(
      () =>
        resolveZoneWithNormalization({ zoneExpr: { ref: 'binding', name: '$missingZone' } }, ctx, {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          scope: 'zoneVar',
          resolutionFailureMessage: 'zone endpoint resolution failed',
        }),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });

  it('resolves runtime scoped endpoints for global/pvar/zoneVar', () => {
    const ctx = makeCtx();

    const globalEndpoint = resolveRuntimeScopedEndpoint(
      { scope: 'global', var: 'score' },
      ctx,
      {
        code: 'variableRuntimeValidationFailed',
        effectType: 'setVar',
        pvarCardinalityMessage: 'must resolve one player',
        pvarResolutionFailureMessage: 'pvar resolution failed',
        zoneResolutionFailureMessage: 'zone resolution failed',
      },
    );
    const pvarEndpoint = resolveRuntimeScopedEndpoint(
      { scope: 'pvar', player: 'actor', var: 'hp' },
      ctx,
      {
        code: 'variableRuntimeValidationFailed',
        effectType: 'setVar',
        pvarCardinalityMessage: 'must resolve one player',
        pvarResolutionFailureMessage: 'pvar resolution failed',
        zoneResolutionFailureMessage: 'zone resolution failed',
      },
    );
    const zoneEndpoint = resolveRuntimeScopedEndpoint(
      { scope: 'zoneVar', zone: 'zone-a:none', var: 'supply' },
      ctx,
      {
        code: 'resourceRuntimeValidationFailed',
        effectType: 'transferVar',
        pvarCardinalityMessage: 'must resolve one player',
        pvarResolutionFailureMessage: 'pvar resolution failed',
        zoneResolutionFailureMessage: 'zone resolution failed',
      },
    );

    assert.deepEqual(globalEndpoint, { scope: 'global', var: 'score' });
    assert.deepEqual(pvarEndpoint, { scope: 'pvar', player: asPlayerId(0), var: 'hp' });
    assert.deepEqual(zoneEndpoint, { scope: 'zone', zone: 'zone-a:none', var: 'supply' });
  });

  it('keeps tolerant resolver parity for well-formed scoped endpoints', () => {
    const ctx = makeCtx();

    const endpoint = resolveRuntimeScopedEndpointWithMalformedSupport(
      { scope: 'pvar', player: 'actor', var: 'hp' },
      ctx,
      {
        code: 'resourceRuntimeValidationFailed',
        effectType: 'transferVar',
        pvarCardinalityMessage: 'must resolve one player',
        pvarResolutionFailureMessage: 'pvar resolution failed',
        zoneResolutionFailureMessage: 'zone resolution failed',
      },
    );

    assert.deepEqual(endpoint, { scope: 'pvar', player: asPlayerId(0), var: 'hp' });
  });

  it('throws on missing transferVar pvar/zone selectors through shared endpoint resolver', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        resolveRuntimeScopedEndpointWithMalformedSupport(
          { scope: 'pvar', var: 'hp' },
          ctx,
          {
            code: 'resourceRuntimeValidationFailed',
            effectType: 'transferVar',
            pvarCardinalityMessage: 'must resolve one player',
            pvarResolutionFailureMessage: 'pvar resolution failed',
            zoneResolutionFailureMessage: 'zone resolution failed',
            pvarMissingSelectorMessage: 'transferVar pvar endpoint requires player selector',
            zoneMissingSelectorMessage: 'transferVar zoneVar endpoint requires zone selector',
          },
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('transferVar pvar endpoint requires player selector'),
    );

    assert.throws(
      () =>
        resolveRuntimeScopedEndpointWithMalformedSupport(
          { scope: 'zoneVar', var: 'supply' },
          ctx,
          {
            code: 'resourceRuntimeValidationFailed',
            effectType: 'transferVar',
            pvarCardinalityMessage: 'must resolve one player',
            pvarResolutionFailureMessage: 'pvar resolution failed',
            zoneResolutionFailureMessage: 'zone resolution failed',
            pvarMissingSelectorMessage: 'transferVar pvar endpoint requires player selector',
            zoneMissingSelectorMessage: 'transferVar zoneVar endpoint requires zone selector',
          },
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('transferVar zoneVar endpoint requires zone selector'),
    );
  });
});
