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
      ['banner-overlay', 1.5],
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

  it('card-flip-3d creates two-phase scaleX tween', () => {
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
    const firstFlipCall = flipCalls[0]!;
    expect(firstFlipCall[0]).toBe(token);
    const firstFlipVars = firstFlipCall[1] as Record<string, unknown>;
    expect(firstFlipVars['duration']).toBe(halfCardFlipDurationSeconds);
    expect(firstFlipVars['scaleX']).toBe(0);

    const secondFlipCall = flipCalls[1]!;
    expect(secondFlipCall[0]).toBe(token);
    const secondFlipVars = secondFlipCall[1] as Record<string, unknown>;
    expect(secondFlipVars['duration']).toBe(halfCardFlipDurationSeconds);
    expect(secondFlipVars['scaleX']).toBe(1);
  });

  it('card-flip-3d swaps face visibility at midpoint when face controller is available', () => {
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

    expect(setFaceUp).toHaveBeenCalledWith(false);

    const midpointVars = (gsap.to.mock.calls as unknown[][])[0]?.[1] as Record<string, unknown>;
    const midpointCallback = midpointVars['onComplete'];
    expect(typeof midpointCallback).toBe('function');

    (midpointCallback as () => void)();
    expect(setFaceUp).toHaveBeenLastCalledWith(true);
  });

  it('card-flip-3d is mapped to cardFlip kind instead of tint-flash', () => {
    const registry = createPresetRegistry();
    const preset = registry.requireCompatible('card-flip-3d', 'cardFlip');
    expect(preset.id).toBe('card-flip-3d');

    expect(() => registry.requireCompatible('tint-flash', 'cardFlip')).toThrow(/not compatible/u);
  });

  it('arc-tween includes alpha fade-in when target alpha is 0', () => {
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

    expect(gsap.to).toHaveBeenCalledTimes(2);

    const arcCalls = gsap.to.mock.calls as unknown[][];
    const firstCallVars = arcCalls[0]![1] as Record<string, unknown>;
    // First phase should include alpha: 1 for fade-in
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

  it('counter-tick adds an inert delay instead of tweening zone containers', () => {
    const registry = createPresetRegistry();
    const tokenA = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'token' };
    const zoneA = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'zoneA' };
    const zoneB = { alpha: 1, scale: { x: 1, y: 1 }, _testId: 'zoneB' };
    const timeline = { add: vi.fn() };
    const subTimeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => subTimeline),
      to: vi.fn(() => ({ id: 'tween' })),
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

    // counter-tick should NOT call gsap.to on any targets
    expect(gsap.to).not.toHaveBeenCalled();
    // It should add a delay via gsap.timeline() + timeline.add()
    expect(gsap.timeline).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
    expect(timeline.add).toHaveBeenCalledWith(subTimeline);
  });

  it('banner-overlay emits zone alpha tweens for phaseTransition', () => {
    const registry = createPresetRegistry();
    const zoneA = { alpha: 1 };
    const zoneB = { alpha: 1 };
    const timeline = { add: vi.fn() };
    const gsap = {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline: vi.fn(() => ({ add: vi.fn() })),
      to: vi.fn(() => ({ id: 'tween' })),
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
          zoneContainers: new Map([
            ['zone:a', zoneA],
            ['zone:b', zoneB],
          ]),
          zonePositions: { positions: new Map() },
        },
      },
    );

    expect(gsap.to).toHaveBeenCalled();
    expect(gsap.to).toHaveBeenCalledWith(zoneA, expect.objectContaining({ alpha: 0.72 }));
    expect(gsap.to).toHaveBeenCalledWith(zoneA, expect.objectContaining({ alpha: 1 }));
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
