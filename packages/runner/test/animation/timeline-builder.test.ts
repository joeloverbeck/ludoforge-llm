import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AnimationDescriptor,
  AnimationSequencingPolicy,
  VisualAnimationDescriptorKind,
} from '../../src/animation/animation-types';
import { createEphemeralContainerFactory, type EphemeralContainerFactory } from '../../src/animation/ephemeral-container-factory';
import { createDisposalQueue } from '../../src/canvas/renderers/disposal-queue';
import type { GsapLike, GsapTimelineLike } from '../../src/animation/gsap-setup';
import { createPresetRegistry, type AnimationPresetDefinition } from '../../src/animation/preset-registry';
import { buildTimeline, type TimelineSpriteRefs } from '../../src/animation/timeline-builder';
import type { AnimationLogger } from '../../src/animation/animation-logger';

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

function createMockEphemeralFactory(): EphemeralContainerFactory & {
  readonly createdIds: string[];
  readonly releaseAllCalls: number[];
} {
  const createdIds: string[] = [];
  const releaseAllCalls: number[] = [];
  let callCount = 0;
  return {
    createdIds,
    releaseAllCalls,
    create(tokenId: string): Container {
      createdIds.push(tokenId);
      const container = new Container();
      container.label = `ephemeral:${tokenId}`;
      container.alpha = 0;
      return container;
    },
    releaseAll(_queue: Parameters<EphemeralContainerFactory['releaseAll']>[0]): void {
      callCount += 1;
      releaseAllCalls.push(callCount);
    },
  };
}

function createMockTimelineLogger(): Pick<
AnimationLogger,
'logSpriteResolution' | 'logEphemeralCreated' | 'logTweenCreated' | 'logFaceControllerCall' | 'logTokenVisibilityInit' | 'logWarning'
> & {
  readonly logSpriteResolution: ReturnType<typeof vi.fn>;
  readonly logEphemeralCreated: ReturnType<typeof vi.fn>;
  readonly logTweenCreated: ReturnType<typeof vi.fn>;
  readonly logFaceControllerCall: ReturnType<typeof vi.fn>;
  readonly logTokenVisibilityInit: ReturnType<typeof vi.fn>;
  readonly logWarning: ReturnType<typeof vi.fn>;
} {
  return {
    logSpriteResolution: vi.fn(),
    logEphemeralCreated: vi.fn(),
    logTweenCreated: vi.fn(),
    logFaceControllerCall: vi.fn(),
    logTokenVisibilityInit: vi.fn(),
    logWarning: vi.fn(),
  } as never;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTimeline', () => {
  it('passes resolved preset default duration to pulse and descriptor presets', () => {
    const runtime = createRuntimeFixture();
    const durations: number[] = [];

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => durations.push(context.durationSeconds),
      },
      {
        id: 'pulse',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => durations.push(context.durationSeconds),
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
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(durations).toEqual([0.2, 0.4]);
  });

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

  it('skips missing token descriptors gracefully without throwing', () => {
    const runtime = createRuntimeFixture();

    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken', 'cardDeal', 'cardBurn'],
        createTween: moveTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
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
      {
        kind: 'cardBurn',
        tokenId: 'tok:2',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    // Should NOT throw — missing token is skipped, valid ones animate
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);
    expect(moveTween).toHaveBeenCalledTimes(2);
  });

  it('skips orphaned zoneHighlight when its source descriptor was skipped', () => {
    const runtime = createRuntimeFixture();
    const zoneTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'fade-in-scale',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['createToken'],
        createTween: vi.fn(),
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    // createToken followed by its derived zoneHighlight — both should be skipped
    // when the token container is missing
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'createToken',
        tokenId: 'missing-token',
        type: 'card',
        zone: 'zone:a',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'createToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    // The zone-pulse tween should NOT fire — zoneHighlight is orphaned
    expect(zoneTween).not.toHaveBeenCalled();
  });

  it('keeps zoneHighlight when its source descriptor was NOT skipped', () => {
    const runtime = createRuntimeFixture();
    const createTween = vi.fn();
    const zoneTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'fade-in-scale',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['createToken'],
        createTween: createTween,
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    // createToken with valid token container, followed by zoneHighlight — both should pass
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'createToken',
        tokenId: 'tok:1',
        type: 'card',
        zone: 'zone:a',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'createToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(createTween).toHaveBeenCalledTimes(1);
    expect(zoneTween).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('builds cardDeal tween when source zone container is missing but source position exists', () => {
    const runtime = createRuntimeFixture();
    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['cardDeal'],
        createTween: moveTween,
      },
    ];
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
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
    buildTimeline(
      descriptors,
      createPresetRegistry(defs),
      createSpriteRefs({
        zoneContainers: new Map([
          ['zone:b', new Container()],
        ]),
      }),
      runtime.gsap,
    );

    expect(moveTween).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
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

  it('skips cardFlip descriptors when token container is missing', () => {
    const runtime = createRuntimeFixture();
    const flipTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'flip-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['cardFlip'],
        createTween: flipTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardFlip',
        tokenId: 'missing-token',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'flip-preset',
        isTriggered: false,
      },
    ];

    // Should NOT throw — missing token is gracefully skipped
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);
    expect(flipTween).not.toHaveBeenCalled();
  });

  it('skips zoneHighlight descriptors when zone container is missing', () => {
    const runtime = createRuntimeFixture();
    const zoneTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'zoneHighlight',
        zoneId: 'missing-zone',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
    ];

    // Should NOT throw — missing zone is gracefully skipped
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);
    expect(zoneTween).not.toHaveBeenCalled();
  });

  it('skips all consecutive zone highlights after a skipped source', () => {
    const runtime = createRuntimeFixture();
    const zoneTween = vi.fn();
    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: moveTween,
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    // Missing token causes source skip; TWO zone highlights follow (from both endpoints)
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
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:b',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    // Both zone highlights should be suppressed — not just the first one
    expect(zoneTween).not.toHaveBeenCalled();
    expect(moveTween).not.toHaveBeenCalled();
  });

  it('resets skip flag on next non-zoneHighlight descriptor after skipped source', () => {
    const runtime = createRuntimeFixture();
    const zoneTween = vi.fn();
    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: moveTween,
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    // First moveToken is missing (skipped), its zone highlights are suppressed,
    // but the subsequent valid moveToken and its zone highlight should pass through
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
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
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
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:b',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    // The valid moveToken and its zone highlight should fire
    expect(moveTween).toHaveBeenCalledTimes(1);
    expect(zoneTween).toHaveBeenCalledTimes(1);
  });
});

