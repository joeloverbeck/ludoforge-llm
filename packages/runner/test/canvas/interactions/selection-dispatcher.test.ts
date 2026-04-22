import { describe, expect, it, vi } from 'vitest';

import { dispatchCanvasSelection } from '../../../src/canvas/interactions/selection-dispatcher';

describe('dispatchCanvasSelection', () => {
  it('dispatches zone selection through submitChoice', () => {
    const submitChoice = vi.fn();
    const store = { submitChoice } as const;

    dispatchCanvasSelection(store as never, { type: 'zone', id: 'zone:1' });

    expect(submitChoice).toHaveBeenCalledWith('zone:1');
  });

  it('dispatches token selection through submitChoice', () => {
    const submitChoice = vi.fn();
    const store = { submitChoice } as const;

    dispatchCanvasSelection(store as never, { type: 'token', id: 'token:7' });

    expect(submitChoice).toHaveBeenCalledWith('token:7');
  });
});
