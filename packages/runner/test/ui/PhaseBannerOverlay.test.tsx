// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../src/store/game-store.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { PhaseBannerOverlay } from '../../src/ui/PhaseBannerOverlay.js';

afterEach(() => {
  cleanup();
});

function createPhaseBannerStore(activePhaseBanner: string | null): StoreApi<GameStore> {
  return {
    getState: () => ({
      activePhaseBanner,
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('PhaseBannerOverlay', () => {
  it('renders banner when activePhaseBanner is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseBannerOverlay, {
        store: createPhaseBannerStore('flop'),
      }),
    );

    expect(html).toContain('data-testid="phase-banner-overlay"');
    expect(html).toContain('Flop');
  });

  it('returns null when activePhaseBanner is null', () => {
    const tree = PhaseBannerOverlay({
      store: createPhaseBannerStore(null),
    });

    expect(tree).toBeNull();
  });

  it('formats phase display name correctly', () => {
    const cases: Array<[string, string]> = [
      ['preflop', 'Preflop'],
      ['hand-setup', 'Hand Setup'],
      ['river', 'River'],
      ['some_phase_name', 'Some Phase Name'],
    ];

    for (const [phaseId, expectedLabel] of cases) {
      const html = renderToStaticMarkup(
        createElement(PhaseBannerOverlay, {
          store: createPhaseBannerStore(phaseId),
        }),
      );

      expect(html).toContain(expectedLabel);
    }
  });

  it('sets accessible aria-label with formatted phase name', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseBannerOverlay, {
        store: createPhaseBannerStore('turn'),
      }),
    );

    expect(html).toContain('aria-label="Phase: Turn"');
    expect(html).toContain('role="status"');
  });
});
