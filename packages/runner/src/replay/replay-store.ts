import { create } from 'zustand';

import type { ReplayController } from './replay-controller.js';

interface ReplayStoreState {
  readonly currentMoveIndex: number;
  readonly isPlaying: boolean;
  readonly playbackSpeed: number;
  readonly totalMoves: number;
}

interface ReplayStoreActions {
  stepForward(): Promise<void>;
  stepBackward(): Promise<void>;
  jumpToMove(index: number): Promise<void>;
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  syncFromController(): void;
  destroy(): void;
}

export type ReplayStore = ReplayStoreState & ReplayStoreActions;

function snapshotFromController(controller: ReplayController): ReplayStoreState {
  return {
    currentMoveIndex: controller.currentMoveIndex,
    isPlaying: controller.isPlaying,
    playbackSpeed: controller.playbackSpeed,
    totalMoves: controller.totalMoves,
  };
}

export function createReplayStore(controller: ReplayController) {
  return create<ReplayStore>()((set, get) => ({
    ...snapshotFromController(controller),

    async stepForward(): Promise<void> {
      await controller.stepForward();
      get().syncFromController();
    },

    async stepBackward(): Promise<void> {
      await controller.stepBackward();
      get().syncFromController();
    },

    async jumpToMove(index: number): Promise<void> {
      await controller.jumpToMove(index);
      get().syncFromController();
    },

    play(): void {
      controller.play();
      get().syncFromController();
    },

    pause(): void {
      controller.pause();
      get().syncFromController();
    },

    setSpeed(speed: number): void {
      controller.setSpeed(speed);
      get().syncFromController();
    },

    syncFromController(): void {
      set(snapshotFromController(controller));
    },

    destroy(): void {
      controller.destroy();
      get().syncFromController();
    },
  }));
}
