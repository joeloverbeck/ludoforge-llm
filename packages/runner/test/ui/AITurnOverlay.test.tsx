// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { AITurnOverlay } from '../../src/ui/AITurnOverlay.js';

afterEach(() => {
  cleanup();
});

function createAiTurnStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly requestAiTurnSkip?: GameStore['requestAiTurnSkip'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      requestAiTurnSkip: state.requestAiTurnSkip ?? (() => {}),
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

  it('Skip button dispatches requestAiTurnSkip', () => {
    const requestAiTurnSkip = vi.fn();

    render(createElement(AITurnOverlay, {
      store: createAiTurnStore({
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(1),
        }),
        requestAiTurnSkip,
      }),
    }));

    fireEvent.click(screen.getByTestId('ai-turn-skip'));
    expect(requestAiTurnSkip).toHaveBeenCalledTimes(1);
  });

  it('keeps overlay controls pointer-active via CSS contract', () => {
    const css = readFileSync('src/ui/AITurnOverlay.module.css', 'utf-8');
    const containerBlock = css.match(/\.container\s*\{[^}]*\}/u)?.[0] ?? '';
    const skipButtonBlock = css.match(/\.skipButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(containerBlock).toContain('pointer-events: auto;');
    expect(skipButtonBlock).toContain('pointer-events: auto;');
  });
});
