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
  type ScopedVarWrite,
  toScopedVarWrite,
  resolveScopedIntVarDef,
  resolveScopedVarDef,
  writeScopedVarToBranches,
  writeScopedVarsToState,
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

type AssertTrue<T extends true> = T;
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false)
    : false;
type IsOptionalKey<T, K extends keyof T> = Omit<T, K> extends T ? true : false;

const assertScopedEndpointTypingContracts = () => {
  type StrictGlobalEndpoint = Extract<ScopedVarResolvableEndpoint, { scope: 'global' }>;
  type StrictPvarEndpoint = Extract<ScopedVarResolvableEndpoint, { scope: 'pvar' }>;
  type StrictZoneEndpoint = Extract<ScopedVarResolvableEndpoint, { scope: 'zoneVar' }>;
  type TolerantGlobalEndpoint = Extract<ScopedVarMalformedResolvableEndpoint, { scope: 'global' }>;
  type TolerantPvarEndpoint = Extract<ScopedVarMalformedResolvableEndpoint, { scope: 'pvar' }>;
  type TolerantZoneEndpoint = Extract<ScopedVarMalformedResolvableEndpoint, { scope: 'zoneVar' }>;
  type StrictPvarSharedShape = Omit<StrictPvarEndpoint, 'player'>;
  type TolerantPvarSharedShape = Omit<TolerantPvarEndpoint, 'player'>;
  type StrictZoneSharedShape = Omit<StrictZoneEndpoint, 'zone'>;
  type TolerantZoneSharedShape = Omit<TolerantZoneEndpoint, 'zone'>;

  type GlobalShapeParity = AssertTrue<IsEqual<StrictGlobalEndpoint, TolerantGlobalEndpoint>>;
  type PvarSharedShapeParity = AssertTrue<IsEqual<StrictPvarSharedShape, TolerantPvarSharedShape>>;
  type ZoneSharedShapeParity = AssertTrue<IsEqual<StrictZoneSharedShape, TolerantZoneSharedShape>>;
  type StrictPvarSelectorRequired = AssertTrue<IsEqual<IsOptionalKey<StrictPvarEndpoint, 'player'>, false>>;
  type TolerantPvarSelectorOptional = AssertTrue<IsEqual<IsOptionalKey<TolerantPvarEndpoint, 'player'>, true>>;
  type StrictZoneSelectorRequired = AssertTrue<IsEqual<IsOptionalKey<StrictZoneEndpoint, 'zone'>, false>>;
  type TolerantZoneSelectorOptional = AssertTrue<IsEqual<IsOptionalKey<TolerantZoneEndpoint, 'zone'>, true>>;

  void (null as unknown as GlobalShapeParity);
  void (null as unknown as PvarSharedShapeParity);
  void (null as unknown as ZoneSharedShapeParity);
  void (null as unknown as StrictPvarSelectorRequired);
  void (null as unknown as TolerantPvarSelectorOptional);
  void (null as unknown as StrictZoneSelectorRequired);
  void (null as unknown as TolerantZoneSelectorOptional);

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

const assertScopedWriteTypingContracts = () => {
  const globalWrite: ScopedVarWrite = { endpoint: { scope: 'global', var: 'flag' }, value: true };
  const pvarWrite: ScopedVarWrite = {
    endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'ready' },
    value: false,
  };
  const zoneWrite: ScopedVarWrite = {
    endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
    value: 2,
  };

  // @ts-expect-error zone scoped writes require numeric values.
  const invalidZoneWrite: ScopedVarWrite = {
    endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
    value: false,
  };

  void globalWrite;
  void pvarWrite;
  void zoneWrite;
  void invalidZoneWrite;
};

