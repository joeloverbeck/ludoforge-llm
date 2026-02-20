import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimationDescriptor, AnimationSequencingPolicy } from '../../src/animation/animation-types';
import type { GsapLike, GsapTimelineLike } from '../../src/animation/gsap-setup';
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

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(moveTween).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('token container not found');
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

  it('applies missing token guard to cardFlip descriptors', () => {
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

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap);

    expect(flipTween).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('token container not found');
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
    const policies = new Map<string, AnimationSequencingPolicy>([
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
    const policies = new Map<string, AnimationSequencingPolicy>([
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

    const policies = new Map<string, AnimationSequencingPolicy>([
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
});
