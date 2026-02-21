import type { PlayerId, VariableValue } from '@ludoforge/engine/runtime';
import type { SkippedTraceKind } from '../model/effect-trace-kind-config.js';

export const ANIMATION_PRESET_IDS = [
  'arc-tween',
  'fade-in-scale',
  'fade-out-scale',
  'tint-flash',
  'card-flip-3d',
  'counter-tick',
  'banner-overlay',
  'zone-pulse',
  'pulse',
] as const;

export type BuiltinAnimationPresetId = (typeof ANIMATION_PRESET_IDS)[number];
export type AnimationPresetId = string;

export type AnimationDetailLevel = 'full' | 'standard' | 'minimal';
export type AnimationPlaybackSpeed = '1x' | '2x' | '4x';
export const ANIMATION_PRESET_OVERRIDE_KEYS = [
  'moveToken',
  'cardDeal',
  'cardBurn',
  'createToken',
  'destroyToken',
  'setTokenProp',
  'cardFlip',
  'varChange',
  'resourceTransfer',
  'phaseTransition',
  'zoneHighlight',
] as const;
export type AnimationPresetOverrideKey = (typeof ANIMATION_PRESET_OVERRIDE_KEYS)[number];

export interface AnimationMappingOptions {
  readonly presetOverrides?: ReadonlyMap<AnimationPresetOverrideKey, AnimationPresetId>;
  readonly detailLevel?: AnimationDetailLevel;
  readonly cardContext?: CardAnimationMappingContext;
  readonly suppressCreateToken?: boolean;
  readonly phaseBannerPhases?: ReadonlySet<string>;
}

export interface CardAnimationMappingContext {
  readonly cardTokenTypeIds: ReadonlySet<string>;
  readonly tokenTypeByTokenId: ReadonlyMap<string, string>;
  readonly zoneRoles: {
    readonly draw: ReadonlySet<string>;
    readonly hand: ReadonlySet<string>;
    readonly shared: ReadonlySet<string>;
    readonly burn: ReadonlySet<string>;
    readonly discard: ReadonlySet<string>;
  };
  readonly flipProps?: readonly string[];
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

export interface CardDealDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'cardDeal';
  readonly tokenId: string;
  readonly from: string;
  readonly to: string;
}

export interface CardBurnDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'cardBurn';
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

export interface CardFlipDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'cardFlip';
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

export interface ZoneHighlightDescriptor extends BaseAnimationDescriptor {
  readonly kind: 'zoneHighlight';
  readonly zoneId: string;
  readonly sourceKind: Exclude<VisualAnimationDescriptorKind, 'zoneHighlight'>;
}

export interface SkippedDescriptor {
  readonly kind: 'skipped';
  readonly traceKind: 'createToken' | SkippedTraceKind;
}

export type AnimationDescriptor =
  | MoveTokenDescriptor
  | CardDealDescriptor
  | CardBurnDescriptor
  | CreateTokenDescriptor
  | DestroyTokenDescriptor
  | SetTokenPropDescriptor
  | CardFlipDescriptor
  | VarChangeDescriptor
  | ResourceTransferDescriptor
  | PhaseTransitionDescriptor
  | ZoneHighlightDescriptor
  | SkippedDescriptor;

export const ANIMATION_DESCRIPTOR_KINDS = [
  'moveToken',
  'cardDeal',
  'cardBurn',
  'createToken',
  'destroyToken',
  'setTokenProp',
  'cardFlip',
  'varChange',
  'resourceTransfer',
  'phaseTransition',
  'zoneHighlight',
  'skipped',
] as const;

export type AnimationDescriptorKind = (typeof ANIMATION_DESCRIPTOR_KINDS)[number];
export type VisualAnimationDescriptorKind = Exclude<AnimationDescriptorKind, 'skipped'>;

export type AnimationSequencingMode = 'sequential' | 'parallel' | 'stagger';

export interface AnimationSequencingPolicy {
  readonly mode: AnimationSequencingMode;
  readonly staggerOffsetSeconds?: number;
}
