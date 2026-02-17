import { describe, expect, it } from 'vitest';

import { assertLifecycleTransition, lifecycleFromTerminal, type GameLifecycle } from '../../src/store/lifecycle-transition.js';

describe('lifecycle-transition', () => {
  it('accepts configured lifecycle transitions', () => {
    const allowed: ReadonlyArray<readonly [GameLifecycle, GameLifecycle]> = [
      ['idle', 'idle'],
      ['idle', 'initializing'],
      ['initializing', 'idle'],
      ['initializing', 'initializing'],
      ['initializing', 'playing'],
      ['initializing', 'terminal'],
      ['playing', 'initializing'],
      ['playing', 'playing'],
      ['playing', 'terminal'],
      ['terminal', 'initializing'],
      ['terminal', 'playing'],
      ['terminal', 'terminal'],
    ];

    for (const [from, to] of allowed) {
      expect(assertLifecycleTransition(from, to, 'test')).toBe(to);
    }
  });

  it('rejects invalid lifecycle transitions', () => {
    const rejected: ReadonlyArray<readonly [GameLifecycle, GameLifecycle]> = [
      ['idle', 'playing'],
      ['idle', 'terminal'],
    ];

    for (const [from, to] of rejected) {
      expect(() => assertLifecycleTransition(from, to, 'test')).toThrow(`Illegal game lifecycle transition on test: ${from} -> ${to}`);
    }
  });

  it('maps terminal status to playing or terminal lifecycle', () => {
    expect(lifecycleFromTerminal(null)).toBe('playing');
    expect(lifecycleFromTerminal({ type: 'draw' })).toBe('terminal');
  });
});
