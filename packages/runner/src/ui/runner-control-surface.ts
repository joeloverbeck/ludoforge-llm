import type { AnimationDetailLevel, AnimationPlaybackSpeed } from '../animation/animation-types.js';

export type RunnerControlKind = 'segmented' | 'select' | 'toggle' | 'action';

export interface RunnerControlOption<TValue extends string = string> {
  readonly value: TValue;
  readonly label: string;
  readonly description?: string;
}

interface RunnerControlBase {
  readonly id: string;
  readonly label: string;
  readonly kind: RunnerControlKind;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
}

export interface RunnerSegmentedControlDescriptor<TValue extends string = string> extends RunnerControlBase {
  readonly kind: 'segmented';
  readonly value: TValue;
  readonly options: readonly RunnerControlOption<TValue>[];
  onSelect(value: TValue): void;
}

export interface RunnerSelectControlDescriptor<TValue extends string = string> extends RunnerControlBase {
  readonly kind: 'select';
  readonly value: TValue;
  readonly options: readonly RunnerControlOption<TValue>[];
  onSelect(value: TValue): void;
}

export interface RunnerToggleControlDescriptor extends RunnerControlBase {
  readonly kind: 'toggle';
  readonly checked: boolean;
  onToggle(checked: boolean): void;
}

export interface RunnerActionControlDescriptor extends RunnerControlBase {
  readonly kind: 'action';
  onSelect(): void;
}

export type RunnerControlDescriptor =
  | RunnerSegmentedControlDescriptor
  | RunnerSelectControlDescriptor
  | RunnerToggleControlDescriptor
  | RunnerActionControlDescriptor;

export interface RunnerControlSection {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly RunnerControlDescriptor[];
}

export interface RunnerControlSurfaceState {
  readonly animationPlaying: boolean;
  readonly animationPaused: boolean;
  readonly animationPlaybackSpeed: AnimationPlaybackSpeed;
  readonly aiPlaybackDetailLevel: AnimationDetailLevel;
  readonly aiPlaybackAutoSkip: boolean;
}

export interface RunnerControlSurfaceActions {
  setAnimationPlaybackSpeed(speed: AnimationPlaybackSpeed): void;
  setAnimationPaused(paused: boolean): void;
  requestAnimationSkipCurrent(): void;
  setAiPlaybackDetailLevel(level: AnimationDetailLevel): void;
  setAiPlaybackAutoSkip(enabled: boolean): void;
}

export interface RunnerControlSurfaceDiagnostics {
  readonly available: boolean;
  download(): void;
}

export interface RunnerControlSurfaceOptions {
  readonly diagnostics?: RunnerControlSurfaceDiagnostics;
}

const PLAYBACK_SPEED_OPTIONS: readonly RunnerControlOption<AnimationPlaybackSpeed>[] = [
  { value: '1x', label: '1x' },
  { value: '2x', label: '2x' },
  { value: '4x', label: '4x' },
] as const;

const AI_DETAIL_OPTIONS: readonly RunnerControlOption<AnimationDetailLevel>[] = [
  { value: 'full', label: 'Full' },
  { value: 'standard', label: 'Standard' },
  { value: 'minimal', label: 'Minimal' },
] as const;

export function buildRunnerControlSections(
  state: RunnerControlSurfaceState,
  actions: RunnerControlSurfaceActions,
  options: RunnerControlSurfaceOptions = {},
): readonly RunnerControlSection[] {
  const diagnosticsAvailable = options.diagnostics?.available === true;

  return [
    {
      id: 'playback',
      label: 'Playback',
      controls: [
        {
          id: 'speed',
          label: 'Animation speed',
          kind: 'segmented',
          value: state.animationPlaybackSpeed,
          options: PLAYBACK_SPEED_OPTIONS,
          onSelect: actions.setAnimationPlaybackSpeed,
        },
        {
          id: 'pause-toggle',
          label: state.animationPaused ? 'Resume' : 'Pause',
          kind: 'action',
          disabled: !state.animationPlaying,
          onSelect: () => {
            actions.setAnimationPaused(!state.animationPaused);
          },
        },
        {
          id: 'skip-current',
          label: 'Skip',
          kind: 'action',
          disabled: !state.animationPlaying,
          onSelect: actions.requestAnimationSkipCurrent,
        },
      ],
    },
    {
      id: 'ai-playback',
      label: 'AI Playback',
      controls: [
        {
          id: 'ai-detail-level',
          label: 'AI Detail',
          kind: 'select',
          value: state.aiPlaybackDetailLevel,
          options: AI_DETAIL_OPTIONS,
          onSelect: actions.setAiPlaybackDetailLevel,
        },
        {
          id: 'ai-auto-skip',
          label: 'AI Auto-Skip',
          kind: 'toggle',
          checked: state.aiPlaybackAutoSkip,
          onToggle: actions.setAiPlaybackAutoSkip,
        },
      ],
    },
    {
      id: 'diagnostics',
      label: 'Diagnostics',
      controls: [
        {
          id: 'download-log',
          label: 'Download Log',
          kind: 'action',
          hidden: !diagnosticsAvailable,
          onSelect: diagnosticsAvailable
            ? () => {
              options.diagnostics?.download();
            }
            : () => {},
        },
      ],
    },
  ];
}
