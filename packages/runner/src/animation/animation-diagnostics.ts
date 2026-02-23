import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type { AnimationDescriptor, VisualAnimationDescriptorKind } from './animation-types.js';

export interface DiagnosticPosition {
  readonly x: number;
  readonly y: number;
}

export interface SpriteResolutionEntry {
  readonly descriptorKind: VisualAnimationDescriptorKind;
  readonly tokenId?: string;
  readonly zoneId?: string;
  readonly resolved: boolean;
  readonly containerType?: 'existing' | 'ephemeral';
  readonly position?: DiagnosticPosition;
  readonly reason?: string;
}

export interface EphemeralCreatedEntry {
  readonly tokenId: string;
  readonly width: number;
  readonly height: number;
  readonly hasCardContent?: boolean;
  readonly cardTemplateName?: string;
}

export interface FaceStateChange {
  readonly oldValue: boolean;
  readonly newValue: boolean;
}

export interface ArcGeometryDiagnostic {
  readonly midX: number;
  readonly midY: number;
  readonly liftHeight: number;
  readonly horizontalOffsetApplied: boolean;
}

export interface TweenLogEntry {
  readonly descriptorKind: VisualAnimationDescriptorKind;
  readonly tokenId?: string;
  readonly preset: string;
  readonly durationSeconds: number;
  readonly isTriggeredPulse: boolean;
  readonly fromPosition?: DiagnosticPosition;
  readonly toPosition?: DiagnosticPosition;
  readonly faceState?: FaceStateChange;
  readonly tweenedProperties?: readonly string[];
  readonly destinationOffset?: DiagnosticPosition;
  readonly arcGeometry?: ArcGeometryDiagnostic;
}

export interface FaceControllerCallEntry {
  readonly tokenId: string;
  readonly faceUp: boolean;
  readonly context: string;
}

export interface TokenVisibilityInitEntry {
  readonly tokenId: string;
  readonly alphaSetTo: number;
}

export type DiagnosticQueueEventType =
  | 'enqueue'
  | 'playStart'
  | 'playComplete'
  | 'skip'
  | 'skipAll'
  | 'drop'
  | 'flush';

export interface DiagnosticQueueEvent {
  readonly event: DiagnosticQueueEventType;
  readonly queueLength: number;
  readonly isPlaying: boolean;
}

export interface DiagnosticPlayerConfig {
  readonly seat: number;
  readonly type: string;
}

export interface DiagnosticTokenFaceState {
  readonly tokenId: string;
  readonly faceUp: boolean;
}

export interface DiagnosticRenderSummary {
  readonly visibleTokenCount: number;
  readonly hiddenTokenCount: number;
  readonly faceUpCount: number;
  readonly faceDownCount: number;
}

export interface DiagnosticChoiceEvent {
  readonly actionId: string;
  readonly selectedValue: unknown;
  readonly timestampIso: string;
}

export interface DiagnosticBatch {
  readonly batchId: number;
  readonly timestampIso: string;
  readonly isSetup: boolean;
  readonly traceEntries: readonly EffectTraceEntry[];
  readonly descriptors: readonly AnimationDescriptor[];
  readonly skippedCount: number;
  readonly spriteResolutions: readonly SpriteResolutionEntry[];
  readonly ephemeralsCreated: readonly EphemeralCreatedEntry[];
  readonly tweens: readonly TweenLogEntry[];
  readonly faceControllerCalls: readonly FaceControllerCallEntry[];
  readonly tokenVisibilityInits: readonly TokenVisibilityInitEntry[];
  readonly queueEvent?: DiagnosticQueueEvent;
  readonly warnings: readonly string[];
  readonly playerConfig?: readonly DiagnosticPlayerConfig[];
  readonly tokenFaceStates?: readonly DiagnosticTokenFaceState[];
  readonly renderSummary?: DiagnosticRenderSummary;
  readonly choiceEvents?: readonly DiagnosticChoiceEvent[];
}