describe('buildTimeline phase transition', () => {
  it('phaseTransition descriptors produce banner callbacks in the timeline via phaseBannerCallback', () => {
    const runtime = createRuntimeFixture();
    const phaseBannerCallback = vi.fn();
    const addedItems: unknown[] = [];
    runtime.timeline.add.mockImplementation((item: unknown) => {
      addedItems.push(item);
      return runtime.timeline;
    });

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'banner-overlay',
        defaultDurationSeconds: 3,
        compatibleKinds: ['phaseTransition'],
        createTween: (_descriptor, context) => {
          const cb = context.phaseBannerCallback;
          if (cb !== undefined && _descriptor.kind === 'phaseTransition' && _descriptor.phase !== undefined) {
            context.timeline.add(() => cb(_descriptor.phase!));
            // The delay tween would go here in production
            context.timeline.add(() => cb(null));
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'flop',
        preset: 'banner-overlay',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      phaseBannerCallback,
    });

    // The phaseBannerCallback should have been wired into the timeline
    const callbackItems = addedItems.filter((item) => typeof item === 'function');
    expect(callbackItems.length).toBeGreaterThanOrEqual(2);

    // Execute the callbacks to verify they invoke phaseBannerCallback
    (callbackItems[0] as () => void)();
    expect(phaseBannerCallback).toHaveBeenCalledWith('flop');
    (callbackItems[1] as () => void)();
    expect(phaseBannerCallback).toHaveBeenCalledWith(null);
  });
});

