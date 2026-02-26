import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

import {
  applyGrantFreeOperation,
  applyGotoPhaseExact,
  applyAdvancePhase,
  applyPushInterruptPhase,
  applyPopInterruptPhase,
} from '../../src/kernel/effects-turn-flow.js';

const makeDef = (overrides?: Partial<GameDef>): GameDef =>
  ({
    metadata: { id: 'turn-flow-test', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zoneVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [
        { id: asPhaseId('setup') },
        { id: asPhaseId('main') },
        { id: asPhaseId('cleanup') },
      ],
      interrupts: [
        { id: asPhaseId('coup') },
      ],
    },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1', '2', '3'], overrideWindows: [] },
          actionClassByActionId: { attack: 'operation', defend: 'limitedOperation' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('attack'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    ...overrides,
  }) as unknown as GameDef;

const makeCardDrivenState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 4,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['0', '1', '2', '3'],
      eligibility: { '0': true, '1': true, '2': true, '3': true },
      currentCard: {
        firstEligible: '0',
        secondEligible: '1',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
    },
  },
  markers: {},
  ...overrides,
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeCardDrivenState(),
  rng: createRng(42n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('applyGrantFreeOperation', () => {
  it('throws when turn order state is not cardDriven', () => {
    const ctx = makeCtx({
      state: {
        ...makeCardDrivenState(),
        turnOrderState: { type: 'roundRobin' },
      },
    });
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws for invalid operationClass', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'invalidClass' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('resolves "self" seat to active player', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    assert.equal(tos.type, 'cardDriven');
    if (tos.type !== 'cardDriven') return;
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.seat, '0');
  });

  it('resolves named seat correctly', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: '2', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants[0]!.seat, '2');
  });

  it('throws for unknown seat', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'unknownSeat', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('generates unique grant IDs', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result1 = applyGrantFreeOperation(effect, ctx);
    const ctx2 = makeCtx({ state: result1.state });
    const result2 = applyGrantFreeOperation(effect, ctx2);

    const tos = result2.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.notEqual(grants[0]!.grantId, grants[1]!.grantId);
  });

  it('sets remainingUses from grant.uses', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation', uses: 3 },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants[0]!.remainingUses, 3);
  });

  it('throws for non-positive uses', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation', uses: 0 },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });
});

describe('applyGotoPhaseExact', () => {
  it('throws for unknown target phase', () => {
    const ctx = makeCtx();
    const effect = {
      gotoPhaseExact: { phase: 'nonExistent' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    assert.throws(() => applyGotoPhaseExact(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('returns same state for same-phase no-op', () => {
    const ctx = makeCtx();
    const effect = {
      gotoPhaseExact: { phase: 'main' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, ctx.state.currentPhase);
  });

  it('throws for backward phase transition', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('cleanup') }),
    });
    const effect = {
      gotoPhaseExact: { phase: 'setup' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    assert.throws(() => applyGotoPhaseExact(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('transitions forward to target phase', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
    });
    const effect = {
      gotoPhaseExact: { phase: 'cleanup' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('cleanup'));
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      gotoPhaseExact: { phase: 'main' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('setup')); // unchanged
  });
});

describe('applyAdvancePhase', () => {
  it('advances to next phase in sequence', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
    });
    const effect = {
      advancePhase: {},
    } as unknown as Extract<EffectAST, { readonly advancePhase: unknown }>;

    const result = applyAdvancePhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main'));
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      advancePhase: {},
    } as unknown as Extract<EffectAST, { readonly advancePhase: unknown }>;

    const result = applyAdvancePhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('setup')); // unchanged
  });
});

describe('applyPushInterruptPhase', () => {
  it('pushes interrupt phase onto stack', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    const result = applyPushInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('coup'));
    const stack = result.state.interruptPhaseStack ?? [];
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.phase, asPhaseId('coup'));
    assert.equal(stack[0]!.resumePhase, asPhaseId('main'));
  });

  it('throws for unknown phase', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'nonExistent', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    assert.throws(() => applyPushInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws for unknown resumePhase', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'nonExistent' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    assert.throws(() => applyPushInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    const result = applyPushInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main')); // unchanged
  });
});

describe('applyPopInterruptPhase', () => {
  it('throws when interrupt stack is empty', () => {
    const ctx = makeCtx();
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    assert.throws(() => applyPopInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('pops stack and resumes to correct phase', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({
        currentPhase: asPhaseId('coup'),
        interruptPhaseStack: [
          { phase: asPhaseId('coup'), resumePhase: asPhaseId('main') },
        ],
      }),
    });
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    const result = applyPopInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main'));
    const stack = result.state.interruptPhaseStack;
    assert.ok(stack === undefined || stack.length === 0);
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({
        currentPhase: asPhaseId('coup'),
        interruptPhaseStack: [
          { phase: asPhaseId('coup'), resumePhase: asPhaseId('main') },
        ],
      }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    const result = applyPopInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('coup')); // unchanged
  });
});
