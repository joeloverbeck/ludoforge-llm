import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EFFECT_RUNTIME_REASONS,
  asPhaseId,
  asPlayerId,
  asZoneId,
  assertEffectContextEntryInvariant,
  createCollector,
  isEffectErrorCode,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import {
  makeDiscoveryEffectContext,
  makeDiscoveryProbeEffectContext,
  makeExecutionEffectContext,
} from '../../helpers/effect-context-test-helpers.js';

const baseDef: GameDef = {
  metadata: { id: 'effect-context-invariants', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
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

describe('effect context entry invariants', () => {
  it('accepts canonical execution/discovery contexts', () => {
    const contexts: readonly EffectContext[] = [
      makeExecutionEffectContext({ def: baseDef, state: baseState, collector: createCollector() }),
      makeDiscoveryEffectContext({ def: baseDef, state: baseState, collector: createCollector() }),
      makeDiscoveryProbeEffectContext({ def: baseDef, state: baseState, collector: createCollector() }),
    ];

    for (const context of contexts) {
      assert.doesNotThrow(() => assertEffectContextEntryInvariant(context));
    }
  });

  it('rejects incoherent mode/authority combinations', () => {
    const malformedContext = {
      ...makeDiscoveryProbeEffectContext({ def: baseDef, state: baseState, collector: createCollector() }),
      mode: 'execution',
    } as unknown as EffectContext;

    assert.throws(() => assertEffectContextEntryInvariant(malformedContext), (error: unknown) => {
      assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
      assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION);
      assert.equal(error.context?.mode, 'execution');
      assert.equal(error.context?.ownershipEnforcement, 'probe');
      return true;
    });
  });
});
