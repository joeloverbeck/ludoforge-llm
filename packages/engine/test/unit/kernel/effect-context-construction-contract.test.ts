import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, asZoneId, type PlayerId } from '../../../src/kernel/branded.js';
import {
  createDiscoveryEffectContext,
  createDiscoveryProbeEffectContext,
  createDiscoveryStrictEffectContext,
  createExecutionEffectContext,
} from '../../../src/kernel/effect-context.js';
import { createCollector } from '../../../src/kernel/execution-collector.js';
import { createRng } from '../../../src/kernel/prng.js';
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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

type RuntimeEffectContextOptions = Parameters<typeof createExecutionEffectContext>[0];

const makeRuntimeEffectContextOptions = (
  overrides: Partial<RuntimeEffectContextOptions> = {},
): RuntimeEffectContextOptions => {
  const def = overrides.def ?? makeDef();
  const activePlayer = overrides.activePlayer ?? asPlayerId(0);
  return {
    def,
    adjacencyGraph: overrides.adjacencyGraph ?? buildAdjacencyGraph(def.zones),
    state: overrides.state ?? makeState(),
    rng: overrides.rng ?? createRng(1n),
    activePlayer,
    actorPlayer: overrides.actorPlayer ?? activePlayer,
    bindings: overrides.bindings ?? {},
    moveParams: overrides.moveParams ?? {},
    collector: overrides.collector ?? createCollector(),
    ...(overrides.decisionAuthorityPlayer === undefined
      ? {}
      : { decisionAuthorityPlayer: overrides.decisionAuthorityPlayer }),
    ...(overrides.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: overrides.runtimeTableIndex }),
    ...(overrides.traceContext === undefined ? {} : { traceContext: overrides.traceContext }),
    ...(overrides.effectPath === undefined ? {} : { effectPath: overrides.effectPath }),
    ...(overrides.maxEffectOps === undefined ? {} : { maxEffectOps: overrides.maxEffectOps }),
    ...(overrides.freeOperation === undefined ? {} : { freeOperation: overrides.freeOperation }),
    ...(overrides.freeOperationZoneFilter === undefined
      ? {}
      : { freeOperationZoneFilter: overrides.freeOperationZoneFilter }),
    ...(overrides.freeOperationZoneFilterDiagnostics === undefined
      ? {}
      : { freeOperationZoneFilterDiagnostics: overrides.freeOperationZoneFilterDiagnostics }),
    ...(overrides.maxQueryResults === undefined ? {} : { maxQueryResults: overrides.maxQueryResults }),
    ...(overrides.phaseTransitionBudget === undefined
      ? {}
      : { phaseTransitionBudget: overrides.phaseTransitionBudget }),
    ...(overrides.iterationPath === undefined ? {} : { iterationPath: overrides.iterationPath }),
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
    assert.equal(context.collector, options.collector);
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

  it('enforces discovery strict defaults in strict constructor and wrapper default path', () => {
    const activePlayer = asPlayerId(1);
    const options = makeRuntimeEffectContextOptions({ activePlayer });

    const strictContext = createDiscoveryStrictEffectContext(options);
    const wrapperDefaultContext = createDiscoveryEffectContext(options);

    assert.equal(strictContext.mode, 'discovery');
    assert.equal(wrapperDefaultContext.mode, 'discovery');
    assertAuthority(strictContext.decisionAuthority, {
      player: activePlayer,
      ownershipEnforcement: 'strict',
    });
    assertAuthority(wrapperDefaultContext.decisionAuthority, {
      player: activePlayer,
      ownershipEnforcement: 'strict',
    });
  });

  it('enforces discovery probe ownership via direct probe constructor and wrapper probe path', () => {
    const options = makeRuntimeEffectContextOptions({
      activePlayer: asPlayerId(0),
      decisionAuthorityPlayer: asPlayerId(1),
    });

    const probeContext = createDiscoveryProbeEffectContext(options);
    const wrapperProbeContext = createDiscoveryEffectContext(options, 'probe');

    assert.equal(probeContext.mode, 'discovery');
    assert.equal(wrapperProbeContext.mode, 'discovery');
    assertAuthority(probeContext.decisionAuthority, {
      player: asPlayerId(1),
      ownershipEnforcement: 'probe',
    });
    assertAuthority(wrapperProbeContext.decisionAuthority, {
      player: asPlayerId(1),
      ownershipEnforcement: 'probe',
    });
  });
});