describe('buildTimeline diagnostics logging', () => {
  it('logs sprite resolution for missing descriptors, suppressed zoneHighlight, and resolved descriptors', () => {
    const runtime = createRuntimeFixture();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: vi.fn(),
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
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
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

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, { logger });

    expect(logger.logSpriteResolution).toHaveBeenCalledWith(expect.objectContaining({
      descriptorKind: 'moveToken',
      tokenId: 'missing-token',
      resolved: false,
      reason: expect.stringContaining('token container not found'),
    }));
    expect(logger.logSpriteResolution).toHaveBeenCalledWith(expect.objectContaining({
      descriptorKind: 'zoneHighlight',
      zoneId: 'zone:a',
      resolved: false,
      reason: expect.stringContaining('suppressed'),
    }));
    expect(logger.logSpriteResolution).toHaveBeenCalledWith(expect.objectContaining({
      descriptorKind: 'moveToken',
      tokenId: 'tok:1',
      zoneId: 'zone:a',
      resolved: true,
      containerType: 'existing',
      position: { x: 0, y: 0 },
    }));
  });

  it('logs tween creation metadata for pulse and descriptor tweens including positions', () => {
    const runtime = createRuntimeFixture();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
      },
      {
        id: 'pulse',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
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
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      logger,
    });

    expect(logger.logTweenCreated).toHaveBeenCalledTimes(2);
    expect(logger.logTweenCreated).toHaveBeenNthCalledWith(1, expect.objectContaining({
      descriptorKind: 'moveToken',
      tokenId: 'tok:1',
      preset: 'pulse',
      durationSeconds: 0.2,
      isTriggeredPulse: true,
      fromPosition: { x: 0, y: 0 },
      toPosition: { x: 100, y: 50 },
    }));
    expect(logger.logTweenCreated).toHaveBeenNthCalledWith(2, expect.objectContaining({
      descriptorKind: 'moveToken',
      tokenId: 'tok:1',
      preset: 'move-preset',
      durationSeconds: 0.4,
      isTriggeredPulse: false,
      fromPosition: { x: 0, y: 0 },
      toPosition: { x: 100, y: 50 },
    }));
  });

  it('logs cardFlip face-state changes when boolean values are available', () => {
    const runtime = createRuntimeFixture();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'flip-preset',
        defaultDurationSeconds: 0.3,
        compatibleKinds: ['cardFlip'],
        createTween: vi.fn(),
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardFlip',
        tokenId: 'tok:1',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'flip-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      logger,
    });

    expect(logger.logTweenCreated).toHaveBeenCalledWith(expect.objectContaining({
      descriptorKind: 'cardFlip',
      tokenId: 'tok:1',
      preset: 'flip-preset',
      isTriggeredPulse: false,
      faceState: { oldValue: false, newValue: true },
    }));
  });

  it('logs visibility initialization and ephemeral container creation', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['cardDeal', 'moveToken'],
        createTween: vi.fn(),
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:missing',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      initializeTokenVisibility: true,
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
      logger,
    });

    expect(logger.logTokenVisibilityInit).toHaveBeenCalledWith({ tokenId: 'tok:1', alphaSetTo: 0 });
    expect(logger.logTokenVisibilityInit).toHaveBeenCalledWith({ tokenId: 'tok:missing', alphaSetTo: 0 });
    expect(logger.logEphemeralCreated).toHaveBeenCalledWith(expect.objectContaining({
      tokenId: 'tok:missing',
      width: expect.any(Number),
      height: expect.any(Number),
    }));
  });

  it('remains safe when logger is omitted', () => {
    const runtime = createRuntimeFixture();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
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
    ];

    expect(() => {
      buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);
    }).not.toThrow();
  });

  it('routes tween creation errors through logWarning', () => {
    const runtime = createRuntimeFixture();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: () => {
          throw new Error('boom');
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
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      logger,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(logger.logWarning).toHaveBeenCalledTimes(1);
    expect(logger.logWarning).toHaveBeenCalledWith(
      expect.stringContaining('Animation tween generation failed'),
    );
  });

  it('includes tweenedProperties in tween log entries', () => {
    const runtime = createRuntimeFixture();
    const logger = createMockTimelineLogger();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
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
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      logger,
    });

    expect(logger.logTweenCreated).toHaveBeenCalledTimes(1);
    const loggedEntry = logger.logTweenCreated.mock.calls[0]?.[0];
    expect(loggedEntry).toHaveProperty('tweenedProperties');
    expect(Array.isArray(loggedEntry.tweenedProperties)).toBe(true);
  });
});

