import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, asZoneId, type PlayerId } from '../../../src/kernel/branded.js';
import {
  createMutableReadScope,
  createDiscoveryProbeEffectContext,
  createDiscoveryStrictEffectContext,
  createExecutionEffectContext,
  toEffectCursor,
  toEffectEnv,
  toTraceEmissionContext,
  toTraceProvenanceContext,
  updateReadScope,
  updateReadScopeRaw,
} from '../../../src/kernel/effect-context.js';
import * as effectContextModule from '../../../src/kernel/effect-context.js';
import { emptyScope } from '../../../src/kernel/decision-scope.js';
import { createEvalRuntimeResources, type ReadContext } from '../../../src/kernel/eval-context.js';
import { createCollector } from '../../../src/kernel/execution-collector.js';
import { createRng } from '../../../src/kernel/prng.js';
import type { RuntimeTableIndex } from '../../../src/kernel/runtime-table-index.js';
import { buildAdjacencyGraph } from '../../../src/kernel/spatial.js';
import type { GameDef, GameState } from '../../../src/kernel/types.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'effect-context-construction-contract', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('zone:main'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'zone:main': [],
  },
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

type RuntimeEffectContextOptions = Parameters<typeof createExecutionEffectContext>[0];

const makeRuntimeEffectContextOptions = (
  overrides: Partial<RuntimeEffectContextOptions> = {},
): RuntimeEffectContextOptions => {
  const def = overrides.def ?? makeDef();
  const activePlayer = overrides.activePlayer ?? asPlayerId(0);
  const collector = createCollector();
  return {
    def,
    adjacencyGraph: overrides.adjacencyGraph ?? buildAdjacencyGraph(def.zones),
    state: overrides.state ?? makeState(),
    rng: overrides.rng ?? createRng(1n),
    activePlayer,
    actorPlayer: overrides.actorPlayer ?? activePlayer,
    bindings: overrides.bindings ?? {},
    moveParams: overrides.moveParams ?? {},
    resources: overrides.resources ?? createEvalRuntimeResources({
      collector,
    }),
    ...(overrides.decisionAuthorityPlayer === undefined
      ? {}
      : { decisionAuthorityPlayer: overrides.decisionAuthorityPlayer }),
    ...(overrides.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: overrides.runtimeTableIndex }),
    ...(overrides.traceContext === undefined ? {} : { traceContext: overrides.traceContext }),
    ...(overrides.effectPath === undefined ? {} : { effectPath: overrides.effectPath }),
    ...(overrides.maxEffectOps === undefined ? {} : { maxEffectOps: overrides.maxEffectOps }),
    ...(overrides.freeOperation === undefined ? {} : { freeOperation: overrides.freeOperation }),
    ...(overrides.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: overrides.freeOperationOverlay }),
    ...(overrides.maxQueryResults === undefined ? {} : { maxQueryResults: overrides.maxQueryResults }),
    ...(overrides.phaseTransitionBudget === undefined
      ? {}
      : { phaseTransitionBudget: overrides.phaseTransitionBudget }),
    decisionScope: overrides.decisionScope ?? emptyScope(),
  };
};

const assertAuthority = (
  actual: { source: string; player: PlayerId; ownershipEnforcement: 'strict' | 'probe' },
  expected: { player: PlayerId; ownershipEnforcement: 'strict' | 'probe' },
): void => {
  assert.deepEqual(actual, {
    source: 'engineRuntime',
    player: expected.player,
    ownershipEnforcement: expected.ownershipEnforcement,
  });
};

const assertReadContextCompatibility = (_ctx: ReadContext): void => {};

