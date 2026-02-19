import { describe, expect, it, vi } from 'vitest';

import {
  createNoopGsapRuntime,
  initializeAnimationRuntime,
} from '../../src/animation/bootstrap-runtime';
import { getGsapRuntime, resetGsapRuntimeForTests, type GsapRuntime } from '../../src/animation/gsap-setup';

function createRuntimeFixture(): {
  readonly runtime: GsapRuntime;
  readonly registerPlugin: ReturnType<typeof vi.fn>;
  readonly defaults: ReturnType<typeof vi.fn>;
} {
  const registerPlugin = vi.fn();
  const defaults = vi.fn();
  return {
    runtime: {
      gsap: {
        registerPlugin,
        defaults,
        timeline: vi.fn(() => ({
          add: vi.fn(),
          eventCallback: vi.fn(),
          progress: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          play: vi.fn(),
          timeScale: vi.fn(),
          kill: vi.fn(),
        })),
      },
      PixiPlugin: { name: 'PixiPlugin' },
    },
    registerPlugin,
    defaults,
  };
}

describe('animation bootstrap runtime', () => {
  it('configures provided runtime once and returns configured gsap on subsequent calls', () => {
    resetGsapRuntimeForTests();
    const fixture = createRuntimeFixture();

    const first = initializeAnimationRuntime({ runtime: fixture.runtime });
    const second = initializeAnimationRuntime();

    expect(first).toBe(fixture.runtime.gsap);
    expect(second).toBe(getGsapRuntime());
    expect(second).toBe(fixture.runtime.gsap);
    expect(fixture.registerPlugin).toHaveBeenCalledTimes(1);
    expect(fixture.defaults).toHaveBeenCalledTimes(1);
  });

  it('noop runtime timeline auto-completes after onComplete registration', async () => {
    resetGsapRuntimeForTests();
    initializeAnimationRuntime({ runtime: createNoopGsapRuntime() });

    const timeline = getGsapRuntime().timeline();
    const onComplete = vi.fn();

    timeline.eventCallback?.('onComplete', onComplete);
    await Promise.resolve();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
