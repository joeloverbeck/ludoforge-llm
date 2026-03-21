import type { Move } from '@ludoforge/engine/runtime';
import type { PlayerSeatConfig } from '../seat/seat-controller.js';
export type { PlayerSeatConfig } from '../seat/seat-controller.js';

export type AppScreen = 'gameSelection' | 'preGameConfig' | 'activeGame' | 'replay' | 'mapEditor';

export interface GameSelectionState {
  readonly screen: 'gameSelection';
}

export interface PreGameConfigState {
  readonly screen: 'preGameConfig';
  readonly gameId: string;
}

export interface ActiveGameState {
  readonly screen: 'activeGame';
  readonly gameId: string;
  readonly seed: number;
  readonly playerConfig: readonly PlayerSeatConfig[];
  readonly initialMoveHistory: readonly Move[];
}

export interface ReplayState {
  readonly screen: 'replay';
  readonly gameId: string;
  readonly seed: number;
  readonly moveHistory: readonly Move[];
  readonly playerConfig: readonly PlayerSeatConfig[];
}

export interface MapEditorState {
  readonly screen: 'mapEditor';
  readonly gameId: string;
}

export type SessionState =
  | GameSelectionState
  | PreGameConfigState
  | ActiveGameState
  | ReplayState
  | MapEditorState;
