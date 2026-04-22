import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../src/store/game-store.js';
import type { ActionTooltipSourceKey } from '../../src/ui/action-tooltip-source-key.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { ActionToolbar } from '../../src/ui/ActionToolbar.js';

type TraversableElement = ReactElement<{
  readonly children?: ReactNode;
  readonly onClick?: () => void;
  readonly onPointerEnter?: (e: { readonly currentTarget: HTMLElement }) => void;
  readonly onPointerLeave?: () => void;
  readonly disabled?: boolean;
  readonly ['data-testid']?: string;
  readonly ['aria-disabled']?: 'true';
}>;

const DEFAULT_ACTION_GROUPS: NonNullable<GameStore['renderModel']>['actionGroups'] = [
  {
    groupKey: 'core',
    groupName: 'Core',
    actions: [
      { actionId: 'move', displayName: 'Move', isAvailable: true },
      { actionId: 'pass', displayName: 'Pass', isAvailable: false },
    ],
  },
  {
    groupKey: 'special',
    groupName: 'Special',
    actions: [{ actionId: 'trade', displayName: 'Trade', isAvailable: true }],
  },
];

function makeToolbarRenderModel(
  overrides: Partial<NonNullable<GameStore['renderModel']>> = {},
): NonNullable<GameStore['renderModel']> {
  return makeRenderModel({
    actionGroups: DEFAULT_ACTION_GROUPS,
    ...overrides,
  });
}

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

function createToolbarStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly submitActionSelection?: GameStore['submitActionSelection'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      submitActionSelection: state.submitActionSelection ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('ActionToolbar', () => {
  it('renders action buttons from grouped RenderActionGroup data', () => {
    const store = createToolbarStore({
      renderModel: makeToolbarRenderModel(),
    });

    const html = renderToStaticMarkup(createElement(ActionToolbar, { store, surfaceRevision: 7 }));

    expect(html).toContain('data-testid="action-toolbar"');
    expect(html).toContain('Core');
    expect(html).toContain('Special');
    expect(html).toContain('Move');
    expect(html).toContain('Trade');
  });

  it('renders disabled actions with aria-disabled="true"', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
    });

    const disabledButton = findElementByTestId(tree, 'action-core-pass');
    expect(disabledButton).not.toBeNull();
    if (disabledButton === null) {
      throw new Error('Expected disabled action button.');
    }

    expect(disabledButton.props.disabled).toBe(true);
    expect(disabledButton.props['aria-disabled']).toBe('true');
  });

  it('clicking an available action dispatches submitActionSelection with actionClass', () => {
    const submitActionSelection = vi.fn(async () => {});

    const actionsWithClass: NonNullable<GameStore['renderModel']>['actionGroups'] = [
      {
        groupKey: 'operation',
        groupName: 'Operation',
        actions: [
          { actionId: 'train', displayName: 'Train', isAvailable: true, actionClass: 'operation' },
        ],
      },
    ];

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel({ actionGroups: actionsWithClass }),
        submitActionSelection,
      }),
      surfaceRevision: 7,
    });

    const trainButton = findElementByTestId(tree, 'action-operation-train');
    expect(trainButton).not.toBeNull();
    if (trainButton === null || trainButton.props.onClick === undefined) {
      throw new Error('Expected train action click handler.');
    }

    trainButton.props.onClick();
    expect(submitActionSelection).toHaveBeenCalledTimes(1);
    expect(submitActionSelection).toHaveBeenCalledWith('train', 'operation');
  });

  it('clicking an action without actionClass passes undefined', () => {
    const submitActionSelection = vi.fn(async () => {});

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
        submitActionSelection,
      }),
      surfaceRevision: 7,
    });

    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null || moveButton.props.onClick === undefined) {
      throw new Error('Expected move action click handler.');
    }

    moveButton.props.onClick();
    expect(submitActionSelection).toHaveBeenCalledTimes(1);
    expect(submitActionSelection).toHaveBeenCalledWith('move', undefined);
  });

  it('does not render when renderModel is null', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: null,
      }),
      surfaceRevision: 7,
    });

    expect(tree).toBeNull();
  });

  it('does not render when action groups have no actions', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel({
          actionGroups: [{ groupKey: 'empty', groupName: 'Empty', actions: [] }],
        }),
      }),
      surfaceRevision: 7,
    });

    expect(tree).toBeNull();
  });

  it('groups actions by groupName', () => {
    const html = renderToStaticMarkup(
      createElement(ActionToolbar, {
        store: createToolbarStore({
          renderModel: makeToolbarRenderModel(),
        }),
        surfaceRevision: 7,
      }),
    );

    expect(html).toContain('data-testid="action-group-core"');
    expect(html).toContain('data-testid="action-group-special"');
  });

  it('does not render hint spans inside action buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ActionToolbar, {
        store: createToolbarStore({
          renderModel: makeToolbarRenderModel(),
        }),
        surfaceRevision: 7,
      }),
    );

    expect(html).not.toContain('class="hint"');
    expect(html).toContain('Move');
    expect(html).toContain('Pass');
    expect(html).toContain('Trade');
  });

  it('each action button contains only a label span', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
    });

    const buttons = findElementsByType(tree, 'button');
    expect(buttons).toHaveLength(3);

    for (const button of buttons) {
      const children = button.props.children;
      const child = children as TraversableElement;
      expect(child.type).toBe('span');
    }
  });

  it('keeps interactive controls pointer-active via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/ActionToolbar.module.css', import.meta.url), 'utf-8');
    const toolbarBlock = css.match(/\.toolbar\s*\{[^}]*\}/u)?.[0] ?? '';
    const buttonBlock = css.match(/\.actionButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(toolbarBlock).toContain('pointer-events: auto;');
    expect(buttonBlock).toContain('pointer-events: auto;');
  });

  it('buttons have onPointerEnter/onPointerLeave props when callbacks provided', () => {
    const onActionHoverStart = vi.fn();
    const onActionHoverEnd = vi.fn();

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
      onActionHoverStart,
      onActionHoverEnd,
    });

    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null) {
      throw new Error('Expected move button.');
    }

    expect(moveButton.props.onPointerEnter).toEqual(expect.any(Function));
    expect(moveButton.props.onPointerLeave).toEqual(expect.any(Function));
  });

  it('onPointerEnter calls onActionHoverStart with structured action identity', () => {
    const onActionHoverStart = vi.fn();
    const onActionHoverEnd = vi.fn();

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
      onActionHoverStart,
      onActionHoverEnd,
    });

    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null || moveButton.props.onPointerEnter === undefined) {
      throw new Error('Expected move button with onPointerEnter.');
    }

    const fakeElement = {} as HTMLElement;
    moveButton.props.onPointerEnter({ currentTarget: fakeElement });
    expect(onActionHoverStart).toHaveBeenCalledTimes(1);
    expect(onActionHoverStart).toHaveBeenCalledWith({
      playerId: 0,
      groupKey: 'core',
      actionId: 'move',
      surfaceRevision: 7,
    }, fakeElement);
  });

  it('onPointerLeave calls onActionHoverEnd', () => {
    const onActionHoverStart = vi.fn();
    const onActionHoverEnd = vi.fn();

    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
      onActionHoverStart,
      onActionHoverEnd,
    });

    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null || moveButton.props.onPointerLeave === undefined) {
      throw new Error('Expected move button with onPointerLeave.');
    }

    moveButton.props.onPointerLeave();
    expect(onActionHoverEnd).toHaveBeenCalledTimes(1);
  });

  it('renders without errors when callbacks not provided', () => {
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 7,
    });

    expect(tree).not.toBeNull();
    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null) {
      throw new Error('Expected move button.');
    }

    // onPointerEnter/onPointerLeave should not throw when callbacks are undefined
    expect(moveButton.props.onPointerEnter).toEqual(expect.any(Function));
    expect(moveButton.props.onPointerLeave).toEqual(expect.any(Function));
  });

  it('emits structured hover source metadata with stable player, group, action, and surface identity', () => {
    const onActionHoverStart = vi.fn();
    const tree = ActionToolbar({
      store: createToolbarStore({
        renderModel: makeToolbarRenderModel(),
      }),
      surfaceRevision: 42,
      onActionHoverStart,
    });

    const moveButton = findElementByTestId(tree, 'action-core-move');
    expect(moveButton).not.toBeNull();
    if (moveButton === null || moveButton.props.onPointerEnter === undefined) {
      throw new Error('Expected move action hover handler.');
    }

    const currentTarget = {} as HTMLElement;
    moveButton.props.onPointerEnter({ currentTarget });

    expect(onActionHoverStart).toHaveBeenCalledTimes(1);
    expect(onActionHoverStart).toHaveBeenCalledWith({
      playerId: 0,
      groupKey: 'core',
      actionId: 'move',
      surfaceRevision: 42,
    } satisfies ActionTooltipSourceKey, currentTarget);
  });
});
