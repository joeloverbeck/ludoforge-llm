import type { GameDef, GameState, Move } from '../kernel/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type { PolicyWasmRuntime } from './policy-wasm-runtime.js';

export interface PolicyWasmProductionPreviewDriveCandidate { readonly move: Move; readonly stableMoveKey: string; readonly actionId?: string; }

export interface PolicyWasmProductionPreviewDriveInput { readonly runtime: Pick<PolicyWasmRuntime, 'evaluatePreviewDriveBatch'>; readonly gameDefRuntime?: GameDefRuntime; readonly def: GameDef; readonly state: GameState; readonly profileId: string; readonly originSeatId: string; readonly originTurnId: number; readonly depthCap: number; readonly previewStateSlots: readonly string[]; readonly candidates: readonly PolicyWasmProductionPreviewDriveCandidate[]; }

export type PolicyWasmProductionPreviewDriveIrOp =
  | { readonly kind: 'applyCandidateDeltas'; readonly candidateDeltas: readonly number[] }
  | { readonly kind: 'addGlobal'; readonly delta: number }
  | { readonly kind: 'setGlobal'; readonly value: number }
  | { readonly kind: 'addPreviewSlot'; readonly slotIndex: number; readonly delta: number }
  | { readonly kind: 'setPreviewSlot'; readonly slotIndex: number; readonly value: number }
  | { readonly kind: 'chooseOneGreedy'; readonly optionDeltas: readonly number[] }
  | { readonly kind: 'chooseNGreedy'; readonly min: number; readonly max: number; readonly optionDeltas: readonly number[] }
  | { readonly kind: 'stochastic' };

export interface PolicyWasmProductionPreviewDriveIrProgram { readonly rootValues: readonly number[]; readonly ops: readonly PolicyWasmProductionPreviewDriveIrOp[]; }
