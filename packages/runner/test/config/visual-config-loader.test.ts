import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createVisualConfigProvider,
  loadVisualConfig,
} from '../../src/config/visual-config-loader';

describe('visual-config-loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for null and undefined inputs', () => {
    expect(loadVisualConfig(null)).toBeNull();
    expect(loadVisualConfig(undefined)).toBeNull();
  });

  it('returns typed config for valid input', () => {
    expect(loadVisualConfig({ version: 1 })).toEqual({ version: 1 });

    expect(loadVisualConfig({ version: 1, factions: { us: { color: '#ff0000' } } })).toEqual({
      version: 1,
      factions: { us: { color: '#ff0000' } },
    });
  });

  it('throws for invalid version', () => {
    expect(() => loadVisualConfig({ version: 2 })).toThrow(/Invalid visual config schema/u);
  });

  it('throws for invalid type', () => {
    expect(() => loadVisualConfig('not an object')).toThrow(/Invalid visual config schema/u);
  });

  it('createVisualConfigProvider falls back to defaults for null input', () => {
    const provider = createVisualConfigProvider(null);

    expect(provider.resolveZoneVisual('zone:a', null, null)).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: null,
    });
  });

  it('createVisualConfigProvider applies configured faction color', () => {
    const provider = createVisualConfigProvider({
      version: 1,
      factions: {
        us: { color: '#ff0000' },
      },
    });

    expect(provider.getFactionColor('us')).toBe('#ff0000');
  });

  it('createVisualConfigProvider throws for malformed non-null config', () => {
    expect(() => createVisualConfigProvider({ version: 2 })).toThrow(/Invalid visual config schema/u);
  });
});
