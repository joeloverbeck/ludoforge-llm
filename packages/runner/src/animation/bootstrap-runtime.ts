import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';

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

  const runtime = options.runtime ?? createDefaultGsapRuntime();
  return configureGsapRuntime(runtime);
}

function createDefaultGsapRuntime(): GsapRuntime {
  return {
    gsap: gsap as unknown as GsapLike,
    PixiPlugin: PixiPlugin as unknown as { readonly name?: string },
  };
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
    to: (target, vars) => {
      applyTweenVars(target as Record<string, unknown>, vars);
      return {};
    },
  };

  return {
    gsap,
    PixiPlugin: { name: 'NoopPixiPlugin' },
  };
}

function applyTweenVars(
  target: Record<string, unknown>,
  vars: Record<string, unknown> & { readonly duration?: number },
): void {
  for (const [key, value] of Object.entries(vars)) {
    if (key === 'duration' || key === 'ease' || key === 'overwrite' || key === 'repeat' || key === 'yoyo') {
      continue;
    }

    if (key === 'scale' && typeof value === 'number') {
      const scale = target.scale as { set?: (x: number, y?: number) => void; x?: number; y?: number } | undefined;
      if (scale?.set !== undefined) {
        scale.set(value, value);
      } else if (scale !== undefined) {
        scale.x = value;
        scale.y = value;
      } else {
        target.scale = { x: value, y: value };
      }
      continue;
    }

    target[key] = value;
  }
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
