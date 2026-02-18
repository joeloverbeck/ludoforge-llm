import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { ActionToolbar } from '../../src/ui/ActionToolbar.js';

type TraversableElement = ReactElement<{
  readonly children?: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly ['data-testid']?: string;
  readonly ['aria-disabled']?: 'true';
}>;

function findElementsByType(node: ReactNode, type: string): TraversableElement[] {
  if (!isValidElement(node)) {
    return [];
  }

  const element = node as TraversableElement;
  const matches = element.type === type ? [element] : [];
  const children = element.props.children;

  if (Array.isArray(children)) {
    return [...matches, ...children.flatMap((child) => findElementsByType(child, type))];
  }

  return [...matches, ...findElementsByType(children, type)];
}

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

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
    mapSpaces: [],
    tokens: [],
    globalVars: [],
    playerVars: new Map(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'Player 0',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: null,
      },
      {
        id: asPlayerId(1),
        displayName: 'Player 1',
        isHuman: false,
        isActive: false,
        isEliminated: false,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0), asPlayerId(1)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [
      {
        groupName: 'Core',
        actions: [
          { actionId: 'move', displayName: 'Move', isAvailable: true },
          { actionId: 'pass', displayName: 'Pass', isAvailable: false },
        ],
      },
      {
        groupName: 'Special',
        actions: [{ actionId: 'trade', displayName: 'Trade', isAvailable: true }],
      },
    ],
    choiceBreadcrumb: [],
    currentChoiceOptions: null,
    currentChoiceDomain: null,
    choiceType: null,
    choiceMin: null,
    choiceMax: null,
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function createToolbarStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly selectAction?: GameStore['selectAction'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      selectAction: state.selectAction ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('ActionToolbar', () => {
  it('renders action buttons from grouped RenderActionGroup data', () => {
    const store = createToolbarStore({
      renderModel: makeRenderModel(),
    });

    const html = renderToStaticMarkup(createElement(ActionToolbar, { store }));

    expect(html).toContain('data-testid="action-toolbar"');
    expect(html).toContain('Core');
    expect(html).toContain('Special');
    expect(html).toContain('Move');
    expect(html).toContain('Trade');
  });

  it('renders disabled actions with aria-disabled="true"', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeRenderModel(),
      }),
    });

    const disabledButton = findElementByTestId(tree, 'action-pass');
    expect(disabledButton).not.toBeNull();
    if (disabledButton === null) {
      throw new Error('Expected disabled action button.');
    }

    expect(disabledButton.props.disabled).toBe(true);
    expect(disabledButton.props['aria-disabled']).toBe('true');
  });

  it('clicking an available action dispatches selectAction', () => {
    const selectAction = vi.fn(async () => {});

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeRenderModel(),
        selectAction,
      }),
    });

    const moveButton = findElementByTestId(tree, 'action-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null || moveButton.props.onClick === undefined) {
      throw new Error('Expected move action click handler.');
    }

    moveButton.props.onClick();
    expect(selectAction).toHaveBeenCalledTimes(1);
    expect(selectAction).toHaveBeenCalledWith('move');
  });

  it('does not render when renderModel is null', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: null,
      }),
    });

    expect(tree).toBeNull();
  });

  it('does not render when action groups have no actions', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeRenderModel({
          actionGroups: [{ groupName: 'Empty', actions: [] }],
        }),
      }),
    });

    expect(tree).toBeNull();
  });

  it('groups actions by groupName', () => {
    const html = renderToStaticMarkup(
      createElement(ActionToolbar, {
        store: createToolbarStore({
          renderModel: makeRenderModel(),
        }),
      }),
    );

    expect(html).toContain('data-testid="action-group-Core"');
    expect(html).toContain('data-testid="action-group-Special"');
  });

  it('renders number hints in flattened visual order', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeRenderModel(),
      }),
    });

    const buttons = findElementsByType(tree, 'button');
    const hints = buttons.map((button) => {
      const children = button.props.children;
      if (!Array.isArray(children) || !isValidElement(children[0])) {
        return null;
      }
      const hint = children[0] as ReactElement<{ children?: ReactNode }>;
      return hint.props.children;
    });

    expect(hints).toEqual([1, 2, 3]);
  });

  it('keeps interactive controls pointer-active via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/ActionToolbar.module.css', import.meta.url), 'utf-8');
    const toolbarBlock = css.match(/\.toolbar\s*\{[^}]*\}/u)?.[0] ?? '';
    const buttonBlock = css.match(/\.actionButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(toolbarBlock).toContain('pointer-events: auto;');
    expect(buttonBlock).toContain('pointer-events: auto;');
  });
});
