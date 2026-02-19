import {
  configureGsapRuntime,
  getGsapRuntime,
  isGsapRuntimeConfigured,
  type GsapLike,
  type GsapRuntime,
  type GsapTimelineLike,
} from './gsap-setup.js';

interface InternalNoopTimeline extends GsapTimelineLike {
  eventCallback(event: 'onComplete', callback: (() => void) | null): InternalNoopTimeline;
  progress(value: number): InternalNoopTimeline;
  pause(): InternalNoopTimeline;
  resume(): InternalNoopTimeline;
  play(): InternalNoopTimeline;
  timeScale(value: number): InternalNoopTimeline;
  kill(): InternalNoopTimeline;
}

export interface AnimationRuntimeBootstrapOptions {
  readonly runtime?: GsapRuntime;
}

export function initializeAnimationRuntime(options: AnimationRuntimeBootstrapOptions = {}): GsapLike {
  if (isGsapRuntimeConfigured()) {
    return getGsapRuntime();
  }

  const runtime = options.runtime ?? createNoopGsapRuntime();
  return configureGsapRuntime(runtime);
}

export function createNoopGsapRuntime(): GsapRuntime {
  const gsap: GsapLike = {
    registerPlugin: () => {
      // No-op runtime for deterministic initialization before real GSAP/Pixi wiring lands.
    },
    defaults: () => {
      // No-op runtime for deterministic initialization before real GSAP/Pixi wiring lands.
    },
    timeline: () => createNoopTimeline(),
  };

  return {
    gsap,
    PixiPlugin: { name: 'NoopPixiPlugin' },
  };
}

function createNoopTimeline(): InternalNoopTimeline {
  let onComplete: (() => void) | null = null;
  let destroyed = false;
  let paused = false;
  let completionQueued = false;
  let completed = false;

  const complete = (): void => {
    if (destroyed || completed) {
      return;
    }
    completed = true;
    const callback = onComplete;
    onComplete = null;
    callback?.();
  };

  const queueCompletion = (): void => {
    if (destroyed || paused || completed || onComplete === null || completionQueued) {
      return;
    }

    completionQueued = true;
    queueMicrotask(() => {
      completionQueued = false;
      complete();
    });
  };

  const timeline: InternalNoopTimeline = {
    add: () => timeline,
    eventCallback: (_event, callback) => {
      onComplete = callback;
      if (callback !== null) {
        queueCompletion();
      }
      return timeline;
    },
    progress: (value) => {
      if (value >= 1) {
        complete();
      }
      return timeline;
    },
    pause: () => {
      paused = true;
      return timeline;
    },
    resume: () => {
      paused = false;
      queueCompletion();
      return timeline;
    },
    play: () => {
      paused = false;
      queueCompletion();
      return timeline;
    },
    timeScale: () => timeline,
    kill: () => {
      destroyed = true;
      onComplete = null;
      return timeline;
    },
  };

  return timeline;
}
