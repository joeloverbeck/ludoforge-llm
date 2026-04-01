import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import type { GameSpecObservabilitySection } from '../../../src/cnl/game-spec-doc.js';
import { validateObservers, type KnownSurfaceIds } from '../../../src/cnl/validate-observers.js';

function errors(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error');
}

function warnings(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'warning');
}

const DEFAULT_KNOWN_IDS: KnownSurfaceIds = {
  globalVars: new Set(['score', 'round']),
  perPlayerVars: new Set(['health', 'resources']),
  derivedMetrics: new Set(['totalScore']),
};

const EMPTY_KNOWN_IDS: KnownSurfaceIds = {
  globalVars: new Set(),
  perPlayerVars: new Set(),
  derivedMetrics: new Set(),
};

describe('validateObservers', () => {
  it('accepts null observability with no diagnostics', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(null, DEFAULT_KNOWN_IDS, diagnostics);
    assert.equal(diagnostics.length, 0);
  });

  it('accepts empty observers map with no diagnostics', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers({ observers: {} }, DEFAULT_KNOWN_IDS, diagnostics);
    assert.equal(diagnostics.length, 0);
  });

  it('accepts undefined observers with no diagnostics', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers({} as GameSpecObservabilitySection, DEFAULT_KNOWN_IDS, diagnostics);
    assert.equal(diagnostics.length, 0);
  });

  // --- Acceptance Criterion 1: Valid observer profile passes ---
  it('accepts a valid observer profile with shorthand syntax', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          currentPlayer: {
            description: 'Standard player',
            surfaces: {
              globalVars: 'public',
              perPlayerVars: 'seatVisible',
              activeCardIdentity: 'hidden',
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  it('accepts a valid observer profile with full syntax', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          detailed: {
            surfaces: {
              globalVars: {
                current: 'public',
                preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  it('accepts a valid observer with per-variable overrides', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          custom: {
            surfaces: {
              globalVars: {
                _default: 'public',
                score: 'hidden',
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  it('accepts a valid observer with extends', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          base: {
            surfaces: { globalVars: 'public' },
          },
          child: {
            extends: 'base',
            surfaces: { perPlayerVars: 'hidden' },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  it('accepts victory surface overrides', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              victory: {
                currentMargin: 'public',
                currentRank: 'hidden',
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  // --- Acceptance Criterion 2: Unknown surface family key ---
  it('rejects unknown surface family key', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              foo: 'public',
            } as never,
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVER_UNKNOWN_SURFACE_FAMILY');
    assert.ok(errs[0]!.message.includes('foo'));
    assert.ok(errs[0]!.message.includes('player'));
  });

  // --- Acceptance Criterion 3: Invalid visibility class ---
  it('rejects invalid visibility class in shorthand', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              globalVars: 'restricted' as never,
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID');
    assert.ok(errs[0]!.message.includes('restricted'));
  });

  it('rejects invalid visibility class in full syntax current', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              activeCardIdentity: {
                current: 'bogus' as never,
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID');
  });

  it('rejects invalid visibility class in preview.visibility', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              activeCardTag: {
                preview: { visibility: 'bogus' as never },
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID');
  });

  // --- Acceptance Criterion 4: extends referencing non-existent observer ---
  it('rejects extends referencing non-existent observer', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          child: {
            extends: 'nonExistent',
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_EXTENDS_MISSING'));
  });

  // --- Acceptance Criterion 5: extends chain deeper than 1 ---
  it('rejects extends chain deeper than 1', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          grandparent: {
            surfaces: { globalVars: 'public' },
          },
          parent: {
            extends: 'grandparent',
            surfaces: { perPlayerVars: 'hidden' },
          },
          child: {
            extends: 'parent',
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_EXTENDS_DEPTH'));
    assert.ok(errs.some((d) => d.message.includes('child')));
  });

  // --- Acceptance Criterion 6: Circular extends ---
  it('rejects circular extends', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          alpha: {
            extends: 'beta',
          },
          beta: {
            extends: 'alpha',
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_EXTENDS_CIRCULAR'));
  });

  // --- Acceptance Criterion 7: Built-in name collision ---
  it('rejects user-defined observer named "omniscient"', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          omniscient: {
            surfaces: { globalVars: 'public' },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_BUILTIN_NAME_COLLISION'));
    assert.ok(errs.some((d) => d.message.includes('omniscient')));
  });

  it('rejects user-defined observer named "default"', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          default: {
            surfaces: { globalVars: 'public' },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_BUILTIN_NAME_COLLISION'));
    assert.ok(errs.some((d) => d.message.includes('default')));
  });

  // --- Acceptance Criterion 8: Reserved key zones ---
  it('rejects "zones" key in observer profile', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            zones: { deck: 'hidden' },
          } as never,
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_RESERVED_KEY'));
    assert.ok(errs.some((d) => d.message.includes('zones')));
  });

  // --- Acceptance Criterion 9: Per-variable override referencing non-existent globalVar ---
  it('rejects per-variable override referencing non-existent variable', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              globalVars: {
                _default: 'public',
                nonExistentVar: 'hidden',
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_UNKNOWN_VARIABLE'));
    assert.ok(errs.some((d) => d.message.includes('nonExistentVar')));
  });

  it('rejects per-variable override in perPlayerVars referencing non-existent variable', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              perPlayerVars: {
                notAVar: 'public',
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_UNKNOWN_VARIABLE'));
    assert.ok(errs.some((d) => d.message.includes('notAVar')));
  });

  // --- Acceptance Criterion 10: _default in non-map surface ---
  it('rejects _default key in a non-map surface', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              activeCardIdentity: {
                _default: 'public',
              } as never,
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_DEFAULT_IN_SCALAR'));
  });

  // --- Invariant 1: Validation is pure ---
  it('does not mutate the input observability section', () => {
    const observability: GameSpecObservabilitySection = {
      observers: {
        player: {
          description: 'test',
          surfaces: { globalVars: 'public' },
        },
      },
    };
    const snapshot = JSON.stringify(observability);
    const diagnostics: Diagnostic[] = [];
    validateObservers(observability, DEFAULT_KNOWN_IDS, diagnostics);
    assert.equal(JSON.stringify(observability), snapshot);
  });

  // --- Invariant 2: Diagnostics include observer profile name ---
  it('all diagnostics include the observer profile name for traceability', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          myProfile: {
            surfaces: {
              foo: 'public',
            } as never,
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    for (const d of diagnostics) {
      assert.ok(
        d.path.includes('myProfile') || d.message.includes('myProfile'),
        `diagnostic should reference profile name: ${JSON.stringify(d)}`,
      );
    }
  });

  // --- Additional structural checks ---
  it('rejects non-object observability section', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers('not-an-object' as never, DEFAULT_KNOWN_IDS, diagnostics);
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVERS_SECTION_INVALID');
  });

  it('rejects non-object observers map', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers({ observers: 'bad' } as never, DEFAULT_KNOWN_IDS, diagnostics);
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.code === 'CNL_VALIDATOR_OBSERVERS_MAP_REQUIRED');
  });

  it('rejects non-object observer profile', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers({ observers: { bad: 'not-an-object' } } as never, DEFAULT_KNOWN_IDS, diagnostics);
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_PROFILE_INVALID'));
  });

  it('rejects non-boolean allowWhenHiddenSampling', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              activeCardIdentity: {
                preview: { allowWhenHiddenSampling: 'yes' as never },
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_PREVIEW_SAMPLING_INVALID'));
  });

  it('rejects extends to built-in observer names', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          myProfile: {
            extends: 'omniscient',
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_EXTENDS_BUILTIN'));
  });

  it('warns on unknown keys in observer profile', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            someExtra: true,
          } as never,
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const warns = warnings(diagnostics);
    assert.ok(warns.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_UNKNOWN_KEY'));
  });

  it('rejects non-object surfaces', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: 'bad' as never,
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_SURFACES_INVALID'));
  });

  it('accepts per-variable override with full syntax', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              perPlayerVars: {
                _default: 'seatVisible',
                resources: {
                  current: 'public',
                  preview: { visibility: 'hidden', allowWhenHiddenSampling: true },
                },
              },
            },
          },
        },
      },
      DEFAULT_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
  });

  it('works with empty known surface IDs', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              globalVars: 'public',
            },
          },
        },
      },
      EMPTY_KNOWN_IDS,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
  });

  // --- Invariant 3: No game-specific knowledge ---
  it('validates against passed knownSurfaceIds only', () => {
    const customIds: KnownSurfaceIds = {
      globalVars: new Set(['customVar']),
      perPlayerVars: new Set(),
      derivedMetrics: new Set(),
    };
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: {
            surfaces: {
              globalVars: {
                customVar: 'public',
                unknownVar: 'hidden',
              },
            },
          },
        },
      },
      customIds,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.ok(errs[0]!.message.includes('unknownVar'));
    assert.ok(!errs.some((d) => d.message.includes('customVar')));
  });
});
