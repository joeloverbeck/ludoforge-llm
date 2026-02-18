import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../src/store/game-store.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { UndoControl } from '../../src/ui/UndoControl.js';

type TraversableElement = ReactElement<{
  readonly children?: ReactNode;
  readonly onClick?: () => void;
  readonly ['data-testid']?: string;
}>;

function findElementByTestId(node: ReactNode, testId: string): TraversableElement | null {
  if (!isValidElement(node)) {
    return null;
  }

  const element = node as TraversableElement;
  if (element.props['data-testid'] === testId) {
    return element;
  }

  const children = element.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByTestId(child, testId);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  return findElementByTestId(children, testId);
}

function createUndoStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly undo?: GameStore['undo'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      undo: state.undo ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('UndoControl', () => {
  it('renders undo button when renderModel is present', () => {
    const html = renderToStaticMarkup(
      createElement(UndoControl, {
        store: createUndoStore({
          renderModel: makeRenderModel(),
        }),
      }),
    );

    expect(html).toContain('data-testid="undo-control"');
    expect(html).toContain('Undo');
  });

  it('clicking undo dispatches undo()', () => {
    const undo = vi.fn(async () => {});

    const tree = UndoControl({
      store: createUndoStore({
        renderModel: makeRenderModel(),
        undo,
      }),
    });

    const undoButton = findElementByTestId(tree, 'undo-control');
    expect(undoButton).not.toBeNull();
    if (undoButton === null || undoButton.props.onClick === undefined) {
      throw new Error('Expected undo click handler.');
    }

    undoButton.props.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('is hidden when renderModel is null', () => {
    const tree = UndoControl({
      store: createUndoStore({
        renderModel: null,
      }),
    });

    expect(tree).toBeNull();
  });

  it('keeps interactive controls pointer-active via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/UndoControl.module.css', import.meta.url), 'utf-8');
    const containerBlock = css.match(/\.container\s*\{[^}]*\}/u)?.[0] ?? '';
    const buttonBlock = css.match(/\.undoButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(containerBlock).toContain('pointer-events: auto;');
    expect(buttonBlock).toContain('pointer-events: auto;');
  });
});
