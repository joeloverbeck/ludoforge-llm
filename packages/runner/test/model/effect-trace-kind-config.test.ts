import { describe, expect, it } from 'vitest';

import {
  SKIPPED_TRACE_KINDS,
  TRACE_KIND_DEFAULT_PRESET_IDS,
  isSkippedTraceKind,
} from '../../src/model/effect-trace-kind-config.js';

describe('effect-trace-kind-config', () => {
  it('keeps skipped kinds aligned with null-default preset policy', () => {
    const nullPresetKinds = Object.entries(TRACE_KIND_DEFAULT_PRESET_IDS)
      .filter(([, presetId]) => presetId === null)
      .map(([kind]) => kind)
      .sort();
    const configuredSkippedKinds = [...SKIPPED_TRACE_KINDS].sort();

    expect(nullPresetKinds).toEqual(configuredSkippedKinds);
  });

  it('detects canonical skipped kinds', () => {
    expect(isSkippedTraceKind('forEach')).toBe(true);
    expect(isSkippedTraceKind('reduce')).toBe(true);
    expect(isSkippedTraceKind('reveal')).toBe(true);
    expect(isSkippedTraceKind('conceal')).toBe(true);
    expect(isSkippedTraceKind('moveToken')).toBe(false);
  });
});

