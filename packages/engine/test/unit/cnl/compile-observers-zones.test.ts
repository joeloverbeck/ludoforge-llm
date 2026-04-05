import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import type { GameSpecObservabilitySection } from '../../../src/cnl/game-spec-doc.js';
import { lowerObservers, type LowerObserversOptions } from '../../../src/cnl/compile-observers.js';

const DEFAULT_OPTIONS: LowerObserversOptions = {
  knownGlobalVarIds: ['score'],
  knownGlobalMarkerIds: [],
  knownPerPlayerVarIds: ['health'],
  knownDerivedMetricIds: [],
  knownZoneBaseIds: ['hand', 'deck', 'board'],
};

function compile(spec: GameSpecObservabilitySection): {
  readonly catalog: ReturnType<typeof lowerObservers>;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const catalog = lowerObservers(spec, diagnostics, DEFAULT_OPTIONS);
  return { catalog, diagnostics };
}

describe('lowerObservers — zone compilation', () => {
  // --- AC 1: Profile with no zones compiles to zones: undefined ---
  it('profile with no zones compiles to zones: undefined', () => {
    const { catalog, diagnostics } = compile({
      observers: {
        player: {
          surfaces: { globalVars: 'public' },
        },
      },
    });
    assert.equal(diagnostics.filter((d) => d.severity === 'error').length, 0);
    assert.equal(catalog!.observers['player']!.zones, undefined);
  });

  // --- AC 2: Profile with _default only ---
  it('profile with _default only compiles to catalog with defaultEntry', () => {
    const { catalog } = compile({
      observers: {
        player: {
          zones: {
            _default: { tokens: 'hidden', order: 'hidden' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['player']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries, {});
    assert.deepEqual(zones.defaultEntry, { tokens: 'hidden', order: 'hidden' });
  });

  // --- AC 3: Profile with specific zone entries ---
  it('profile with specific zone entries compiles correctly', () => {
    const { catalog } = compile({
      observers: {
        player: {
          zones: {
            hand: { tokens: 'owner', order: 'owner' },
            deck: { tokens: 'hidden', order: 'hidden' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['player']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries['hand'], { tokens: 'owner', order: 'owner' });
    assert.deepEqual(zones.entries['deck'], { tokens: 'hidden', order: 'hidden' });
    assert.equal(zones.defaultEntry, undefined);
  });

  // --- AC 4: Profile with both _default and specific entries ---
  it('profile with _default and specific entries compiles correctly', () => {
    const { catalog } = compile({
      observers: {
        player: {
          zones: {
            _default: { tokens: 'hidden', order: 'hidden' },
            board: { tokens: 'public', order: 'public' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['player']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries['board'], { tokens: 'public', order: 'public' });
    assert.deepEqual(zones.defaultEntry, { tokens: 'hidden', order: 'hidden' });
  });

  // --- AC 5: extends inherits parent zone entries; child overrides per-zone ---
  it('extends inherits parent zones; child overrides per-zone', () => {
    const { catalog } = compile({
      observers: {
        parent: {
          zones: {
            hand: { tokens: 'owner', order: 'owner' },
            deck: { tokens: 'hidden', order: 'hidden' },
          },
        },
        child: {
          extends: 'parent',
          zones: {
            hand: { tokens: 'public', order: 'public' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['child']!.zones;
    assert.ok(zones !== undefined);
    // child overrides hand
    assert.deepEqual(zones.entries['hand'], { tokens: 'public', order: 'public' });
    // deck inherited from parent
    assert.deepEqual(zones.entries['deck'], { tokens: 'hidden', order: 'hidden' });
  });

  // --- AC 6: extends with child _default replaces parent _default ---
  it('extends with child _default replaces parent _default', () => {
    const { catalog } = compile({
      observers: {
        parent: {
          zones: {
            _default: { tokens: 'hidden', order: 'hidden' },
          },
        },
        child: {
          extends: 'parent',
          zones: {
            _default: { tokens: 'public', order: 'public' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['child']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.defaultEntry, { tokens: 'public', order: 'public' });
  });

  // --- AC 7: omniscient has correct zone behavior ---
  it('omniscient built-in has zones with defaultEntry all public', () => {
    const { catalog } = compile({ observers: {} });
    const omniscient = catalog!.observers['omniscient']!;
    assert.ok(omniscient.zones !== undefined);
    assert.deepEqual(omniscient.zones.entries, {});
    assert.deepEqual(omniscient.zones.defaultEntry, { tokens: 'public', order: 'public' });
  });

  // --- AC 8: default built-in has zones: undefined ---
  it('default built-in has zones: undefined', () => {
    const { catalog } = compile({ observers: {} });
    const defaultProfile = catalog!.observers['default']!;
    assert.equal(defaultProfile.zones, undefined);
  });

  // --- AC 9: Fingerprint changes when zone entries are added ---
  it('fingerprint changes when zone entries are added', () => {
    const { catalog: withoutZones } = compile({
      observers: {
        player: {},
      },
    });
    const { catalog: withZones } = compile({
      observers: {
        player: {
          zones: {
            hand: { tokens: 'owner', order: 'owner' },
          },
        },
      },
    } as never);
    assert.notEqual(
      withoutZones!.observers['player']!.fingerprint,
      withZones!.observers['player']!.fingerprint,
    );
  });

  // --- AC 10: Existing compile-observers tests pass unchanged ---
  // (verified by running full test suite)

  // --- Edge case: zone entry with only tokens infers order ---
  it('zone entry with only tokens infers order from tokens', () => {
    const { catalog } = compile({
      observers: {
        player: {
          zones: {
            hand: { tokens: 'owner' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['player']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries['hand'], { tokens: 'owner', order: 'owner' });
  });

  // --- Edge case: zone entry with only order infers tokens ---
  it('zone entry with only order infers tokens from order', () => {
    const { catalog } = compile({
      observers: {
        player: {
          zones: {
            hand: { order: 'hidden' },
          },
        },
      },
    } as never);
    const zones = catalog!.observers['player']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries['hand'], { tokens: 'hidden', order: 'hidden' });
  });

  // --- Edge case: child with no zones inherits parent zones ---
  it('child with no zones inherits parent zones', () => {
    const { catalog } = compile({
      observers: {
        parent: {
          zones: {
            hand: { tokens: 'owner', order: 'owner' },
          },
        },
        child: {
          extends: 'parent',
        },
      },
    } as never);
    const zones = catalog!.observers['child']!.zones;
    assert.ok(zones !== undefined);
    assert.deepEqual(zones.entries['hand'], { tokens: 'owner', order: 'owner' });
  });
});
