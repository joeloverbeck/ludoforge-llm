// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { AITurnOverlay } from '../../src/ui/AITurnOverlay.js';

function createAiTurnStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly resolveAiTurn?: GameStore['resolveAiTurn'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      resolveAiTurn: state.resolveAiTurn ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('AITurnOverlay', () => {
  it('renders when active player is not human', () => {
    const html = renderToStaticMarkup(
      createElement(AITurnOverlay, {
        store: createAiTurnStore({
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
            players: [
              {
                id: asPlayerId(0),
                displayName: 'Human',
                isHuman: true,
                isActive: false,
                isEliminated: false,
                factionId: null,
              },
              {
                id: asPlayerId(1),
                displayName: 'AI Opponent',
                isHuman: false,
                isActive: true,
                isEliminated: false,
                factionId: 'empire',
              },
            ],
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="ai-turn-overlay"');
  });

  it('does not render when active player is human', () => {
    const tree = AITurnOverlay({
      store: createAiTurnStore({
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(0),
        }),
      }),
    });

    expect(tree).toBeNull();
  });

  it('shows active AI player display name', () => {
    const html = renderToStaticMarkup(
      createElement(AITurnOverlay, {
        store: createAiTurnStore({
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
            players: [
              {
                id: asPlayerId(0),
                displayName: 'Human',
                isHuman: true,
                isActive: false,
                isEliminated: false,
                factionId: null,
              },
              {
                id: asPlayerId(1),
                displayName: 'AI Commander',
                isHuman: false,
                isActive: true,
                isEliminated: false,
                factionId: null,
              },
            ],
          }),
        }),
      }),
    );

    expect(html).toContain('AI Commander');
  });

  it('applies faction color border style from factionId', () => {
    const html = renderToStaticMarkup(
      createElement(AITurnOverlay, {
        store: createAiTurnStore({
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
            players: [
              {
                id: asPlayerId(0),
                displayName: 'Human',
                isHuman: true,
                isActive: false,
                isEliminated: false,
                factionId: null,
              },
              {
                id: asPlayerId(1),
                displayName: 'AI Commander',
                isHuman: false,
                isActive: true,
                isEliminated: false,
                factionId: 'empire',
              },
            ],
          }),
        }),
      }),
    );

    expect(html).toContain('border-color:var(--faction-empire, var(--faction-1))');
  });

  it('renders CSS-only thinking indicator', () => {
    const html = renderToStaticMarkup(
      createElement(AITurnOverlay, {
        store: createAiTurnStore({
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="ai-turn-indicator"');
  });

  it('Skip button dispatches resolveAiTurn', () => {
    const resolveAiTurn = vi.fn(async () => {});

    render(createElement(AITurnOverlay, {
      store: createAiTurnStore({
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(1),
        }),
        resolveAiTurn,
      }),
    }));

    fireEvent.click(screen.getByTestId('ai-turn-skip'));
    expect(resolveAiTurn).toHaveBeenCalledTimes(1);
  });

  it('renders speed selector buttons and keeps selected option in local state', () => {
    render(createElement(AITurnOverlay, {
      store: createAiTurnStore({
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(1),
        }),
      }),
    }));

    const speed1 = screen.getByTestId('ai-speed-1x');
    const speed2 = screen.getByTestId('ai-speed-2x');
    const speed4 = screen.getByTestId('ai-speed-4x');

    expect(speed1).not.toBeNull();
    expect(speed2).not.toBeNull();
    expect(speed4).not.toBeNull();
    expect(speed1.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(speed4);

    expect(speed1.getAttribute('aria-pressed')).toBe('false');
    expect(speed4.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps overlay controls pointer-active via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/AITurnOverlay.module.css', import.meta.url), 'utf-8');
    const containerBlock = css.match(/\.container\s*\{[^}]*\}/u)?.[0] ?? '';
    const skipButtonBlock = css.match(/\.skipButton\s*\{[^}]*\}/u)?.[0] ?? '';
    const speedButtonBlock = css.match(/\.speedButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(containerBlock).toContain('pointer-events: auto;');
    expect(skipButtonBlock).toContain('pointer-events: auto;');
    expect(speedButtonBlock).toContain('pointer-events: auto;');
  });
});
