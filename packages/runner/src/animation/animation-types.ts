import type { PlayerId, VariableValue } from '@ludoforge/engine/runtime';

export const ANIMATION_PRESET_IDS = [
  'arc-tween',
  'fade-in-scale',
  'fade-out-scale',
  'tint-flash',
  'counter-roll',
  'banner-slide',
  'pulse',
] as const;

export type AnimationPresetId = (typeof ANIMATION_PRESET_IDS)[number];

export type AnimationDetailLevel = 'full' | 'standard' | 'minimal';

export interface AnimationMappingOptions {
  readonly presetOverrides?: ReadonlyMap<string, AnimationPresetId>;
  readonly detailLevel?: AnimationDetailLevel;
}

interface BaseAnimationDescriptor {
  readonly preset: AnimationPresetId;
  readonly isTriggered: boolean;
}

export interface MoveTokenDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'moveToken';
  readonly tokenId: string;
  readonly from: string;
  readonly to: string;
}

export interface CreateTokenDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'createToken';
  readonly tokenId: string;
  readonly type: string;
  readonly zone: string;
}

export interface DestroyTokenDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'destroyToken';
  readonly tokenId: string;
  readonly type: string;
  readonly zone: string;
}

export interface SetTokenPropDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'setTokenProp';
  readonly tokenId: string;
  readonly prop: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface VarChangeDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'varChange';
  readonly scope: 'global' | 'perPlayer';
  readonly varName: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
  readonly player?: PlayerId;
}

export interface ResourceEndpointDescriptor {
  readonly scope: 'global' | 'perPlayer';
  readonly varName: string;
  readonly player?: PlayerId;
}

export interface ResourceTransferDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'resourceTransfer';
  readonly from: ResourceEndpointDescriptor;
  readonly to: ResourceEndpointDescriptor;
  readonly requestedAmount: number;
  readonly actualAmount: number;
  readonly sourceAvailable: number;
  readonly destinationHeadroom: number;
  readonly minAmount?: number;
  readonly maxAmount?: number;
}

export interface PhaseTransitionDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'phaseTransition';
  readonly eventType: 'phaseEnter' | 'phaseExit' | 'turnStart' | 'turnEnd';
  readonly phase?: string;
}

export interface SkippedDescriptor {
  readonly kind: 'skipped';
  readonly traceKind: 'forEach' | 'reduce';
}

export type AnimationDescriptor =
  | MoveTokenDescriptor
  | CreateTokenDescriptor
  | DestroyTokenDescriptor
  | SetTokenPropDescriptor
  | VarChangeDescriptor
  | ResourceTransferDescriptor
  | PhaseTransitionDescriptor
  | SkippedDescriptor;

export const ANIMATION_DESCRIPTOR_KINDS = [
  'moveToken',
  'createToken',
  'destroyToken',
  'setTokenProp',
  'varChange',
  'resourceTransfer',
  'phaseTransition',
  'skipped',
] as const;

export type AnimationDescriptorKind = (typeof ANIMATION_DESCRIPTOR_KINDS)[number];
