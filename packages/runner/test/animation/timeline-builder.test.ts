import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimationDescriptor } from '../../src/animation/animation-types';
import type { GsapLike } from '../../src/animation/gsap-setup';
import { createPresetRegistry, type AnimationPresetDefinition } from '../../src/animation/preset-registry';
import { buildTimeline, type TimelineSpriteRefs } from '../../src/animation/timeline-builder';

function createRuntimeFixture(): {
  readonly gsap: GsapLike;
  readonly timeline: { readonly add: ReturnType<typeof vi.fn> };
  readonly timelineFactory: ReturnType<typeof vi.fn>;
} {
  const timeline = {
    add: vi.fn(),
  };
  const timelineFactory = vi.fn(() => timeline);
  return {
    gsap: {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: timelineFactory,
    },
    timeline,
    timelineFactory,
  };
}

function createSpriteRefs(overrides: Partial<TimelineSpriteRefs> = {}): TimelineSpriteRefs {
  const base: TimelineSpriteRefs = {
    tokenContainers: new Map([
      ['tok:1', new Container()],
      ['tok:2', new Container()],
    ]),
    zoneContainers: new Map([
      ['zone:a', new Container()],
      ['zone:b', new Container()],
    ]),
    zonePositions: {
      positions: new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 100, y: 50 }],
      ]),
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 50,
      },
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTimeline', () => {
  it('builds sequential descriptors in order and prepends pulse for triggered effects', () => {
    const runtime = createRuntimeFixture();

    const calls: string[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: () => calls.push('move'),
      },
      {
        id: 'pulse',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['moveToken'],
        createTween: () => calls.push('pulse'),
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: true,
      },
      {
        kind: 'skipped',
        traceKind: 'forEach',
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:2',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    const timeline = buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(timeline).toBe(runtime.timeline);
    expect(runtime.timelineFactory).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['pulse', 'move', 'move']);
  });

  it('warns and skips descriptors with missing sprite references', () => {
    const runtime = createRuntimeFixture();

    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: moveTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'missing-token',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(moveTween).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('token container not found');
  });

  it('catches per-descriptor tween failures and continues subsequent descriptors', () => {
    const runtime = createRuntimeFixture();

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (descriptor) => {
          if (descriptor.kind === 'moveToken' && descriptor.tokenId === 'tok:1') {
            throw new Error('boom');
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:2',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Animation tween generation failed');
  });
});
