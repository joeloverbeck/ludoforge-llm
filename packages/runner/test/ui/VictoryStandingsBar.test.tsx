// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VisualConfigContext } from '../../src/config/visual-config-context.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { VictoryStandingsBar } from '../../src/ui/VictoryStandingsBar.js';
import { createRenderModelStore, makeRenderModelFixture } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

afterEach(() => {
  cleanup();
});

function renderVictoryStandingsBar(includeMapBasesMetadata: boolean = true) {
  const store = createRenderModelStore(makeRenderModelFixture({
    victoryStandings: [
      {
        seat: 'vc',
        score: 18,
        threshold: 25,
        rank: 1,
        components: [
          {
            componentId: 'markerTotal',
            aggregate: 11,
            spaces: [
              {
                spaceId: 'saigon:none',
                displayName: 'Saigon',
                contribution: 6,
                factors: { population: 3, multiplier: 2 },
              },
              {
                spaceId: 'hue:none',
                displayName: 'Hue',
                contribution: 5,
                factors: { population: 5, multiplier: 1 },
              },
              {
                spaceId: 'can-tho:none',
                displayName: 'Can Tho',
                contribution: 0,
                factors: { population: 4, multiplier: 0 },
              },
            ],
          },
          {
            componentId: 'mapBases',
            aggregate: 7,
            spaces: [
              {
                spaceId: 'tay-ninh:none',
                displayName: 'Tay Ninh',
                contribution: 1,
                factors: { count: 1 },
              },
            ],
          },
        ],
      },
    ],
  }));

  const provider = new VisualConfigProvider({
    version: 1,
    factions: {
      vc: {
        displayName: 'Viet Cong',
      },
    },
    victoryStandings: {
      tooltipBreakdowns: [
        {
          seat: 'vc',
          components: [
            ...(includeMapBasesMetadata
              ? [{
                  componentId: 'mapBases' as const,
                  label: 'VC Bases on Map',
                }]
              : []),
            {
              componentId: 'markerTotal',
              label: 'Total Opposition',
              description: 'Population-weighted opposition',
              detailTemplate: '(pop {population}) x{multiplier} = {contribution}',
            },
          ],
        },
      ],
    },
  });

  return render(
    createElement(
      VisualConfigContext.Provider,
      { value: provider },
      createElement(VictoryStandingsBar, { store }),
    ),
  );
}

describe('VictoryStandingsBar', () => {
  it('expands component breakdowns, filters zero contributions, sorts by contribution, and shows the summary', () => {
    renderVictoryStandingsBar();

    fireEvent.pointerEnter(screen.getByTestId('victory-entry-vc'));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Total Opposition' }));

    const breakdown = screen.getByTestId('victory-breakdown-vc-markerTotal');
    const itemTexts = Array.from(breakdown.querySelectorAll('div'))
      .map((element) => element.textContent)
      .filter((value): value is string => value !== null && value.includes('='));

    expect(itemTexts).toEqual([
      'Saigon(pop 3) x2 = 6',
      'Hue(pop 5) x1 = 5',
    ]);
    expect(within(breakdown).queryByText('Can Tho')).toBeNull();
    expect(within(breakdown).getByText('(2 of 3 spaces contribute)')).toBeTruthy();
  });

  it('keeps the tooltip open when moving from the score entry into the tooltip body', () => {
    renderVictoryStandingsBar();

    const entry = screen.getByTestId('victory-entry-vc');
    fireEvent.pointerEnter(entry);

    const tooltip = screen.getByTestId('victory-tooltip-vc');
    fireEvent.pointerLeave(entry, { relatedTarget: tooltip });

    expect(screen.getByTestId('victory-tooltip-vc')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Total Opposition' }));
    expect(screen.getByTestId('victory-breakdown-vc-markerTotal')).toBeTruthy();

    fireEvent.pointerLeave(tooltip, { relatedTarget: null });
    expect(screen.queryByTestId('victory-tooltip-vc')).toBeNull();
  });

  it('falls back to a formatted component id and contribution-only detail when metadata is missing', () => {
    renderVictoryStandingsBar(false);

    fireEvent.pointerEnter(screen.getByTestId('victory-entry-vc'));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Map Bases' }));

    const breakdown = screen.getByTestId('victory-breakdown-vc-mapBases');
    expect(screen.getByText('Map Bases')).toBeTruthy();
    expect(within(breakdown).getByText('Tay Ninh')).toBeTruthy();
    expect(within(breakdown).getByText('1')).toBeTruthy();
  });
});
