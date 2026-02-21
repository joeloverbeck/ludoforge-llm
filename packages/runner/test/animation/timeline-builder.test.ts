import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AnimationDescriptor,
  AnimationSequencingPolicy,
  VisualAnimationDescriptorKind,
} from '../../src/animation/animation-types';
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

  it('throws on missing sprite references during normal play', () => {
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

    expect(() => buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap)).toThrow(
      /Missing sprite reference for animation descriptor "cardDeal": token container not found \(tokenId=missing-token\)/,
    );
    expect(moveTween).not.toHaveBeenCalled();
  });

  it('skips orphaned zoneHighlight when its source descriptor was skipped during setup trace', () => {
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

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      spriteValidation: 'permissive',
    });

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

  it('throws for cardFlip descriptors when token container is missing during normal play', () => {
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

    expect(() => buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap)).toThrow(
      /Missing sprite reference for animation descriptor "cardFlip": token container not found \(tokenId=missing-token\)/,
    );
    expect(flipTween).not.toHaveBeenCalled();
  });

  it('throws for zoneHighlight descriptors when zone container is missing during normal play', () => {
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

    expect(() => buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap)).toThrow(
      /Missing sprite reference for animation descriptor "zoneHighlight": zone container not found \(zoneId=missing-zone\)/,
    );
    expect(zoneTween).not.toHaveBeenCalled();
  });

  it('skips all consecutive zone highlights after a skipped source during setup trace', () => {
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

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      spriteValidation: 'permissive',
    });

    // Both zone highlights should be suppressed — not just the first one
    expect(zoneTween).not.toHaveBeenCalled();
    expect(moveTween).not.toHaveBeenCalled();
  });

  it('resets skip flag on next non-zoneHighlight descriptor after skipped source during setup trace', () => {
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

    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      spriteValidation: 'permissive',
    });

    // The valid moveToken and its zone highlight should fire
    expect(moveTween).toHaveBeenCalledTimes(1);
    expect(zoneTween).toHaveBeenCalledTimes(1);
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
      spriteValidation: 'permissive',
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
      spriteValidation: 'permissive',
      initializeTokenVisibility: true,
    });

    // Alpha should still be 1 — setTokenProp is not affected by prepareTokensForAnimation
    expect(alphaValues).toEqual([1]);
  });

  it('does not warn for missing sprite references during setup trace', () => {
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
    buildTimeline(descriptors, createPresetRegistry(defs), createSpriteRefs(), runtime.gsap, {
      spriteValidation: 'permissive',
    });

    // During setup-style permissive validation, missing containers are expected — no warning
    expect(warn).not.toHaveBeenCalled();
    // Descriptor should still be filtered out (no tween created)
    expect(moveTween).not.toHaveBeenCalled();
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
});