assertScopedWriteTypingContracts();

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

    const globalWrite = writeScopedVarToBranches(baseBranches, {
      endpoint: { scope: 'global', var: 'score' },
      value: 8,
    });
    assert.equal(globalWrite.globalVars.score, 8);
    assert.notEqual(globalWrite.globalVars, baseBranches.globalVars);
    assert.equal(globalWrite.perPlayerVars, baseBranches.perPlayerVars);
    assert.equal(globalWrite.zoneVars, baseBranches.zoneVars);

    const pvarWrite = writeScopedVarToBranches(baseBranches, {
      endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'hp' },
      value: 10,
    });
    assert.equal(pvarWrite.perPlayerVars['0']?.hp, 10);
    assert.notEqual(pvarWrite.perPlayerVars, baseBranches.perPlayerVars);
    assert.equal(pvarWrite.globalVars, baseBranches.globalVars);
    assert.equal(pvarWrite.zoneVars, baseBranches.zoneVars);

    const zoneWrite = writeScopedVarToBranches(
      baseBranches,
      {
        endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
        value: 4,
      },
    );
    assert.equal(zoneWrite.zoneVars['zone-a:none']?.supply, 4);
    assert.notEqual(zoneWrite.zoneVars, baseBranches.zoneVars);
    assert.equal(zoneWrite.globalVars, baseBranches.globalVars);
    assert.equal(zoneWrite.perPlayerVars, baseBranches.perPlayerVars);
  });

  it('throws canonical runtime diagnostics for malformed zone write construction', () => {
    assert.throws(
      () =>
        toScopedVarWrite(
          { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' },
          false as unknown as number,
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Zone scoped variable writes require numeric values: supply') &&
        String(error).includes('"reason":"internalInvariantViolation"'),
    );
  });

  it('fails fast on impossible write endpoint scope in batched branch writes', () => {
    const state = makeState();
    const malformedWrites = [
      {
        endpoint: { scope: 'actor', var: 'hp' },
        value: 12,
      },
    ] as unknown as readonly ScopedVarWrite[];

    assert.throws(
      () => writeScopedVarsToState(state, malformedWrites),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Scoped variable write endpoint invariant violated') &&
        String(error).includes('"reason":"internalInvariantViolation"'),
    );
  });

  it('fails fast on malformed pvar write endpoint missing player selector in branch writes', () => {
    const state = makeState();
    const malformedWrites = [
      {
        endpoint: { scope: 'pvar', var: 'hp' },
        value: 12,
      },
    ] as unknown as readonly ScopedVarWrite[];

    assert.throws(
      () => writeScopedVarsToState(state, malformedWrites),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Scoped variable write endpoint invariant violated') &&
        String(error).includes('"reason":"internalInvariantViolation"'),
    );
  });

  it('fails fast on malformed pvar write endpoint with non-integer player selector in branch writes', () => {
    const state = makeState();
    const malformedWrites = [
      {
        endpoint: { scope: 'pvar', player: 0.5, var: 'hp' },
        value: 12,
      },
    ] as unknown as readonly ScopedVarWrite[];

    assert.throws(
      () => writeScopedVarsToState(state, malformedWrites),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Scoped variable write endpoint invariant violated') &&
        String(error).includes('"reason":"internalInvariantViolation"'),
    );
  });

  it('writes one-item batched scoped values to full state while preserving non-var branches', () => {
    const state = makeState();

    const updated = writeScopedVarsToState(state, [{ endpoint: { scope: 'pvar', player: asPlayerId(1), var: 'hp' }, value: 12 }]);

    assert.equal(updated.perPlayerVars['1']?.hp, 12);
    assert.notEqual(updated.perPlayerVars, state.perPlayerVars);
    assert.equal(updated.globalVars, state.globalVars);
    assert.equal(updated.zoneVars, state.zoneVars);
    assert.equal(updated.zones, state.zones);
    assert.equal(updated.turnOrderState, state.turnOrderState);
    assert.equal(updated.markers, state.markers);
  });

  it('supports chained one-item batched state writes without dropping prior writes', () => {
    const state = makeState();
    const afterGlobal = writeScopedVarsToState(state, [{ endpoint: { scope: 'global', var: 'score' }, value: 11 }]);
    const afterZone = writeScopedVarsToState(afterGlobal, [
      { endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' }, value: 2 },
    ]);

    assert.equal(afterZone.globalVars.score, 11);
    assert.equal(afterZone.zoneVars['zone-a:none']?.supply, 2);
    assert.equal(afterZone.perPlayerVars, state.perPlayerVars);
  });

  it('applies batched scoped state writes in order through one helper', () => {
    const state = makeState();
    const updated = writeScopedVarsToState(state, [
      { endpoint: { scope: 'global', var: 'score' }, value: 11 },
      { endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' }, value: 2 },
      { endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'hp' }, value: 9 },
    ]);

    assert.equal(updated.globalVars.score, 11);
    assert.equal(updated.zoneVars['zone-a:none']?.supply, 2);
    assert.equal(updated.perPlayerVars['0']?.hp, 9);
    assert.notEqual(updated.globalVars, state.globalVars);
    assert.notEqual(updated.zoneVars, state.zoneVars);
    assert.notEqual(updated.perPlayerVars, state.perPlayerVars);
    assert.equal(updated.zones, state.zones);
  });

  it('applies repeated writes to the same touched branches within one batch', () => {
    const state = makeState();
    const updated = writeScopedVarsToState(state, [
      { endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'hp' }, value: 9 },
      { endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'ready' }, value: true },
      { endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' }, value: 7 },
      { endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' }, value: 6 },
    ]);

    assert.equal(updated.perPlayerVars['0']?.hp, 9);
    assert.equal(updated.perPlayerVars['0']?.ready, true);
    assert.equal(updated.zoneVars['zone-a:none']?.supply, 6);
    assert.notEqual(updated.perPlayerVars['0'], state.perPlayerVars['0']);
    assert.equal(updated.perPlayerVars['1'], state.perPlayerVars['1']);
    assert.notEqual(updated.zoneVars['zone-a:none'], state.zoneVars['zone-a:none']);
    assert.equal(updated.globalVars, state.globalVars);
  });

  it('keeps untouched nested identities stable in multi-write batched branch updates', () => {
    const branches = {
      globalVars: { score: 5, flag: true },
      perPlayerVars: {
        '0': { hp: 7, ready: false },
        '1': { hp: 3, ready: true },
      },
      zoneVars: {
        'zone-a:none': { supply: 9 },
        'zone-b:none': { supply: 4 },
      },
    };

    const updated = writeScopedVarsToState(
      {
        ...makeState(),
        globalVars: branches.globalVars,
        perPlayerVars: branches.perPlayerVars,
        zoneVars: branches.zoneVars,
      },
      [
        { endpoint: { scope: 'global', var: 'score' }, value: 8 },
        { endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'hp' }, value: 10 },
        { endpoint: { scope: 'pvar', player: asPlayerId(0), var: 'ready' }, value: true },
        { endpoint: { scope: 'zone', zone: 'zone-a:none' as never, var: 'supply' }, value: 3 },
      ],
    );

    assert.equal(updated.globalVars.score, 8);
    assert.equal(updated.perPlayerVars['0']?.hp, 10);
    assert.equal(updated.perPlayerVars['0']?.ready, true);
    assert.equal(updated.zoneVars['zone-a:none']?.supply, 3);
    assert.notEqual(updated.globalVars, branches.globalVars);
    assert.notEqual(updated.perPlayerVars, branches.perPlayerVars);
    assert.notEqual(updated.perPlayerVars['0'], branches.perPlayerVars['0']);
    assert.equal(updated.perPlayerVars['1'], branches.perPlayerVars['1']);
    assert.notEqual(updated.zoneVars, branches.zoneVars);
    assert.notEqual(updated.zoneVars['zone-a:none'], branches.zoneVars['zone-a:none']);
    assert.equal(updated.zoneVars['zone-b:none'], branches.zoneVars['zone-b:none']);
  });

  it('returns the same state reference for empty batched writes', () => {
    const state = makeState();
    const unchanged = writeScopedVarsToState(state, []);
    assert.equal(unchanged, state);
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
          onResolutionFailure: 'normalize',
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
          onResolutionFailure: 'normalize',
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
          onResolutionFailure: 'passthrough',
        }),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });

  it('normalizes discovery-mode failures when explicit policy requests normalization', () => {
    const ctx = makeCtx({ mode: 'discovery' });

    assert.throws(
      () =>
        resolveZoneWithNormalization({ zoneExpr: { ref: 'binding', name: '$missingZone' } }, ctx, {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          scope: 'zoneVar',
          resolutionFailureMessage: 'zone endpoint resolution failed',
          onResolutionFailure: 'normalize',
        }),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('zone endpoint resolution failed') &&
        String(error).includes('sourceErrorCode'),
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
