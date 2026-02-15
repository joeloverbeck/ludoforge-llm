import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'interrupt-phase-stack-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [{ id: asPhaseId('main') }],
    interrupts: [{ id: asPhaseId('commitment') }, { id: asPhaseId('aftermath') }],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 3,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph(makeDef().zones),
  state: makeState(),
  rng: createRng(1n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('interrupt phase stack transitions', () => {
  it('supports nested push/pop with deterministic resume order', () => {
    const effects: readonly EffectAST[] = [
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
      { pushInterruptPhase: { phase: 'aftermath', resumePhase: 'commitment' } },
      { popInterruptPhase: {} },
      { popInterruptPhase: {} },
    ];

    const result = applyEffects(effects, makeCtx());

    assert.equal(result.state.currentPhase, asPhaseId('main'));
    assert.equal(result.state.turnCount, 3);
    assert.equal(result.state.interruptPhaseStack?.length ?? 0, 0);
  });

  it('rejects popInterruptPhase when stack is empty', () => {
    const effect: EffectAST = { popInterruptPhase: {} };
    assert.throws(() => applyEffect(effect, makeCtx()), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-empty interruptPhaseStack');
    });
  });
});