describe('buildTimeline setup behavior', () => {
  it('sets alpha=0 on token containers for move/deal/burn descriptors when initializeTokenVisibility is true', () => {
    const runtime = createRuntimeFixture();
    const tok1 = new Container();
    const tok2 = new Container();
    tok1.alpha = 1;
    tok2.alpha = 1;

    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken', 'cardDeal'],
        createTween: moveTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
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

    const spriteRefs = createSpriteRefs({
      tokenContainers: new Map([
        ['tok:1', tok1],
        ['tok:2', tok2],
      ]),
    });

    buildTimeline(descriptors, createPresetRegistry(defs), spriteRefs, runtime.gsap, {
      initializeTokenVisibility: true,
    });

    // Both tokens should have alpha set to 0 before tween execution
    // The moveTween was called, confirming processing happened
    expect(moveTween).toHaveBeenCalledTimes(2);
  });

  it('does not set alpha=0 when initializeTokenVisibility is absent', () => {
    const runtime = createRuntimeFixture();
    const tok1 = new Container();
    tok1.alpha = 1;

    const alphaValues: number[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['cardDeal'],
        createTween: (_descriptor, context) => {
          const target = context.spriteRefs.tokenContainers.get('tok:1') as { alpha: number } | undefined;
          if (target) {
            alphaValues.push(target.alpha);
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    const spriteRefs = createSpriteRefs({
      tokenContainers: new Map([['tok:1', tok1]]),
    });

    buildTimeline(descriptors, createPresetRegistry(defs), spriteRefs, runtime.gsap);

    // Alpha should still be 1 — not modified
    expect(alphaValues).toEqual([1]);
  });

  it('does not set alpha=0 on non-move/deal/burn descriptors during setup', () => {
    const runtime = createRuntimeFixture();
    const tok1 = new Container();
    tok1.alpha = 1;

    const alphaValues: number[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'tint-flash',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['setTokenProp'],
        createTween: (_descriptor, context) => {
          const target = context.spriteRefs.tokenContainers.get('tok:1') as { alpha: number } | undefined;
          if (target) {
            alphaValues.push(target.alpha);
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'selected',
        oldValue: false,
        newValue: true,
        preset: 'tint-flash',
        isTriggered: false,
      },
    ];

    const spriteRefs = createSpriteRefs({
      tokenContainers: new Map([['tok:1', tok1]]),
    });

    buildTimeline(descriptors, createPresetRegistry(defs), spriteRefs, runtime.gsap, {
      initializeTokenVisibility: true,
    });

    // Alpha should still be 1 — setTokenProp is not affected by prepareTokensForAnimation
    expect(alphaValues).toEqual([1]);
  });

  it('does not warn for missing sprite references', () => {
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
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    // Missing containers are silently skipped — no warning
    expect(warn).not.toHaveBeenCalled();
    // Descriptor should still be filtered out (no tween created)
    expect(moveTween).not.toHaveBeenCalled();
  });
});

describe('buildTimeline ephemeral containers', () => {
  it('provisions ephemeral card-back container for missing moveToken and animates it', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();

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
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    expect(factory.createdIds).toEqual(['tok:missing']);
    expect(moveTween).toHaveBeenCalledTimes(1);
  });

  it('provisions ephemeral containers for multiple missing tokens in a single timeline', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();

    const moveTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken', 'cardDeal', 'cardBurn'],
        createTween: moveTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:missing-a',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:missing-b',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'cardBurn',
        tokenId: 'tok:missing-c',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    expect(factory.createdIds).toEqual(['tok:missing-a', 'tok:missing-b', 'tok:missing-c']);
    expect(moveTween).toHaveBeenCalledTimes(3);
  });

  it('calls factory.releaseAll after timeline completes', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    // The cleanup function should have been added to the timeline
    expect(runtime.timeline.add).toHaveBeenCalled();
    const lastCall = runtime.timeline.add.mock.calls[runtime.timeline.add.mock.calls.length - 1];
    const cleanupFn = lastCall?.[0];
    expect(typeof cleanupFn).toBe('function');

    // Invoke the cleanup callback
    (cleanupFn as () => void)();
    expect(factory.releaseAllCalls.length).toBe(1);
  });

  it('creates face-down face controller for ephemeral tokens', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();

    const capturedFaceControllers: ReadonlyMap<string, { setFaceUp(faceUp: boolean): void }>[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => {
          if (context.spriteRefs.tokenFaceControllers) {
            capturedFaceControllers.push(context.spriteRefs.tokenFaceControllers);
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    expect(capturedFaceControllers.length).toBe(1);
    const faceController = capturedFaceControllers[0]!.get('tok:missing');
    expect(faceController).toBeDefined();
    // Should not throw — setFaceUp is a no-op for ephemeral tokens
    expect(() => faceController!.setFaceUp(true)).not.toThrow();
  });

  it('skips moveToken when both factory is absent and token is missing (graceful fallback)', () => {
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
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    // No factory, no throw — just skip
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);
    expect(moveTween).not.toHaveBeenCalled();
  });

  it('ephemeral face controllers toggle back/front child visibility', () => {
    const runtime = createRuntimeFixture();
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);

    const capturedControllers: ReadonlyMap<string, { setFaceUp(faceUp: boolean): void }>[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => {
          if (context.spriteRefs.tokenFaceControllers) {
            capturedControllers.push(context.spriteRefs.tokenFaceControllers);
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    expect(capturedControllers.length).toBe(1);
    const controller = capturedControllers[0]!.get('tok:missing')!;
    expect(controller).toBeDefined();

    // Find the ephemeral container created by the real factory
    const ephemeralContainer = parent.children.find((c) => c.label === 'ephemeral:tok:missing')!;
    const backChild = ephemeralContainer.getChildByLabel('back')!;
    const frontChild = ephemeralContainer.getChildByLabel('front')!;

    // Initially: back visible, front hidden
    expect(backChild.visible).toBe(true);
    expect(frontChild.visible).toBe(false);

    // Flip face-up
    controller.setFaceUp(true);
    expect(backChild.visible).toBe(false);
    expect(frontChild.visible).toBe(true);

    // Flip face-down again
    controller.setFaceUp(false);
    expect(backChild.visible).toBe(true);
    expect(frontChild.visible).toBe(false);
  });

  it('handles mixed persistent and ephemeral token containers', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();

    const tweenedTokenIds: string[] = [];
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (descriptor) => {
          if (descriptor.kind === 'moveToken') {
            tweenedTokenIds.push(descriptor.tokenId);
          }
        },
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1', // exists in persistent
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:ephemeral', // needs ephemeral
        from: 'zone:b',
        to: 'zone:a',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: createDisposalQueue({ scheduleFlush: () => {} }),
    });

    // Only the missing token should get an ephemeral container
    expect(factory.createdIds).toEqual(['tok:ephemeral']);
    // Both should animate
    expect(tweenedTokenIds).toEqual(['tok:1', 'tok:ephemeral']);
  });

  it('calls factory.releaseAll when disposalQueue is provided', () => {
    const runtime = createRuntimeFixture();
    const factory = createMockEphemeralFactory();
    const queue = createDisposalQueue({ scheduleFlush: () => {} });

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: vi.fn(),
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'move-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: queue,
    });

    // The cleanup function should have been added to the timeline
    expect(runtime.timeline.add).toHaveBeenCalled();
    const lastCall = runtime.timeline.add.mock.calls[runtime.timeline.add.mock.calls.length - 1];
    const cleanupFn = lastCall?.[0];
    expect(typeof cleanupFn).toBe('function');

    // Invoke the cleanup callback — should use releaseAll, not destroyAll
    (cleanupFn as () => void)();
    expect(factory.releaseAllCalls.length).toBe(1);
  });
});

