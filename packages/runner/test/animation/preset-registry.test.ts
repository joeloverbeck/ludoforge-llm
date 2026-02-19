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
      ['counter-roll', 0.3],
      ['banner-slide', 1.5],
      ['pulse', 0.2],
    ]);
  });

  it('validates lookup and descriptor-kind compatibility', () => {
    const registry = createPresetRegistry();

    expect(registry.require('arc-tween').id).toBe('arc-tween');
    expect(registry.requireCompatible('arc-tween', 'moveToken').id).toBe('arc-tween');
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
      'counter-roll',
      'counter-roll',
      'banner-slide',
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
      context,
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
      context,
    );
    registry.require('tint-flash').createTween(
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'foo',
        oldValue: 0,
        newValue: 1,
        preset: 'tint-flash',
        isTriggered: false,
      },
      context,
    );

    expect(gsap.to).toHaveBeenCalledWith(token, expect.objectContaining({
      duration: 0.4,
      x: 20,
      y: 30,
    }));
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
});
