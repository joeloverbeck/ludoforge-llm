import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GSAP_CONFIG,
  configureGsapRuntime,
  getGsapRuntime,
  isGsapRuntimeConfigured,
  resetGsapRuntimeForTests,
  type GsapRuntime,
} from '../../src/animation/gsap-setup';

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
      },
      PixiPlugin: { name: 'PixiPlugin' },
    },
    registerPlugin,
    defaults,
  };
}

describe('gsap-setup', () => {
  it('throws when reading gsap runtime before configure', () => {
    resetGsapRuntimeForTests();
    expect(() => getGsapRuntime()).toThrowError('GSAP runtime has not been configured.');
  });

  it('registers PixiPlugin and defaults once', () => {
    resetGsapRuntimeForTests();
    const fixture = createRuntimeFixture();

    expect(isGsapRuntimeConfigured()).toBe(false);
    const configured = configureGsapRuntime(fixture.runtime);

    expect(isGsapRuntimeConfigured()).toBe(true);
    expect(configured).toBe(fixture.runtime.gsap);
    expect(getGsapRuntime()).toBe(fixture.runtime.gsap);
    expect(fixture.registerPlugin).toHaveBeenCalledTimes(1);
    expect(fixture.registerPlugin).toHaveBeenCalledWith(fixture.runtime.PixiPlugin);
    expect(fixture.defaults).toHaveBeenCalledTimes(1);
    expect(fixture.defaults).toHaveBeenCalledWith(DEFAULT_GSAP_CONFIG);
  });

  it('is idempotent for repeated configure calls with the same runtime', () => {
    resetGsapRuntimeForTests();
    const fixture = createRuntimeFixture();

    configureGsapRuntime(fixture.runtime);
    configureGsapRuntime(fixture.runtime);

    expect(fixture.registerPlugin).toHaveBeenCalledTimes(1);
    expect(fixture.defaults).toHaveBeenCalledTimes(1);
  });

  it('fails fast when configured twice with different runtime instances', () => {
    resetGsapRuntimeForTests();
    const first = createRuntimeFixture();
    const second = createRuntimeFixture();

    configureGsapRuntime(first.runtime);

    expect(() => configureGsapRuntime(second.runtime)).toThrowError(
      'GSAP runtime already configured with a different instance.',
    );
  });
});

