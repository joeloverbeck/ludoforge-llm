import type { EffectTraceEntry, GameDef, Move, TriggerLogEntry } from '@ludoforge/engine/runtime';

import type { GameBridge } from '../bridge/game-bridge.js';
import type { OperationStamp } from '../worker/game-worker-api.js';

const ALLOWED_PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
const BASE_PLAYBACK_DELAY_MS = 1000;

export interface ReplayController {
  readonly totalMoves: number;
  readonly currentMoveIndex: number;
  readonly isPlaying: boolean;
  readonly playbackSpeed: number;
  readonly lastEffectTrace: readonly EffectTraceEntry[];
  readonly lastTriggerFirings: readonly TriggerLogEntry[];

  stepForward(): Promise<void>;
  stepBackward(): Promise<void>;
  jumpToMove(index: number): Promise<void>;
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  destroy(): void;
}

function isAllowedPlaybackSpeed(speed: number): speed is (typeof ALLOWED_PLAYBACK_SPEEDS)[number] {
  return ALLOWED_PLAYBACK_SPEEDS.includes(speed as (typeof ALLOWED_PLAYBACK_SPEEDS)[number]);
}

function ensureMoveIndex(index: number, totalMoves: number): void {
  if (!Number.isInteger(index)) {
    throw new Error(`Replay move index must be an integer. Received: ${String(index)}`);
  }

  const maxMoveIndex = totalMoves - 1;
  if (index < -1 || index > maxMoveIndex) {
    throw new Error(`Replay move index ${String(index)} is out of range [-1, ${String(maxMoveIndex)}].`);
  }
}

function resolvePlaybackDelayMs(speed: number): number {
  return Math.round(BASE_PLAYBACK_DELAY_MS / speed);
}

export function createReplayController(
  bridge: GameBridge,
  gameDef: GameDef,
  seed: number,
  moveHistory: readonly Move[],
  onStateChange: () => void,
): ReplayController {
  let destroyed = false;
  let currentMoveIndex = -1;
  let isPlaying = false;
  let playbackSpeed: (typeof ALLOWED_PLAYBACK_SPEEDS)[number] = 1;
  let playbackTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEffectTrace: readonly EffectTraceEntry[] = [];
  let lastTriggerFirings: readonly TriggerLogEntry[] = [];
  let operationToken = 0;
  let operationQueue: Promise<void> = Promise.resolve();

  const clearPlaybackTimer = (): void => {
    if (playbackTimer === null) {
      return;
    }
    clearTimeout(playbackTimer);
    playbackTimer = null;
  };

  const emitStateChange = (): void => {
    if (destroyed) {
      return;
    }
    onStateChange();
  };

  const nextStamp = (): OperationStamp => {
    operationToken += 1;
    return {
      epoch: 1,
      token: operationToken,
    };
  };

  const enqueue = async (task: () => Promise<void>): Promise<void> => {
    if (destroyed) {
      return;
    }

    const run = operationQueue.then(task);
    operationQueue = run.catch(() => undefined);
    return run;
  };

  const resetWithoutTrace = async (): Promise<void> => {
    await bridge.init(gameDef, seed, { enableTrace: false }, nextStamp());
  };

  const applyMoveWithTrace = async (move: Move): Promise<void> => {
    const result = await bridge.applyMove(move, { trace: true }, nextStamp());
    lastEffectTrace = result.effectTrace ?? [];
    lastTriggerFirings = result.triggerFirings;
  };

  const applyPrefixWithoutTrace = async (endExclusive: number): Promise<void> => {
    if (endExclusive <= 0) {
      return;
    }
    await bridge.playSequence(moveHistory.slice(0, endExclusive), { trace: false }, nextStamp());
  };

  const pauseInternal = (): void => {
    if (!isPlaying) {
      return;
    }
    isPlaying = false;
    clearPlaybackTimer();
    emitStateChange();
  };

  const scheduleNextPlaybackStep = (): void => {
    if (destroyed || !isPlaying) {
      return;
    }

    if (currentMoveIndex >= moveHistory.length - 1) {
      pauseInternal();
      return;
    }

    clearPlaybackTimer();
    playbackTimer = setTimeout(() => {
      playbackTimer = null;
      void enqueue(async () => {
        if (destroyed || !isPlaying) {
          return;
        }

        const nextMoveIndex = currentMoveIndex + 1;
        if (nextMoveIndex >= moveHistory.length) {
          pauseInternal();
          return;
        }

        await applyMoveWithTrace(moveHistory[nextMoveIndex]!);
        currentMoveIndex = nextMoveIndex;
        emitStateChange();

        if (currentMoveIndex >= moveHistory.length - 1) {
          pauseInternal();
          return;
        }

        scheduleNextPlaybackStep();
      }).catch(() => {
        pauseInternal();
      });
    }, resolvePlaybackDelayMs(playbackSpeed));
  };

  return {
    get totalMoves(): number {
      return moveHistory.length;
    },

    get currentMoveIndex(): number {
      return currentMoveIndex;
    },

    get isPlaying(): boolean {
      return isPlaying;
    },

    get playbackSpeed(): number {
      return playbackSpeed;
    },

    get lastEffectTrace(): readonly EffectTraceEntry[] {
      return lastEffectTrace;
    },

    get lastTriggerFirings(): readonly TriggerLogEntry[] {
      return lastTriggerFirings;
    },

    async stepForward(): Promise<void> {
      await enqueue(async () => {
        const nextMoveIndex = currentMoveIndex + 1;
        if (nextMoveIndex >= moveHistory.length) {
          return;
        }
        await applyMoveWithTrace(moveHistory[nextMoveIndex]!);
        currentMoveIndex = nextMoveIndex;
        emitStateChange();
      });
    },

    async stepBackward(): Promise<void> {
      await enqueue(async () => {
        if (currentMoveIndex < 0) {
          return;
        }

        const targetMoveIndex = currentMoveIndex - 1;
        await resetWithoutTrace();

        if (targetMoveIndex >= 0) {
          await applyPrefixWithoutTrace(targetMoveIndex + 1);
        }

        currentMoveIndex = targetMoveIndex;
        lastEffectTrace = [];
        lastTriggerFirings = [];
        emitStateChange();
      });
    },

    async jumpToMove(index: number): Promise<void> {
      ensureMoveIndex(index, moveHistory.length);

      await enqueue(async () => {
        if (index === currentMoveIndex) {
          return;
        }

        await resetWithoutTrace();

        if (index >= 0) {
          await applyPrefixWithoutTrace(index);
          await applyMoveWithTrace(moveHistory[index]!);
        } else {
          lastEffectTrace = [];
          lastTriggerFirings = [];
        }

        currentMoveIndex = index;
        emitStateChange();
      });
    },

    play(): void {
      if (destroyed || isPlaying || moveHistory.length === 0) {
        return;
      }

      if (currentMoveIndex >= moveHistory.length - 1) {
        return;
      }

      isPlaying = true;
      emitStateChange();
      scheduleNextPlaybackStep();
    },

    pause(): void {
      pauseInternal();
    },

    setSpeed(speed: number): void {
      if (!isAllowedPlaybackSpeed(speed)) {
        throw new Error(`Invalid replay playback speed: ${String(speed)}.`);
      }

      playbackSpeed = speed;
      emitStateChange();

      if (isPlaying) {
        scheduleNextPlaybackStep();
      }
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      isPlaying = false;
      clearPlaybackTimer();
    },
  };
}
