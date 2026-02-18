import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { TurnOrderDisplay } from '../../src/ui/TurnOrderDisplay.js';
import styles from '../../src/ui/TurnOrderDisplay.module.css';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

describe('TurnOrderDisplay', () => {
  it('renders all players from turnOrder', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Human',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: 'usa',
            },
            {
              id: asPlayerId(1),
              displayName: 'AI',
              isHuman: false,
              isActive: false,
              isEliminated: true,
              factionId: null,
            },
          ],
        })),
      }),
    );

    expect(html).toContain('Human');
    expect(html).toContain('AI');
  });

  it('applies active styling to the active player chip', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({ activePlayerID: asPlayerId(1) })),
      }),
    );

    expect(html).toContain(styles.active);
  });

  it('applies eliminated styling to eliminated players', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Human',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: 'usa',
            },
            {
              id: asPlayerId(1),
              displayName: 'AI',
              isHuman: false,
              isActive: false,
              isEliminated: true,
              factionId: null,
            },
          ],
        })),
      }),
    );

    expect(html).toContain(styles.eliminated);
  });

  it('skips unknown player IDs in turnOrder without crashing', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Human',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: 'usa',
            },
            {
              id: asPlayerId(1),
              displayName: 'AI',
              isHuman: false,
              isActive: false,
              isEliminated: true,
              factionId: null,
            },
          ],
          turnOrder: [asPlayerId(0), asPlayerId(99), asPlayerId(1)],
        })),
      }),
    );

    const chips = html.match(/data-testid="turn-order-player-/gu) ?? [];
    expect(chips).toHaveLength(2);
    expect(html).toContain('Human');
    expect(html).toContain('AI');
  });

  it('does not render when renderModel is null', () => {
    const tree = TurnOrderDisplay({
      store: createStore(null),
    });

    expect(tree).toBeNull();
  });
});
