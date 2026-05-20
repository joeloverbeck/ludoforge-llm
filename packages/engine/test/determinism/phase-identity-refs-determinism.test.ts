// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  asBoundaryId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  assertValidatedGameDef,
  computeFullHash,
  createZobristTable,
  initialState,
  type AgentPolicyCatalog,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';

const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
  schemaVersion: 3,
  catalogFingerprint: 'phase-identity-refs-determinism-test',
  surfaceVisibility: {
    globalVars: {},
    globalMarkers: {},
    perPlayerVars: {},
    derivedMetrics: {},
    victory: {
      currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
    },
    activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  },
  parameterDefs: {},
  candidateParamDefs: {},
  library: {
    stateFeatures: {},
    candidateFeatures: {},
    candidateAggregates: {},
    guardrails: {},
    considerations: {},
    tieBreakers: {},
    strategicConditions: {},
  },
  profiles: {},
  bindingsBySeat: {},
});

const def: GameDef = assertValidatedGameDef({
  metadata: { id: 'phase-identity-refs-determinism-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  seats: [{ id: asSeatId('us') }, { id: asSeatId('them') }],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [
      { id: asPhaseId('main') },
      { id: asPhaseId('operations') },
      { id: asPhaseId('scoring') },
      { id: asPhaseId('reset') },
    ],
    interrupts: [{ id: asPhaseId('reaction') }],
  },
  phaseBoundaries: [
    { id: asBoundaryId('operationsEntry'), kind: 'phaseEntry', phaseId: asPhaseId('operations') },
    { id: asBoundaryId('scoringEntry'), kind: 'phaseEntry', phaseId: asPhaseId('scoring') },
    { id: asBoundaryId('resetEntry'), kind: 'phaseEntry', phaseId: asPhaseId('reset') },
  ],
  agents: catalog,
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

function withPhase(base: GameState, phaseId: string): GameState {
  const next = {
    ...base,
    currentPhase: asPhaseId(phaseId),
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

function phaseReadoutTrace(seed: number): string {
  const initial = initialState(def, seed, 2).state;
  const phases = ['main', 'operations', 'scoring', 'reaction'];
  const readouts = Array.from({ length: 20 }, (_, index) => {
    const state = withPhase(initial, phases[index % phases.length]!);
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });
    try {
      return {
        current: providers.phaseSchedule.resolvePhaseIntrinsic({ kind: 'phaseIntrinsic', name: 'current.id' }),
        next: providers.phaseSchedule.resolvePhaseIntrinsic({ kind: 'phaseIntrinsic', name: 'next.id' }),
        nextBoundary: providers.phaseSchedule.resolveScheduleDistance({
          kind: 'scheduleDistance',
          target: { kind: 'nextBoundary' },
        }),
      };
    } finally {
      providers.dispose();
    }
  });
  return JSON.stringify(readouts);
}

describe('phase identity ref determinism', () => {
  it('produces byte-identical phase ref readouts across a 20-step trace for the same GameDef and seed', () => {
    assert.equal(phaseReadoutTrace(13), phaseReadoutTrace(13));
  });
});