describe('effect-context construction contract', () => {
  it('enforces execution defaults when no decisionAuthorityPlayer override is provided', () => {
    const activePlayer = asPlayerId(1);
    const options = makeRuntimeEffectContextOptions({ activePlayer });

    const context = createExecutionEffectContext(options);

    assert.equal(context.mode, 'execution');
    assertAuthority(context.decisionAuthority, {
      player: activePlayer,
      ownershipEnforcement: 'strict',
    });
    assert.ok(options.resources !== undefined);
    assert.equal(context.collector, options.resources.collector);
    assert.deepEqual(context.decisionScope, emptyScope());
  });

  it('honors execution decisionAuthorityPlayer override', () => {
    const options = makeRuntimeEffectContextOptions({
      activePlayer: asPlayerId(0),
      decisionAuthorityPlayer: asPlayerId(1),
    });

    const context = createExecutionEffectContext(options);

    assert.equal(context.mode, 'execution');
    assertAuthority(context.decisionAuthority, {
      player: asPlayerId(1),
      ownershipEnforcement: 'strict',
    });
    assert.equal(context.activePlayer, asPlayerId(0));
  });

  it('enforces discovery strict defaults in strict constructor', () => {
    const activePlayer = asPlayerId(1);
    const options = makeRuntimeEffectContextOptions({ activePlayer });

    const strictContext = createDiscoveryStrictEffectContext(options);

    assert.equal(strictContext.mode, 'discovery');
    assertAuthority(strictContext.decisionAuthority, {
      player: activePlayer,
      ownershipEnforcement: 'strict',
    });
  });

  it('enforces discovery probe ownership via direct probe constructor', () => {
    const options = makeRuntimeEffectContextOptions({
      activePlayer: asPlayerId(0),
      decisionAuthorityPlayer: asPlayerId(1),
    });

    const probeContext = createDiscoveryProbeEffectContext(options);

    assert.equal(probeContext.mode, 'discovery');
    assertAuthority(probeContext.decisionAuthority, {
      player: asPlayerId(1),
      ownershipEnforcement: 'probe',
    });
  });

  it('does not export a discovery dispatcher alias constructor', () => {
    assert.equal(
      Object.hasOwn(effectContextModule, 'createDiscoveryEffectContext'),
      false,
      'effect-context module must expose only explicit discovery constructors',
    );
  });

  it('does not export the legacy merged-context bridge', () => {
    const legacyBridgeName = `fromEnv${'AndCursor'}`;
    assert.equal(
      Object.hasOwn(effectContextModule, legacyBridgeName),
      false,
      'effect-context module must not expose the removed merged-context compatibility bridge',
    );
  });

  it('does not export legacy merge-to-context helpers', () => {
    const legacyEvalHelper = `mergeTo${'Eval'}Context`;
    const legacyReadHelper = `mergeTo${'Read'}Context`;
    assert.equal(
      Object.hasOwn(effectContextModule, legacyEvalHelper),
      false,
      `effect-context module must not expose ${legacyEvalHelper} after scope convergence`,
    );
    assert.equal(
      Object.hasOwn(effectContextModule, legacyReadHelper),
      false,
      `effect-context module must not expose ${legacyReadHelper} after scope convergence`,
    );
  });

  it('builds narrow trace bridge helpers with stable own-property layouts', () => {
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions());
    const env = toEffectEnv(context);
    const cursor = toEffectCursor(context);

    const provenanceCtx = toTraceProvenanceContext(env, cursor);
    const emissionCtx = toTraceEmissionContext(env, cursor);

    assert.deepEqual(cursor, {
      state: context.state,
      rng: context.rng,
      bindings: context.bindings,
      decisionScope: context.decisionScope,
      effectPath: undefined,
      tracker: undefined,
    });
    assert.deepEqual(provenanceCtx, {
      state: context.state,
      traceContext: undefined,
      effectPath: undefined,
    });
    assert.deepEqual(emissionCtx, {
      collector: context.collector,
      state: context.state,
      traceContext: undefined,
      effectPath: undefined,
    });
    assert.equal(Object.hasOwn(cursor, 'effectPath'), true);
    assert.equal(Object.hasOwn(cursor, 'tracker'), true);
    assert.equal(Object.hasOwn(provenanceCtx, 'traceContext'), true);
    assert.equal(Object.hasOwn(provenanceCtx, 'effectPath'), true);
    assert.equal(Object.hasOwn(emissionCtx, 'traceContext'), true);
    assert.equal(Object.hasOwn(emissionCtx, 'effectPath'), true);
  });

  it('preserves trace optional fields when present in the env/cursor split', () => {
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions({
      traceContext: { eventContext: 'actionEffect', actionId: 'action:test', effectPathRoot: 'test.effects' },
      effectPath: '[3].then',
    }));
    const env = toEffectEnv(context);
    const cursor = toEffectCursor(context);

    assert.deepEqual(toTraceProvenanceContext(env, cursor), {
      state: context.state,
      traceContext: context.traceContext,
      effectPath: context.effectPath,
    });
    assert.deepEqual(toTraceEmissionContext(env, cursor), {
      collector: context.collector,
      state: context.state,
      traceContext: context.traceContext,
      effectPath: context.effectPath,
    });
  });

  it('preserves free-operation overlay payloads as one object', () => {
    const options = makeRuntimeEffectContextOptions({
      freeOperationOverlay: {
        zoneFilter: {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'category' },
          right: 'board',
        },
        zoneFilterDiagnostics: {
          source: 'turnFlowEligibility',
          actionId: 'operation',
          moveParams: { zone: 'board:none' },
        },
        grantContext: {
          allowedTargets: [2],
          effectCode: 7,
        },
      },
    });

    const context = createExecutionEffectContext(options);

    assert.deepEqual(context.freeOperationOverlay, options.freeOperationOverlay);
  });

  it('constructs MutableReadScope with a stable 11-field ReadContext layout', () => {
    const runtimeTableIndex: RuntimeTableIndex = {
      tableIds: [],
      tablesById: new Map(),
    };
    const freeOperationOverlay = {
      zoneFilter: {
        op: '==',
        left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'category' },
        right: 'board',
      },
      zoneFilterDiagnostics: {
        source: 'turnFlowEligibility',
        actionId: 'action:test',
        moveParams: { zone: 'zone:main' },
      },
      grantContext: {
        allowedTargets: [0],
        effectCode: 1,
      },
    } as const;
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions({
      moveParams: { '$fromMove': 'move-value' },
      bindings: { '$fromCursor': 'cursor-value' },
      runtimeTableIndex,
      freeOperationOverlay,
      maxQueryResults: 25,
    }));
    const env = toEffectEnv(context);
    const cursor = toEffectCursor(context);

    const scope = createMutableReadScope(env, cursor);

    assertReadContextCompatibility(scope);
    assert.deepEqual(scope, {
      def: env.def,
      adjacencyGraph: env.adjacencyGraph,
      state: cursor.state,
      activePlayer: env.activePlayer,
      actorPlayer: env.actorPlayer,
      bindings: { '$fromMove': 'move-value', '$fromCursor': 'cursor-value' },
      resources: env.resources,
      runtimeTableIndex,
      freeOperationOverlay,
      maxQueryResults: 25,
      collector: env.collector,
    });
    assert.equal(Object.keys(scope).length, 11);
    assert.equal(Object.hasOwn(scope, 'runtimeTableIndex'), true);
    assert.equal(Object.hasOwn(scope, 'freeOperationOverlay'), true);
    assert.equal(Object.hasOwn(scope, 'maxQueryResults'), true);
  });

  it('materializes undefined-capable MutableReadScope fields as own properties', () => {
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions());
    const scope = createMutableReadScope(toEffectEnv(context), toEffectCursor(context));

    assert.equal(scope.runtimeTableIndex, undefined);
    assert.equal(scope.freeOperationOverlay, undefined);
    assert.equal(scope.maxQueryResults, undefined);
    assert.equal(Object.hasOwn(scope, 'runtimeTableIndex'), true);
    assert.equal(Object.hasOwn(scope, 'freeOperationOverlay'), true);
    assert.equal(Object.hasOwn(scope, 'maxQueryResults'), true);
  });

  it('updates MutableReadScope in place with resolved eval bindings', () => {
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions({
      moveParams: { '$move': 'base' },
      bindings: { '$cursor': 'original' },
    }));
    const env = toEffectEnv(context);
    const scope = createMutableReadScope(env, toEffectCursor(context));
    const nextState = makeState();
    const nextCursor = {
      ...toEffectCursor(context),
      state: nextState,
      bindings: { '$cursor': 'updated' },
    };

    const updateResult = updateReadScope(scope, nextCursor, env);

    assert.equal(updateResult, undefined);
    assert.equal(scope.state, nextState);
    assert.deepEqual(scope.bindings, { '$move': 'base', '$cursor': 'updated' });
    assert.equal(scope.def, env.def);
    assert.equal(scope.resources, env.resources);
    assert.equal(scope.collector, env.collector);
  });

  it('updates MutableReadScope in place with raw cursor bindings', () => {
    const context = createExecutionEffectContext(makeRuntimeEffectContextOptions({
      moveParams: { '$move': 'base' },
      bindings: { '$cursor': 'original' },
    }));
    const scope = createMutableReadScope(toEffectEnv(context), toEffectCursor(context));
    const nextState = makeState();
    const nextCursor = {
      ...toEffectCursor(context),
      state: nextState,
      bindings: { '$cursor': 'updated' },
    };

    const updateResult = updateReadScopeRaw(scope, nextCursor);

    assert.equal(updateResult, undefined);
    assert.equal(scope.state, nextState);
    assert.deepEqual(scope.bindings, { '$cursor': 'updated' });
    assert.equal(Object.keys(scope).length, 11);
  });
});
