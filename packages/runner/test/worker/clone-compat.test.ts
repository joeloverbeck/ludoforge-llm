import { deepStrictEqual } from 'node:assert/strict';

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtime from '@ludoforge/engine/runtime';

import {
  asActionId,
  asPlayerId,
  type ChoiceRequest,
  type EffectTraceEntry,
  type LegalMoveEnumerationResult,
  type RuntimeWarning,
  type TerminalResult,
} from '@ludoforge/engine/runtime';

import { createGameWorker, type GameMetadata, type OperationStamp, type WorkerError } from '../../src/worker/game-worker-api';
import { TRIGGER_LOG_ENTRIES_EXHAUSTIVE } from '../helpers/trigger-log-fixtures';
import { LEGAL_TICK_MOVE, TEST_DEF } from './test-fixtures';

const roundTripClone = <T>(value: T): T => {
  const cloned = structuredClone(value);
  deepStrictEqual(cloned, value);
  return cloned;
};

const createStampFactory = (): (() => OperationStamp) => {
  let token = 0;
  return () => ({ epoch: 0, token: ++token });
};

const EFFECT_PROVENANCE = {
  phase: 'main',
  eventContext: 'actionEffect' as const,
  actionId: 'tick',
  effectPath: 'effects[0]',
};

const TRACE_ENTRIES: readonly EffectTraceEntry[] = [
  {
    kind: 'forEach',
    bind: 'item',
    matchCount: 2,
    iteratedCount: 2,
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'reduce',
    itemBind: 'item',
    accBind: 'acc',
    resultBind: 'sum',
    matchCount: 2,
    iteratedCount: 2,
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'moveToken',
    tokenId: 'token-1',
    from: 'zone:a',
    to: 'zone:b',
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'setTokenProp',
    tokenId: 'token-1',
    prop: 'ready',
    oldValue: false,
    newValue: true,
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'varChange',
    scope: 'global',
    varName: 'tick',
    oldValue: 0,
    newValue: 1,
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'resourceTransfer',
    from: { scope: 'global', varName: 'resA' },
    to: { scope: 'perPlayer', varName: 'resB', player: asPlayerId(1) },
    requestedAmount: 3,
    actualAmount: 2,
    sourceAvailable: 2,
    destinationHeadroom: 4,
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'createToken',
    tokenId: 'token-2',
    type: 'piece',
    zone: 'zone:a',
    provenance: EFFECT_PROVENANCE,
  },
  {
    kind: 'lifecycleEvent',
    eventType: 'turnStart',
    phase: 'main',
    provenance: EFFECT_PROVENANCE,
  },
];

const RUNTIME_WARNINGS: readonly RuntimeWarning[] = [
  {
    code: 'EMPTY_QUERY_RESULT',
    message: 'No rows matched selector',
    context: { selector: 'players' },
  },
  {
    code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED',
    message: 'Template budget exceeded',
    context: { maxTemplates: 1 },
    hint: 'Increase move enumeration budget',
  },
];

describe('worker boundary structured clone compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips GameDef, GameState, Move, ApplyMoveResult, ChoiceRequest, TerminalResult, and legal move enumeration', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const initResult = await worker.init(TEST_DEF, 31, undefined, nextStamp());
    const legalMoveEnumeration = await worker.enumerateLegalMoves();
    const move = legalMoveEnumeration.moves[0] ?? LEGAL_TICK_MOVE;
    const applyMoveResult = await worker.applyMove(move, undefined, nextStamp());
    const applyTemplateMoveResult = await worker.applyTemplateMove(move, undefined, nextStamp());
    const choiceRequest = await worker.legalChoices(move);
    const terminal = await worker.terminalResult();

    roundTripClone(TEST_DEF);
    const clonedInitResult = roundTripClone(initResult);
    roundTripClone(move);
    roundTripClone(applyMoveResult);
    roundTripClone(applyTemplateMoveResult);
    roundTripClone(choiceRequest);
    roundTripClone(terminal);
    roundTripClone(legalMoveEnumeration);

    expect(typeof clonedInitResult.state.stateHash).toBe('bigint');
    expect(typeof clonedInitResult.state.rng.state[0]).toBe('bigint');
  });

  it('round-trips all EffectTraceEntry variants', () => {
    roundTripClone(TRACE_ENTRIES);
  });

  it('round-trips all TriggerLogEntry variants and RuntimeWarning arrays', () => {
    roundTripClone(TRIGGER_LOG_ENTRIES_EXHAUSTIVE);
    roundTripClone(RUNTIME_WARNINGS);
  });

  it('round-trips all ChoiceRequest variants', () => {
    const variants: readonly ChoiceRequest[] = [
      {
        kind: 'pending',
        complete: false,
        decisionId: 'd1',
        name: 'pick',
        type: 'chooseOne',
        options: [
          { value: 1, legality: 'legal', illegalReason: null },
          { value: 'x', legality: 'legal', illegalReason: null },
          { value: true, legality: 'legal', illegalReason: null },
        ],
        targetKinds: [],
      },
      {
        kind: 'complete',
        complete: true,
      },
      {
        kind: 'illegal',
        complete: false,
        reason: 'phaseMismatch',
      },
    ];

    for (const variant of variants) {
      roundTripClone(variant);
    }
  });

  it('round-trips all TerminalResult variants', () => {
    const variants: readonly TerminalResult[] = [
      { type: 'win', player: asPlayerId(1) },
      { type: 'lossAll' },
      { type: 'draw' },
      {
        type: 'score',
        ranking: [
          { player: asPlayerId(1), score: 10 },
          { player: asPlayerId(2), score: 5 },
        ],
      },
    ];

    for (const variant of variants) {
      roundTripClone(variant);
    }
  });

  it('round-trips GameMetadata and WorkerError variants', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 41, undefined, nextStamp());
    const metadata = await worker.getMetadata();

    const errors: readonly WorkerError[] = [
      { code: 'ILLEGAL_MOVE', message: 'Illegal move.' },
      { code: 'VALIDATION_FAILED', message: 'Bad GameDef.' },
      { code: 'NOT_INITIALIZED', message: 'Call init first.' },
      { code: 'INTERNAL_ERROR', message: 'Unexpected worker error.', details: { fatal: true } },
      { code: 'STALE_OPERATION', message: 'Superseded operation.' },
    ];

    const gameMetadata: GameMetadata = metadata;
    roundTripClone(gameMetadata);
    for (const error of errors) {
      roundTripClone(error);
    }
  });

  it('round-trips LegalMoveEnumerationResult with warnings explicitly', () => {
    const sample: LegalMoveEnumerationResult = {
      moves: [LEGAL_TICK_MOVE],
      warnings: RUNTIME_WARNINGS,
    };

    roundTripClone(sample);
  });

  it('round-trips applyTemplateMove uncompletable and illegal outcomes', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 42, undefined, nextStamp());

    vi.spyOn(runtime, 'completeTemplateMove').mockReturnValueOnce(null);
    const uncompletable = await worker.applyTemplateMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    roundTripClone(uncompletable);
    expect(uncompletable).toEqual({ outcome: 'uncompletable' });

    vi.spyOn(runtime, 'completeTemplateMove').mockReturnValueOnce({ move: { ...LEGAL_TICK_MOVE, actionId: asActionId('missing-action') } } as never);
    const illegal = await worker.applyTemplateMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    roundTripClone(illegal);
    expect(illegal.outcome).toBe('illegal');
    if (illegal.outcome !== 'illegal') {
      throw new Error('Expected illegal outcome.');
    }
    expect(illegal.error.code).toBe('ILLEGAL_MOVE');
  });
});