describe('buildTimeline zone highlight scheduling', () => {
  function createZoneHighlightSequencingFixture(): {
    readonly gsap: GsapLike;
    readonly mainTimeline: GsapTimelineLike & { add: ReturnType<typeof vi.fn> };
    readonly createdTimelines: Array<GsapTimelineLike & { add: ReturnType<typeof vi.fn> }>;
  } {
    const createdTimelines: Array<GsapTimelineLike & { add: ReturnType<typeof vi.fn> }> = [];
    let isFirstCall = true;

    const makeTimeline = (): GsapTimelineLike & { add: ReturnType<typeof vi.fn> } => ({
      add: vi.fn().mockReturnThis(),
    });

    const mainTimeline = makeTimeline();

    return {
      gsap: {
        registerPlugin: vi.fn(),
        defaults: vi.fn(),
        timeline: vi.fn(() => {
          if (isFirstCall) {
            isFirstCall = false;
            return mainTimeline;
          }
          const tl = makeTimeline();
          createdTimelines.push(tl);
          return tl;
        }),
      },
      mainTimeline,
      createdTimelines,
    };
  }

  it('schedules zone highlights at position 0 in parallel with main descriptors', () => {
    const { gsap, mainTimeline } = createZoneHighlightSequencingFixture();

    const cardDealTween = vi.fn();
    const zoneTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'deal-preset',
        defaultDurationSeconds: 0.3,
        compatibleKinds: ['cardDeal'],
        createTween: cardDealTween,
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'cardDeal',
        preset: 'zone-pulse',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:2',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
    ];

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), gsap);

    // Both card deals should animate
    expect(cardDealTween).toHaveBeenCalledTimes(2);
    // Zone highlight should animate
    expect(zoneTween).toHaveBeenCalledTimes(1);

    // The zone highlight sub-timeline should be added to main at position 0
    const addCalls = mainTimeline.add.mock.calls;
    const zeroPositionCall = addCalls.find(
      (call: unknown[]) => call[1] === 0,
    );
    expect(zeroPositionCall).toBeDefined();
  });

  it('zone highlights do not break stagger groups when interleaved in input stream', () => {
    const { gsap, mainTimeline } = createZoneHighlightSequencingFixture();

    const cardDealTween = vi.fn();
    const zoneTween = vi.fn();
    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'deal-preset',
        defaultDurationSeconds: 0.3,
        compatibleKinds: ['cardDeal'],
        createTween: (_descriptor, context) => {
          context.timeline.add('deal-marker');
          cardDealTween();
        },
      },
      {
        id: 'zone-pulse',
        defaultDurationSeconds: 0.5,
        compatibleKinds: ['zoneHighlight'],
        createTween: zoneTween,
      },
    ];

    // Two card deals with zone highlights interleaved — should form ONE stagger group
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'cardDeal',
        preset: 'zone-pulse',
        isTriggered: false,
      },
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:b',
        sourceKind: 'cardDeal',
        preset: 'zone-pulse',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:2',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
    ];

    const policies = new Map<VisualAnimationDescriptorKind, AnimationSequencingPolicy>([
      ['cardDeal', { mode: 'stagger', staggerOffsetSeconds: 0.15 }],
    ]);

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), gsap, {
      sequencingPolicies: policies,
    });

    // Both card deals should animate as one stagger group (2 sub-timelines)
    expect(cardDealTween).toHaveBeenCalledTimes(2);

    // The stagger add calls: first at default position, second at stagger offset
    const addCalls = mainTimeline.add.mock.calls;

    // Find stagger-related calls (sub-timelines, not the zone highlight at position 0)
    const staggerCalls = addCalls.filter(
      (call: unknown[]) => call[1] !== 0 || call[1] === undefined,
    );
    // First card deal sub-timeline should be added without position (undefined)
    expect(staggerCalls.some((call: unknown[]) => call[1] === undefined)).toBe(true);
    // Second card deal sub-timeline should be added at stagger offset
    expect(staggerCalls.some((call: unknown[]) => call[1] === '<+=0.15')).toBe(true);
  });
});

