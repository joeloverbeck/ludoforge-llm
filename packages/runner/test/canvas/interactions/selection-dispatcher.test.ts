import { describe, expect, it, vi } from 'vitest';

import { dispatchCanvasSelection } from '../../../src/canvas/interactions/selection-dispatcher';

describe('dispatchCanvasSelection', () => {
  it('dispatches zone selection through chooseOne', () => {
    const chooseOne = vi.fn();
    const store = { chooseOne } as const;

    dispatchCanvasSelection(store as never, { type: 'zone', id: 'zone:1' });

    expect(chooseOne).toHaveBeenCalledWith('zone:1');
  });

  it('dispatches token selection through chooseOne', () => {
    const chooseOne = vi.fn();
    const store = { chooseOne } as const;

    dispatchCanvasSelection(store as never, { type: 'token', id: 'token:7' });

    expect(chooseOne).toHaveBeenCalledWith('token:7');
  });
});
