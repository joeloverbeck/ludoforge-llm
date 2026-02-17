import { describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../../src/store/game-store';
import { createCanvasInteractionController } from '../../../src/canvas/interactions/canvas-interaction-controller';

function createState(overrides: Partial<GameStore> = {}): GameStore {
  const chooseOne = vi.fn();
  const base = {
    renderModel: {
      zones: [
        { id: 'zone:a', displayName: 'Zone A', isSelectable: true },
        { id: 'zone:b', displayName: 'Zone B', isSelectable: false },
        { id: 'zone:c', displayName: 'Zone C', isSelectable: true },
      ],
      tokens: [
        { id: 'token:1', type: 'Infantry' },
      ],
    },
    chooseOne,
  } as unknown as GameStore;

  return {
    ...base,
    ...overrides,
  };
}

describe('createCanvasInteractionController', () => {
  it('returns selectable zone ids from current store state dynamically', () => {
    let state = createState();
    const announcer = { announce: vi.fn() };
    const controller = createCanvasInteractionController(() => state, announcer as never);

    expect(controller.getSelectableZoneIDs()).toEqual(['zone:a', 'zone:c']);

    state = createState({
      renderModel: {
        zones: [{ id: 'zone:x', displayName: 'Zone X', isSelectable: true }],
        tokens: [],
      } as never,
    });

    expect(controller.getSelectableZoneIDs()).toEqual(['zone:x']);
  });

  it('tracks focused zone and announces focus label', () => {
    const state = createState();
    const announcer = { announce: vi.fn() };
    const controller = createCanvasInteractionController(() => state, announcer as never);

    controller.onFocusChange('zone:a');
    expect(controller.getFocusedZoneID()).toBe('zone:a');

    controller.onFocusAnnounce('zone:a');
    expect(announcer.announce).toHaveBeenCalledWith('Zone focus: Zone A');
  });

  it('dispatches zone selection, syncs focus, and announces zone selection', () => {
    const state = createState();
    const announcer = { announce: vi.fn() };
    const controller = createCanvasInteractionController(() => state, announcer as never);

    controller.onSelectTarget({ type: 'zone', id: 'zone:a' });

    expect(controller.getFocusedZoneID()).toBe('zone:a');
    expect(state.chooseOne).toHaveBeenCalledWith('zone:a');
    expect(announcer.announce).toHaveBeenCalledWith('Zone selected: Zone A');
  });

  it('dispatches token selection and announces token type', () => {
    const state = createState();
    const announcer = { announce: vi.fn() };
    const controller = createCanvasInteractionController(() => state, announcer as never);

    controller.onSelectTarget({ type: 'token', id: 'token:1' });

    expect(state.chooseOne).toHaveBeenCalledWith('token:1');
    expect(announcer.announce).toHaveBeenCalledWith('Token selected: Infantry');
  });
});
