import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import type { GameSpecObservabilitySection } from '../../../src/cnl/game-spec-doc.js';
import { lowerObservers, type LowerObserversOptions } from '../../../src/cnl/compile-observers.js';

function errors(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error');
}

const DEFAULT_OPTIONS: LowerObserversOptions = {
  knownGlobalVarIds: ['score', 'round'],
  knownGlobalMarkerIds: ['cap_boobyTraps', 'cap_cadres'],
  knownPerPlayerVarIds: ['health', 'resources'],
  knownDerivedMetricIds: ['totalScore'],
};

const EMPTY_OPTIONS: LowerObserversOptions = {
  knownGlobalVarIds: [],
  knownGlobalMarkerIds: [],
  knownPerPlayerVarIds: [],
  knownDerivedMetricIds: [],
};

describe('lowerObservers', () => {
  // -----------------------------------------------------------------------
  // AC 8: Null observability returns undefined
  // -----------------------------------------------------------------------

  it('returns undefined when observability is null', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(null, diagnostics, DEFAULT_OPTIONS);
    assert.equal(result, undefined);
    assert.equal(diagnostics.length, 0);
  });

  // -----------------------------------------------------------------------
  // AC 1: Defaults test — zero overrides matches default built-in
  // -----------------------------------------------------------------------

  it('observer with zero surface overrides produces catalog identical to default built-in', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      { observers: { myObserver: { description: 'no overrides' } } },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const mine = result.observers['myObserver']!;
    const builtin = result.observers['default']!;

    assert.deepStrictEqual(mine.surfaces, builtin.surfaces);
    assert.equal(mine.fingerprint, builtin.fingerprint);
  });

  // -----------------------------------------------------------------------
  // AC 2: Shorthand expansion
  // -----------------------------------------------------------------------

  it('expands shorthand globalVars: "public" to full form for all known IDs', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          open: {
            surfaces: { globalVars: 'public' },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const profile = result.observers['open']!;
    for (const id of DEFAULT_OPTIONS.knownGlobalVarIds) {
      assert.deepStrictEqual(profile.surfaces.globalVars[id], {
        current: 'public',
        preview: { visibility: 'public', allowWhenHiddenSampling: true },
      }, `globalVars.${id} should be public with default preview`);
    }
  });

  it('expands shorthand globalMarkers: "public" to full form for all known IDs', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          open: {
            surfaces: { globalMarkers: 'public' },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const profile = result.observers['open']!;
    for (const id of DEFAULT_OPTIONS.knownGlobalMarkerIds) {
      assert.deepStrictEqual(profile.surfaces.globalMarkers[id], {
        current: 'public',
        preview: { visibility: 'public', allowWhenHiddenSampling: false },
      }, `globalMarkers.${id} should be public with default preview`);
    }
  });

  it('expands shorthand scalar surface activeCardIdentity: "public"', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          cards: {
            surfaces: { activeCardIdentity: 'public' },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);

    const profile = result.observers['cards']!;
    assert.deepStrictEqual(profile.surfaces.activeCardIdentity, {
      current: 'public',
      preview: { visibility: 'public', allowWhenHiddenSampling: false },
    });
  });

  // -----------------------------------------------------------------------
  // AC 3: Extends test
  // -----------------------------------------------------------------------

  it('child observer inherits parent surfaces and overrides specific entries', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          parent: {
            surfaces: {
              globalVars: 'public',
              activeCardIdentity: 'public',
              activeCardTag: 'public',
            },
          },
          child: {
            extends: 'parent',
            surfaces: {
              activeCardTag: 'hidden',
            },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const child = result.observers['child']!;

    // Inherited from parent: globalVars should be public
    for (const id of DEFAULT_OPTIONS.knownGlobalVarIds) {
      assert.equal(child.surfaces.globalVars[id]!.current, 'public');
    }

    // Inherited from parent: activeCardIdentity should be public
    assert.equal(child.surfaces.activeCardIdentity.current, 'public');

    // Overridden by child: activeCardTag should be hidden
    assert.equal(child.surfaces.activeCardTag.current, 'hidden');
  });

  // -----------------------------------------------------------------------
  // AC 4: Per-variable expansion
  // -----------------------------------------------------------------------

  it('expands _default + per-id overrides for perPlayerVars', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          mixed: {
            surfaces: {
              perPlayerVars: {
                _default: 'seatVisible',
                resources: 'public',
              } as unknown as GameSpecObservabilitySection['observers'],
            },
          },
        },
      } as unknown as GameSpecObservabilitySection,
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const profile = result.observers['mixed']!;

    // 'resources' overridden to public
    assert.equal(profile.surfaces.perPlayerVars['resources']!.current, 'public');

    // 'health' falls back to _default: seatVisible
    assert.equal(profile.surfaces.perPlayerVars['health']!.current, 'seatVisible');
  });

  // -----------------------------------------------------------------------
  // AC 5: Built-in omniscient
  // -----------------------------------------------------------------------

  it('built-in omniscient has all surfaces public with allowWhenHiddenSampling false', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers({ observers: {} }, diagnostics, DEFAULT_OPTIONS);
    assert.ok(result);

    const omniscient = result.observers['omniscient']!;
    assert.ok(omniscient);

    // Check scalar surfaces
    assert.equal(omniscient.surfaces.activeCardIdentity.current, 'public');
    assert.equal(omniscient.surfaces.activeCardIdentity.preview.visibility, 'public');
    assert.equal(omniscient.surfaces.activeCardIdentity.preview.allowWhenHiddenSampling, false);

    assert.equal(omniscient.surfaces.victory.currentMargin.current, 'public');
    assert.equal(omniscient.surfaces.victory.currentMargin.preview.allowWhenHiddenSampling, false);

    // Check map-type surfaces
    for (const id of DEFAULT_OPTIONS.knownGlobalVarIds) {
      assert.equal(omniscient.surfaces.globalVars[id]!.current, 'public');
      assert.equal(omniscient.surfaces.globalVars[id]!.preview.visibility, 'public');
      assert.equal(omniscient.surfaces.globalVars[id]!.preview.allowWhenHiddenSampling, false);
    }

    for (const id of DEFAULT_OPTIONS.knownPerPlayerVarIds) {
      assert.equal(omniscient.surfaces.perPlayerVars[id]!.current, 'public');
    }

    for (const id of DEFAULT_OPTIONS.knownGlobalMarkerIds) {
      assert.equal(omniscient.surfaces.globalMarkers[id]!.current, 'public');
      assert.equal(omniscient.surfaces.globalMarkers[id]!.preview.visibility, 'public');
      assert.equal(omniscient.surfaces.globalMarkers[id]!.preview.allowWhenHiddenSampling, false);
    }
  });

  // -----------------------------------------------------------------------
  // AC 6: Built-in default matches system defaults
  // -----------------------------------------------------------------------

  it('built-in default matches system defaults table exactly', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers({ observers: {} }, diagnostics, DEFAULT_OPTIONS);
    assert.ok(result);

    const def = result.observers['default']!;

    // globalVars: public, preview mirrors current, allowWhenHiddenSampling: true
    for (const id of DEFAULT_OPTIONS.knownGlobalVarIds) {
      assert.deepStrictEqual(def.surfaces.globalVars[id], {
        current: 'public',
        preview: { visibility: 'public', allowWhenHiddenSampling: true },
      });
    }

    // perPlayerVars: seatVisible
    for (const id of DEFAULT_OPTIONS.knownPerPlayerVarIds) {
      assert.deepStrictEqual(def.surfaces.perPlayerVars[id], {
        current: 'seatVisible',
        preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true },
      });
    }

    // derivedMetrics: hidden
    for (const id of DEFAULT_OPTIONS.knownDerivedMetricIds) {
      assert.deepStrictEqual(def.surfaces.derivedMetrics[id], {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      });
    }

    // globalMarkers: public, preview public, allowWhenHiddenSampling false
    for (const id of DEFAULT_OPTIONS.knownGlobalMarkerIds) {
      assert.deepStrictEqual(def.surfaces.globalMarkers[id], {
        current: 'public',
        preview: { visibility: 'public', allowWhenHiddenSampling: false },
      });
    }

    // victory: hidden
    assert.deepStrictEqual(def.surfaces.victory.currentMargin, {
      current: 'hidden',
      preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
    });
    assert.deepStrictEqual(def.surfaces.victory.currentRank, {
      current: 'hidden',
      preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
    });

    // activeCard*: hidden
    assert.deepStrictEqual(def.surfaces.activeCardIdentity, {
      current: 'hidden',
      preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
    });
    assert.deepStrictEqual(def.surfaces.activeCardTag, {
      current: 'hidden',
      preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
    });
  });

  // -----------------------------------------------------------------------
  // AC 7: Fingerprint determinism
  // -----------------------------------------------------------------------

  it('same input produces same fingerprint', () => {
    const spec: GameSpecObservabilitySection = {
      observers: {
        player: { surfaces: { globalVars: 'public', activeCardIdentity: 'public' } },
      },
    };

    const d1: Diagnostic[] = [];
    const d2: Diagnostic[] = [];
    const r1 = lowerObservers(spec, d1, DEFAULT_OPTIONS);
    const r2 = lowerObservers(spec, d2, DEFAULT_OPTIONS);

    assert.ok(r1);
    assert.ok(r2);
    assert.equal(r1.catalogFingerprint, r2.catalogFingerprint);
    assert.equal(r1.observers['player']!.fingerprint, r2.observers['player']!.fingerprint);
  });

  it('different inputs produce different fingerprints', () => {
    const d1: Diagnostic[] = [];
    const d2: Diagnostic[] = [];

    const r1 = lowerObservers(
      { observers: { a: { surfaces: { globalVars: 'public' } } } },
      d1,
      DEFAULT_OPTIONS,
    );
    const r2 = lowerObservers(
      { observers: { a: { surfaces: { globalVars: 'hidden' } } } },
      d2,
      DEFAULT_OPTIONS,
    );

    assert.ok(r1);
    assert.ok(r2);
    assert.notEqual(r1.observers['a']!.fingerprint, r2.observers['a']!.fingerprint);
  });

  // -----------------------------------------------------------------------
  // Catalog structure
  // -----------------------------------------------------------------------

  it('catalog has schemaVersion 1 and defaultObserverName "default"', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers({ observers: {} }, diagnostics, DEFAULT_OPTIONS);
    assert.ok(result);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.defaultObserverName, 'default');
  });

  it('built-in profiles are always present even when no user observers defined', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers({ observers: {} }, diagnostics, DEFAULT_OPTIONS);
    assert.ok(result);
    assert.ok(result.observers['omniscient']);
    assert.ok(result.observers['default']);
  });

  // -----------------------------------------------------------------------
  // Built-in name collision (defense-in-depth)
  // -----------------------------------------------------------------------

  it('rejects user-defined observer named "omniscient"', () => {
    const diagnostics: Diagnostic[] = [];
    lowerObservers(
      { observers: { omniscient: { description: 'mine' } } },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(errors(diagnostics).some((d) => d.code === 'CNL_COMPILER_OBSERVER_BUILTIN_NAME_COLLISION'));
  });

  it('rejects user-defined observer named "default"', () => {
    const diagnostics: Diagnostic[] = [];
    lowerObservers(
      { observers: { default: { description: 'mine' } } },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(errors(diagnostics).some((d) => d.code === 'CNL_COMPILER_OBSERVER_BUILTIN_NAME_COLLISION'));
  });

  // -----------------------------------------------------------------------
  // Full syntax support
  // -----------------------------------------------------------------------

  it('full syntax { current, preview } is applied correctly', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          detailed: {
            surfaces: {
              activeCardIdentity: {
                current: 'hidden',
                preview: { visibility: 'public', allowWhenHiddenSampling: true },
              },
            },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    assert.deepStrictEqual(result.observers['detailed']!.surfaces.activeCardIdentity, {
      current: 'hidden',
      preview: { visibility: 'public', allowWhenHiddenSampling: true },
    });
  });

  it('full syntax for map-type surface applies to all known IDs', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          fullMap: {
            surfaces: {
              globalVars: {
                current: 'hidden',
                preview: { visibility: 'public', allowWhenHiddenSampling: false },
              },
            },
          },
        },
      } as unknown as GameSpecObservabilitySection,
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);

    for (const id of DEFAULT_OPTIONS.knownGlobalVarIds) {
      assert.deepStrictEqual(result.observers['fullMap']!.surfaces.globalVars[id], {
        current: 'hidden',
        preview: { visibility: 'public', allowWhenHiddenSampling: false },
      });
    }
  });

  // -----------------------------------------------------------------------
  // Empty known IDs
  // -----------------------------------------------------------------------

  it('map-type surfaces are empty records when no known IDs exist', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers({ observers: {} }, diagnostics, EMPTY_OPTIONS);
    assert.ok(result);

    assert.deepStrictEqual(result.observers['default']!.surfaces.globalVars, {});
    assert.deepStrictEqual(result.observers['default']!.surfaces.globalMarkers, {});
    assert.deepStrictEqual(result.observers['default']!.surfaces.perPlayerVars, {});
    assert.deepStrictEqual(result.observers['default']!.surfaces.derivedMetrics, {});
  });

  it('expands _default + per-id overrides for globalMarkers', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          mixed: {
            surfaces: {
              globalMarkers: {
                _default: 'public',
                cap_boobyTraps: 'hidden',
              } as unknown as GameSpecObservabilitySection['observers'],
            },
          },
        },
      } as unknown as GameSpecObservabilitySection,
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const profile = result.observers['mixed']!;
    assert.equal(profile.surfaces.globalMarkers['cap_boobyTraps']!.current, 'hidden');
    assert.equal(profile.surfaces.globalMarkers['cap_cadres']!.current, 'public');
  });

  // -----------------------------------------------------------------------
  // Victory surface overrides
  // -----------------------------------------------------------------------

  it('victory surface overrides are applied correctly', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          victoryVisible: {
            surfaces: {
              victory: { currentMargin: 'public', currentRank: 'public' },
            },
          },
        },
      },
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    assert.equal(result.observers['victoryVisible']!.surfaces.victory.currentMargin.current, 'public');
    assert.equal(result.observers['victoryVisible']!.surfaces.victory.currentRank.current, 'public');
  });

  // -----------------------------------------------------------------------
  // Extends with per-variable map
  // -----------------------------------------------------------------------

  it('child inherits parent per-variable map and can override individual vars', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerObservers(
      {
        observers: {
          parentProfile: {
            surfaces: {
              perPlayerVars: {
                _default: 'seatVisible',
                resources: 'public',
              } as unknown as GameSpecObservabilitySection['observers'],
            },
          },
          childProfile: {
            extends: 'parentProfile',
            surfaces: {
              perPlayerVars: {
                resources: 'hidden',
              } as unknown as GameSpecObservabilitySection['observers'],
            },
          },
        },
      } as unknown as GameSpecObservabilitySection,
      diagnostics,
      DEFAULT_OPTIONS,
    );
    assert.ok(result);
    assert.equal(errors(diagnostics).length, 0);

    const child = result.observers['childProfile']!;

    // 'resources' overridden by child to hidden
    assert.equal(child.surfaces.perPlayerVars['resources']!.current, 'hidden');

    // 'health' inherited from parent (_default: seatVisible)
    assert.equal(child.surfaces.perPlayerVars['health']!.current, 'seatVisible');
  });
});