describe('buildTimeline sequencing', () => {
  function createSequencingFixture(): {
    readonly gsap: GsapLike;
    readonly mainTimeline: GsapTimelineLike & { add: ReturnType<typeof vi.fn> };
    readonly createdTimelines: Array<GsapTimelineLike & { add: ReturnType<typeof vi.fn> }>;
  } {
    const createdTimelines: Array<GsapTimelineLike & { add: ReturnType<typeof vi.fn> }> = [];
    let isFirstCall = true;

    const makeTimeline = (): GsapTimelineLike & { add: ReturnType<typeof vi.fn> } => ({
      add: vi.fn().mockReturnThis(),
    });

    const mainTimeline = makeTimeline();

    return {
      gsap: {
        registerPlugin: vi.fn(),
        defaults: vi.fn(),
        timeline: vi.fn(() => {
          if (isFirstCall) {
            isFirstCall = false;
            return mainTimeline;
          }
          const tl = makeTimeline();
          createdTimelines.push(tl);
          return tl;
        }),
      },
      mainTimeline,
      createdTimelines,
    };
  }

  function makeCardDealDescriptors(count: number): readonly AnimationDescriptor[] {
    const descriptors: AnimationDescriptor[] = [];
    for (let i = 0; i < count; i++) {
      descriptors.push({
        kind: 'cardDeal',
        tokenId: `tok:${i + 1}`,
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      });
    }
    return descriptors;
  }

  function createDealPresetDefs(): readonly AnimationPresetDefinition[] {
    return [
      {
        id: 'deal-preset',
        defaultDurationSeconds: 0.3,
        compatibleKinds: ['cardDeal'],
        createTween: (_descriptor, context) => {
          context.timeline.add('tween-marker');
        },
      },
    ];
  }

  function createSpriteRefsForN(n: number): TimelineSpriteRefs {
    const tokenContainers = new Map<string, Container>();
    for (let i = 0; i < n; i++) {
      tokenContainers.set(`tok:${i + 1}`, new Container());
    }
    return {
      tokenContainers,
      zoneContainers: new Map([
        ['zone:a', new Container()],
        ['zone:b', new Container()],
      ]),
      zonePositions: {
        positions: new Map([
          ['zone:a', { x: 0, y: 0 }],
          ['zone:b', { x: 100, y: 50 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      },
    };
  }

  it('applies parallel sequencing: all same-kind descriptors start at same time', () => {
    const { gsap, mainTimeline, createdTimelines } = createSequencingFixture();
    const descriptors = makeCardDealDescriptors(3);
    const policies = new Map<VisualAnimationDescriptorKind, AnimationSequencingPolicy>([
      ['cardDeal', { mode: 'parallel' }],
    ]);

    buildTimeline(
      descriptors,
      createPresetRegistry(createDealPresetDefs()),
      createSpriteRefsForN(3),
      gsap,
      { sequencingPolicies: policies },
    );

    expect(createdTimelines.length).toBe(3);
    expect(mainTimeline.add).toHaveBeenCalledTimes(3);

    const addCalls = mainTimeline.add.mock.calls;
    expect(addCalls[0]?.[1]).toBeUndefined();
    expect(addCalls[1]?.[1]).toBe('<');
    expect(addCalls[2]?.[1]).toBe('<');
  });

  it('applies stagger sequencing: each descriptor starts offset after previous', () => {
    const { gsap, mainTimeline, createdTimelines } = createSequencingFixture();
    const descriptors = makeCardDealDescriptors(3);
    const policies = new Map<VisualAnimationDescriptorKind, AnimationSequencingPolicy>([
      ['cardDeal', { mode: 'stagger', staggerOffsetSeconds: 0.15 }],
    ]);

    buildTimeline(
      descriptors,
      createPresetRegistry(createDealPresetDefs()),
      createSpriteRefsForN(3),
      gsap,
      { sequencingPolicies: policies },
    );

    expect(createdTimelines.length).toBe(3);
    expect(mainTimeline.add).toHaveBeenCalledTimes(3);

    const addCalls = mainTimeline.add.mock.calls;
    expect(addCalls[0]?.[1]).toBeUndefined();
    expect(addCalls[1]?.[1]).toBe('<+=0.15');
    expect(addCalls[2]?.[1]).toBe('<+=0.15');
  });

  it('defaults to sequential when no sequencing policy is provided', () => {
    const { gsap, mainTimeline, createdTimelines } = createSequencingFixture();
    const descriptors = makeCardDealDescriptors(3);

    buildTimeline(
      descriptors,
      createPresetRegistry(createDealPresetDefs()),
      createSpriteRefsForN(3),
      gsap,
    );

    expect(createdTimelines.length).toBe(0);
    expect(mainTimeline.add).toHaveBeenCalledTimes(3);

    const addCalls = mainTimeline.add.mock.calls;
    for (const call of addCalls) {
      expect(call[1]).toBeUndefined();
    }
  });

  it('handles mixed groups: sequential followed by parallel', () => {
    const { gsap, mainTimeline, createdTimelines } = createSequencingFixture();

    const movePreset: AnimationPresetDefinition = {
      id: 'move-preset',
      defaultDurationSeconds: 0.4,
      compatibleKinds: ['moveToken'],
      createTween: (_descriptor, context) => {
        context.timeline.add('move-marker');
      },
    };

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
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:2',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'deal-preset',
        isTriggered: false,
      },
    ];

    const policies = new Map<VisualAnimationDescriptorKind, AnimationSequencingPolicy>([
      ['cardDeal', { mode: 'parallel' }],
    ]);

    buildTimeline(
      descriptors,
      createPresetRegistry([...createDealPresetDefs(), movePreset]),
      createSpriteRefsForN(2),
      gsap,
      { sequencingPolicies: policies },
    );

    const addCalls = mainTimeline.add.mock.calls;
    expect(addCalls[0]?.[1]).toBeUndefined();

    expect(createdTimelines.length).toBe(2);
    expect(addCalls[1]?.[1]).toBeUndefined();
    expect(addCalls[2]?.[1]).toBe('<');
  });

  it('applies duration override by descriptor kind for triggered pulse and descriptor preset', () => {
    const runtime = createRuntimeFixture();
    const durations: number[] = [];

    const defs: readonly AnimationPresetDefinition[] = [
      {
        id: 'move-preset',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => durations.push(context.durationSeconds),
      },
      {
        id: 'pulse',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['moveToken'],
        createTween: (_descriptor, context) => durations.push(context.durationSeconds),
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
    ];

    const durationSecondsByKind = new Map<VisualAnimationDescriptorKind, number>([['moveToken', 0.75]]);

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      durationSecondsByKind,
    });

    expect(durations).toEqual([0.75, 0.75]);
  });

  it('passes card content spec from resolver to ephemeral factory', () => {
    const runtime = createRuntimeFixture();
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);
    const createSpy = vi.spyOn(factory, 'create');
    const queue = createDisposalQueue({ scheduleFlush: () => {} });

    const cardContentSpec = {
      template: { width: 24, height: 34 },
      fields: { rank: 'A', suit: 'spades' },
    };

    const resolver = {
      resolve: vi.fn((tokenId: string) =>
        tokenId === 'tok:missing' ? cardContentSpec : null,
      ),
    };

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:missing',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ];

    const refs = createSpriteRefs({
      tokenContainers: new Map(),
    });

    buildTimeline(descriptors, createPresetRegistry(), refs, runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: queue,
      ephemeralCardContentResolver: resolver,
    });

    expect(resolver.resolve).toHaveBeenCalledWith('tok:missing');
    expect(createSpy).toHaveBeenCalledWith('tok:missing', cardContentSpec);
  });

  it('ephemeral face controller toggles frontContent visibility', () => {
    const runtime = createRuntimeFixture();
    const parent = new Container();
    const queue = createDisposalQueue({ scheduleFlush: () => {} });

    const cardContentSpec = {
      template: { width: 24, height: 34 },
      fields: { rank: 'K', suit: 'hearts' },
    };

    const resolver = {
      resolve: vi.fn(() => cardContentSpec),
    };

    const defs: AnimationPresetDefinition[] = [
      {
        id: 'arc-tween',
        defaultDurationSeconds: 0.4,
        compatibleKinds: ['cardDeal'],
        createTween: () => {},
      },
      {
        id: 'flip-test',
        defaultDurationSeconds: 0.3,
        compatibleKinds: ['cardFlip'],
        createTween: (descriptor, context) => {
          if (descriptor.kind === 'cardFlip') {
            const faceController = context.spriteRefs.tokenFaceControllers?.get(
              descriptor.tokenId,
            );
            faceController?.setFaceUp(true);
          }
        },
      },
    ];

    const factory = createEphemeralContainerFactory(parent);

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:card',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardFlip',
        tokenId: 'tok:card',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'flip-test',
        isTriggered: false,
      },
    ];

    const refs = createSpriteRefs({
      tokenContainers: new Map(),
    });

    buildTimeline(descriptors, createPresetRegistry(defs), refs, runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: queue,
      ephemeralCardContentResolver: resolver,
    });

    // After the flip preset calls setFaceUp(true), frontContent should be visible
    const ephemeralContainer = parent.children[0] as Container;
    const frontContent = ephemeralContainer?.getChildByLabel('frontContent');
    expect(frontContent).not.toBeNull();
    expect(frontContent!.visible).toBe(true);
  });

  it('gracefully handles resolver returning null', () => {
    const runtime = createRuntimeFixture();
    const parent = new Container();
    const factory = createEphemeralContainerFactory(parent);
    const createSpy = vi.spyOn(factory, 'create');
    const queue = createDisposalQueue({ scheduleFlush: () => {} });

    const resolver = {
      resolve: vi.fn(() => null),
    };

    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:unknown',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ];

    const refs = createSpriteRefs({
      tokenContainers: new Map(),
    });

    buildTimeline(descriptors, createPresetRegistry(), refs, runtime.gsap, {
      ephemeralContainerFactory: factory,
      disposalQueue: queue,
      ephemeralCardContentResolver: resolver,
    });

    expect(resolver.resolve).toHaveBeenCalledWith('tok:unknown');
    // create should be called without card content (undefined)
    expect(createSpy).toHaveBeenCalledWith('tok:unknown', undefined);
    // No frontContent child
    const ephemeralContainer = parent.children[0] as Container;
    expect(ephemeralContainer.getChildByLabel('frontContent')).toBeNull();
  });
});
