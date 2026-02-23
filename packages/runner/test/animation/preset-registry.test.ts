import { describe, expect, it, vi } from 'vitest';
import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import { ANIMATION_PRESET_IDS } from '../../src/animation/animation-types';
import {
  BUILTIN_ANIMATION_PRESET_DEFINITIONS,
  assertPresetDefinition,
  createPresetRegistry,
  resolveDefaultPresetIdForTraceKind,
  type AnimationPresetDefinition,
  type PresetCompatibleDescriptorKind,
  type PresetTweenFactory,
} from '../../src/animation/preset-registry';

const NOOP_FACTORY: PresetTweenFactory = () => {
  // noop
};

describe('preset-registry', () => {
  it('ships built-in preset definitions for all canonical preset ids', () => {
    expect(BUILTIN_ANIMATION_PRESET_DEFINITIONS.map((preset) => preset.id)).toEqual(ANIMATION_PRESET_IDS);

    expect(
      BUILTIN_ANIMATION_PRESET_DEFINITIONS.map((preset) => [
        preset.id,
        preset.defaultDurationSeconds,
      ]),
    ).toEqual([
      ['arc-tween', 0.4],
      ['fade-in-scale', 0.3],
      ['fade-out-scale', 0.3],
      ['tint-flash', 0.4],
      ['card-flip-3d', 0.3],
      ['counter-tick', 0.4],
      ['banner-overlay', 3],
      ['zone-pulse', 0.5],
      ['pulse', 0.2],
    ]);
  });

  it('validates lookup and descriptor-kind compatibility', () => {
    const registry = createPresetRegistry();

    expect(registry.require('arc-tween').id).toBe('arc-tween');
    expect(registry.requireCompatible('arc-tween', 'moveToken').id).toBe('arc-tween');
    expect(registry.requireCompatible('arc-tween', 'cardDeal').id).toBe('arc-tween');
    expect(registry.requireCompatible('arc-tween', 'cardBurn').id).toBe('arc-tween');
    expect(registry.requireCompatible('card-flip-3d', 'cardFlip').id).toBe('card-flip-3d');
    expect(() => registry.require('missing')).toThrow(/not registered/u);
    expect(() => registry.requireCompatible('arc-tween', 'createToken')).toThrow(/not compatible/u);
  });

  it('resolves default preset ids from trace kinds through shared policy', () => {
    const visualKinds: readonly EffectTraceEntry['kind'][] = [
      'moveToken',
      'createToken',
      'destroyToken',
      'setTokenProp',
      'varChange',
      'resourceTransfer',
      'lifecycleEvent',
    ];

    expect(visualKinds.map((kind) => resolveDefaultPresetIdForTraceKind(kind))).toEqual([
      'arc-tween',
      'fade-in-scale',
      'fade-out-scale',
      'tint-flash',
      'counter-tick',
      'counter-tick',
      'banner-overlay',
    ]);

    expect(() => resolveDefaultPresetIdForTraceKind('forEach')).toThrow(/does not map to a visual/u);
    expect(() => resolveDefaultPresetIdForTraceKind('reduce')).toThrow(/does not map to a visual/u);
    expect(() => resolveDefaultPresetIdForTraceKind('reveal')).toThrow(/does not map to a visual/u);
    expect(() => resolveDefaultPresetIdForTraceKind('conceal')).toThrow(/does not map to a visual/u);
  });

  it('supports runtime extension without mutating built-ins', () => {
    const base = createPresetRegistry();
    const customPreset: AnimationPresetDefinition = {
      id: 'custom-create-spark',
      defaultDurationSeconds: 0.45,
      compatibleKinds: ['createToken'],
      createTween: NOOP_FACTORY,
    };

    const extended = base.register(customPreset);

    expect(base.has('custom-create-spark')).toBe(false);
    expect(extended.has('custom-create-spark')).toBe(true);
    expect(base.size + 1).toBe(extended.size);
    expect(extended.requireCompatible('custom-create-spark', 'createToken').id).toBe('custom-create-spark');
  });

  it('rejects duplicate preset ids during registration', () => {
    const registry = createPresetRegistry();
    const duplicate: AnimationPresetDefinition = {
      id: 'arc-tween',
      defaultDurationSeconds: 0.6,
      compatibleKinds: ['moveToken'],
      createTween: NOOP_FACTORY,
    };

    expect(() => registry.register(duplicate)).toThrow(/must be unique/u);
  });

  it('rejects invalid preset definitions', () => {
    expect(() =>
      assertPresetDefinition({
        id: '',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['moveToken'],
        createTween: NOOP_FACTORY,
      }),
    ).toThrow(/non-empty/u);

    expect(() =>
      assertPresetDefinition({
        id: 'invalid-kind',
        defaultDurationSeconds: 0.2,
        compatibleKinds: ['bad-kind' as unknown as PresetCompatibleDescriptorKind],
        createTween: NOOP_FACTORY,
      }),
    ).toThrow(/unsupported descriptor kind/u);
  });

  it('built-in presets emit tween operations with sprite-aware targets', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 20, y: 30 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );
    registry.require('fade-in-scale').createTween(
      {
        kind: 'createToken',
        tokenId: 'tok:1',
        type: 'unit',
        zone: 'zone:b',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('fade-in-scale').defaultDurationSeconds },
    );
    registry.require('tint-flash').createTween(
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'health',
        oldValue: 10,
        newValue: 5,
        preset: 'tint-flash',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('tint-flash').defaultDurationSeconds },
    );

    expect(gsap.to).toHaveBeenCalledWith(token, expect.objectContaining({
      duration: 0.3,
      alpha: 1,
      scale: 1,
    }));
    expect(gsap.to).toHaveBeenCalledWith(token, expect.objectContaining({
      duration: 0.2,
      tint: 0xffd54f,
    }));
    expect(timeline.add).toHaveBeenCalled();
  });

  it('arc-tween creates two-phase tween with midpoint lift', () => {
    const registry = createPresetRegistry();
    const arcDurationSeconds = registry.require('arc-tween').defaultDurationSeconds;
    const halfArcDurationSeconds = arcDurationSeconds / 2;
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: arcDurationSeconds },
    );

    expect(gsap.to).toHaveBeenCalledTimes(2);

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCall = arcCalls[0]!;
    expect(firstCall[0]).toBe(token);
    const firstVars = firstCall[1] as Record<string, unknown>;
    expect(firstVars['duration']).toBe(halfArcDurationSeconds);
    expect(firstVars['x']).toBe(150);
    expect(firstVars['ease']).toBe('power2.inOut');
    const firstY = firstVars['y'] as number;
    expect(firstY).toBeLessThan(0);

    const secondCall = arcCalls[1]!;
    expect(secondCall[0]).toBe(token);
    const secondVars = secondCall[1] as Record<string, unknown>;
    expect(secondVars['duration']).toBe(halfArcDurationSeconds);
    expect(secondVars['x']).toBe(300);
    expect(secondVars['y']).toBe(0);
    expect(secondVars['ease']).toBe('power2.inOut');
  });

  it('card-flip-3d creates two-phase scaleX tween via proxy to avoid GSAP CSS property issues', () => {
    const registry = createPresetRegistry();
    const cardFlipDurationSeconds = registry.require('card-flip-3d').defaultDurationSeconds;
    const halfCardFlipDurationSeconds = cardFlipDurationSeconds / 2;
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map(),
        },
      },
    };

    registry.require('card-flip-3d').createTween(
      {
        kind: 'cardFlip',
        tokenId: 'tok:1',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
      { ...context, durationSeconds: cardFlipDurationSeconds },
    );

    expect(gsap.to).toHaveBeenCalledTimes(2);

    const flipCalls = gsap.to.mock.calls as unknown[][];
    // First call: proxy object tweening value from 1 to 0
    const firstFlipCall = flipCalls[0]!;
    const firstProxy = firstFlipCall[0] as { value: number };
    expect(firstProxy).toHaveProperty('value');
    const firstFlipVars = firstFlipCall[1] as Record<string, unknown>;
    expect(firstFlipVars['duration']).toBe(halfCardFlipDurationSeconds);
    expect(firstFlipVars['value']).toBe(0);
    expect(firstFlipVars['onUpdate']).toBeTypeOf('function');
    // scaleX should NOT be in the vars — that was the bug
    expect(firstFlipVars).not.toHaveProperty('scaleX');

    // Second call: proxy object tweening value from 0 to 1
    const secondFlipCall = flipCalls[1]!;
    const secondProxy = secondFlipCall[0] as { value: number };
    expect(secondProxy).toHaveProperty('value');
    const secondFlipVars = secondFlipCall[1] as Record<string, unknown>;
    expect(secondFlipVars['duration']).toBe(halfCardFlipDurationSeconds);
    expect(secondFlipVars['value']).toBe(1);
    expect(secondFlipVars['onUpdate']).toBeTypeOf('function');
    expect(secondFlipVars).not.toHaveProperty('scaleX');

    // Simulate onUpdate — verify it drives target.scale.x
    token.scale.x = 1;
    firstProxy.value = 0.5;
    (firstFlipVars['onUpdate'] as () => void)();
    expect(token.scale.x).toBe(0.5);
  });

  it('card-flip-3d logs initial and midpoint face-controller calls when available', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const setFaceUp = vi.fn();
    const logger = { logFaceControllerCall: vi.fn() };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };

    registry.require('card-flip-3d').createTween(
      {
        kind: 'cardFlip',
        tokenId: 'tok:1',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('card-flip-3d').defaultDurationSeconds,
        logger,
        spriteRefs: {
          tokenContainers: new Map([['tok:1', token]]),
          tokenFaceControllers: new Map([['tok:1', { setFaceUp }]]),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    expect(setFaceUp).toHaveBeenCalledWith(false);
    expect(logger.logFaceControllerCall).toHaveBeenCalledWith({
      tokenId: 'tok:1',
      faceUp: false,
      context: 'card-flip-3d-initial',
    });

    // First proxy tween (scale 1→0) has onComplete for face flip
    const firstCallVars = (gsap.to.mock.calls as unknown[][])[0]?.[1] as Record<string, unknown>;
    const midpointCallback = firstCallVars['onComplete'];
    expect(typeof midpointCallback).toBe('function');

    (midpointCallback as () => void)();
    expect(setFaceUp).toHaveBeenLastCalledWith(true);
    expect(logger.logFaceControllerCall).toHaveBeenLastCalledWith({
      tokenId: 'tok:1',
      faceUp: true,
      context: 'card-flip-3d-mid',
    });
  });

  it('card-flip-3d is mapped to cardFlip kind instead of tint-flash', () => {
    const registry = createPresetRegistry();
    const preset = registry.requireCompatible('card-flip-3d', 'cardFlip');
    expect(preset.id).toBe('card-flip-3d');

    expect(() => registry.requireCompatible('tint-flash', 'cardFlip')).toThrow(/not compatible/u);
  });

  it('remains safe when face controller exists but logger is omitted', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const setFaceUp = vi.fn();
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };

    registry.require('card-flip-3d').createTween(
      {
        kind: 'cardFlip',
        tokenId: 'tok:1',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('card-flip-3d').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map([['tok:1', token]]),
          tokenFaceControllers: new Map([['tok:1', { setFaceUp }]]),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    const firstCallVars = (gsap.to.mock.calls as unknown[][])[0]?.[1] as Record<string, unknown>;
    const midpointCallback = firstCallVars['onComplete'] as (() => void) | undefined;
    expect(() => midpointCallback?.()).not.toThrow();
  });

  it('does not log face-controller calls when no face controller exists for token', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const logger = { logFaceControllerCall: vi.fn() };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };

    registry.require('card-flip-3d').createTween(
      {
        kind: 'cardFlip',
        tokenId: 'tok:1',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        logger,
        durationSeconds: registry.require('card-flip-3d').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map([['tok:1', token]]),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    // No face controller → no onComplete callback on the proxy tween
    const firstCallVars = (gsap.to.mock.calls as unknown[][])[0]?.[1] as Record<string, unknown>;
    const midpointCallback = firstCallVars['onComplete'] as (() => void) | undefined;
    // Should not have onComplete when no face controller
    expect(midpointCallback).toBeUndefined();
    expect(logger.logFaceControllerCall).not.toHaveBeenCalled();
  });

  it('arc-tween sets initial alpha above zero and fades to 1 when target alpha is 0', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 0, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    // Alpha should be pre-flashed to 0.3 (above zero) so the card is immediately visible
    expect(token.alpha).toBe(0.3);

    expect(gsap.to).toHaveBeenCalledTimes(2);

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCallVars = arcCalls[0]![1] as Record<string, unknown>;
    // First phase should tween alpha to 1
    expect(firstCallVars['alpha']).toBe(1);

    const secondCallVars = arcCalls[1]![1] as Record<string, unknown>;
    // Second phase should NOT include alpha
    expect(secondCallVars['alpha']).toBeUndefined();
  });

  it('arc-tween does not include alpha in tween when target alpha is not 0', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCallVars = arcCalls[0]![1] as Record<string, unknown>;
    // Should NOT include alpha when target is already visible
    expect(firstCallVars['alpha']).toBeUndefined();
  });

  it('arc-tween lift height is proportional to distance with minimum of 20px', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };

    const contextClose = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 10, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...contextClose, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    const closeCalls = gsap.to.mock.calls as unknown[][];
    const firstCallClose = closeCalls[0]!;
    const midYClose = (firstCallClose[1] as Record<string, unknown>)['y'] as number;
    expect(midYClose).toBe(-20);
  });

  it('counter-tick adds an inert delay via gsap.to instead of tweening zone containers', () => {
    const registry = createPresetRegistry();
    const tokenA = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'token' };
    const zoneA = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'zoneA' };
    const zoneB = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'zoneB' };
    const timeline = { add: vi.fn() };
    const delayTween = { id: 'delay-tween' };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => delayTween),
    };

    registry.require('counter-tick').createTween(
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'pot',
        oldValue: 1,
        newValue: 2,
        preset: 'counter-tick',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('counter-tick').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map([['tok:1', tokenA]]),
          zoneContainers: new Map([
            ['zone:a', zoneA],
            ['zone:b', zoneB],
          ]),
          zonePositions: { positions: new Map() },
        },
      },
    );

    // counter-tick should use gsap.to with an empty target for delay
    expect(gsap.to).toHaveBeenCalledTimes(1);
    expect(gsap.to).toHaveBeenCalledWith({}, { duration: 0.4 });
    expect(timeline.add).toHaveBeenCalledWith(delayTween);
  });

  it('banner-overlay invokes phaseBannerCallback with phase on start and null on complete', () => {
    const registry = createPresetRegistry();
    const phaseBannerCallback = vi.fn();
    const addedCallbacks: (() => void)[] = [];
    const delayTween = { id: 'banner-delay' };
    const timeline = { add: vi.fn() };
    timeline.add.mockImplementation((fn: unknown) => {
      if (typeof fn === 'function') {
        addedCallbacks.push(fn as () => void);
      }
      return timeline;
    });
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => delayTween),
    };

    registry.require('banner-overlay').createTween(
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'flop',
        preset: 'banner-overlay',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('banner-overlay').defaultDurationSeconds,
        phaseBannerCallback,
        spriteRefs: {
          tokenContainers: new Map(),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    // Should add: callback(phase), delay tween via gsap.to, callback(null)
    expect(addedCallbacks).toHaveLength(2);
    addedCallbacks[0]!();
    expect(phaseBannerCallback).toHaveBeenCalledWith('flop');
    addedCallbacks[1]!();
    expect(phaseBannerCallback).toHaveBeenCalledWith(null);

    // The delay between callbacks uses gsap.to with correct duration
    expect(gsap.to).toHaveBeenCalledTimes(1);
    expect(gsap.to).toHaveBeenCalledWith({}, { duration: 3 });
    expect(timeline.add).toHaveBeenCalledWith(delayTween);
  });

  it('banner-overlay falls back to delay-only when no phaseBannerCallback is provided', () => {
    const registry = createPresetRegistry();
    const timeline = { add: vi.fn() };
    const delayTween = { id: 'delay-tween' };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => delayTween),
    };

    registry.require('banner-overlay').createTween(
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'main',
        preset: 'banner-overlay',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('banner-overlay').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map(),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    // Should add a delay via gsap.to({}, { duration })
    expect(gsap.to).toHaveBeenCalledWith({}, { duration: 3 });
    expect(timeline.add).toHaveBeenCalledWith(delayTween);
  });

  it('appendDelay falls back to gsap.timeline when gsap.to is not available', () => {
    const registry = createPresetRegistry();
    const timeline = { add: vi.fn() };
    const subTimeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => subTimeline),
      // no `to` method — simulates noop runtime without gsap.to
    };

    registry.require('counter-tick').createTween(
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'pot',
        oldValue: 1,
        newValue: 2,
        preset: 'counter-tick',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('counter-tick').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map(),
          zoneContainers: new Map(),
          zonePositions: { positions: new Map() },
        },
      },
    );

    // Should fall back to gsap.timeline({ paused, duration }) when gsap.to is absent
    expect(gsap.timeline).toHaveBeenCalledWith(expect.objectContaining({ paused: true, duration: 0.4 }));
    expect(timeline.add).toHaveBeenCalledWith(subTimeline);
  });

  it('arc-tween appends flip sub-animation for cardDeal with destinationRole shared', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 0, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const setFaceUp = vi.fn();
    const logger = { logFaceControllerCall: vi.fn() };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      logger,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        tokenFaceControllers: new Map([['tok:1', { setFaceUp }]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
        destinationRole: 'shared',
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    // 2 arc phases + 2 proxy scaleX phases = 4 calls
    expect(gsap.to).toHaveBeenCalledTimes(4);

    const calls = gsap.to.mock.calls as unknown[][];
    // Third call: proxy tween value → 0 (first half of flip)
    const flipFirstHalfProxy = calls[2]![0] as { value: number };
    expect(flipFirstHalfProxy).toHaveProperty('value');
    const flipFirstHalf = calls[2]![1] as Record<string, unknown>;
    expect(flipFirstHalf['value']).toBe(0);
    expect(flipFirstHalf['duration']).toBe(0.1);
    expect(typeof flipFirstHalf['onComplete']).toBe('function');
    expect(typeof flipFirstHalf['onUpdate']).toBe('function');
    expect(flipFirstHalf).not.toHaveProperty('scaleX');

    // Fourth call: proxy tween value → 1 (second half of flip)
    const flipSecondHalf = calls[3]![1] as Record<string, unknown>;
    expect(flipSecondHalf['value']).toBe(1);
    expect(flipSecondHalf['duration']).toBe(0.1);
    expect(flipSecondHalf).not.toHaveProperty('scaleX');

    // Execute the onComplete callback
    (flipFirstHalf['onComplete'] as () => void)();
    expect(setFaceUp).toHaveBeenCalledWith(true);
    expect(logger.logFaceControllerCall).toHaveBeenCalledWith({
      tokenId: 'tok:1',
      faceUp: true,
      context: 'card-deal-to-shared-mid-arc',
    });
  });

  it('arc-tween does NOT append flip for cardDeal with destinationRole hand', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 0, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
        destinationRole: 'hand',
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    // Only 2 arc phases, no flip
    expect(gsap.to).toHaveBeenCalledTimes(2);
  });

  it('arc-tween does NOT append flip for moveToken (non-cardDeal)', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 300, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    // Only 2 arc phases, no flip
    expect(gsap.to).toHaveBeenCalledTimes(2);
  });

  it('arc-tween adds horizontal offset for same-column arcs (|dx| < 10)', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 100, y: 0 }],
            ['zone:b', { x: 100, y: 200 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCallVars = arcCalls[0]![1] as Record<string, unknown>;
    // Mid-point X should be offset by 30 from the center (100) when dx is 0
    expect(firstCallVars['x']).toBe(100 + 30);
  });

  it('arc-tween does not add horizontal offset when dx is large enough', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 1, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 200, y: 0 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCallVars = arcCalls[0]![1] as Record<string, unknown>;
    // Mid-point X should be the simple average (100) with no offset
    expect(firstCallVars['x']).toBe(100);
  });

  it('arc-tween uses destinationOffset for final position on cardDeal descriptor', () => {
    const registry = createPresetRegistry();
    const token = { x: 0, y: 0, alpha: 0, tint: 0xffffff, scale: { x: 1, y: 1 } };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };
    const context = {
      gsap,
      timeline,
      spriteRefs: {
        tokenContainers: new Map([['tok:1', token]]),
        zoneContainers: new Map(),
        zonePositions: {
          positions: new Map([
            ['zone:a', { x: 0, y: 0 }],
            ['zone:b', { x: 200, y: 100 }],
          ]),
        },
      },
    };

    registry.require('arc-tween').createTween(
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        destinationOffset: { x: -20, y: 5 },
        preset: 'arc-tween',
        isTriggered: false,
      },
      { ...context, durationSeconds: registry.require('arc-tween').defaultDurationSeconds },
    );

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const secondCallVars = arcCalls[1]![1] as Record<string, unknown>;
    // Final position should be zone:b + destinationOffset
    expect(secondCallVars['x']).toBe(200 - 20);
    expect(secondCallVars['y']).toBe(100 + 5);
  });

  it('zone-pulse emits alpha+tint tween for zoneHighlight', () => {
    const registry = createPresetRegistry();
    const zone = { alpha: 1, tint: 0xffffff };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
    };

    registry.require('zone-pulse').createTween(
      {
        kind: 'zoneHighlight',
        zoneId: 'zone:a',
        sourceKind: 'moveToken',
        preset: 'zone-pulse',
        isTriggered: false,
      },
      {
        gsap,
        timeline,
        durationSeconds: registry.require('zone-pulse').defaultDurationSeconds,
        spriteRefs: {
          tokenContainers: new Map(),
          zoneContainers: new Map([['zone:a', zone]]),
          zonePositions: { positions: new Map() },
        },
      },
    );

    expect(gsap.to).toHaveBeenCalledWith(zone, expect.objectContaining({ alpha: 0.68, tint: 0xc7f9cc }));
    expect(gsap.to).toHaveBeenCalledWith(zone, expect.objectContaining({ alpha: 1, tint: 0xffffff }));
  });
});
