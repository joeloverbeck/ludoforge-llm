import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { ChoicePanel, countChoicesToCancel, rewindChoiceToBreadcrumb } from '../../src/ui/ChoicePanel.js';

type TraversableElement = ReactElement<{
  readonly children?: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
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
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function createChoiceStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly selectedAction?: GameStore['selectedAction'];
  readonly partialMove?: GameStore['partialMove'];
  readonly chooseOne?: GameStore['chooseOne'];
  readonly cancelChoice?: GameStore['cancelChoice'];
  readonly cancelMove?: GameStore['cancelMove'];
  readonly confirmMove?: GameStore['confirmMove'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      selectedAction: state.selectedAction ?? null,
      partialMove: state.partialMove ?? null,
      chooseOne: state.chooseOne ?? (async () => {}),
      cancelChoice: state.cancelChoice ?? (async () => {}),
      cancelMove: state.cancelMove ?? (() => {}),
      confirmMove: state.confirmMove ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('ChoicePanel', () => {
  function makeChoiceOption(
    value: string | number | boolean | readonly (string | number | boolean)[],
    displayName: string,
    legality: 'legal' | 'illegal' | 'unknown' = 'legal',
    illegalReason: string | null = null,
  ) {
    return {
      choiceValueId: serializeChoiceValueIdentity(value),
      value,
      displayName,
      legality,
      illegalReason,
    } as const;
  }

  function makeBreadcrumbStep(
    decisionId: string,
    name: string,
    chosenValue: string | number | boolean | readonly (string | number | boolean)[],
    chosenDisplayName: string,
  ) {
    return {
      decisionId,
      name,
      displayName: name,
      chosenValueId: serializeChoiceValueIdentity(chosenValue),
      chosenValue,
      chosenDisplayName,
    } as const;
  }

  function choiceOptionTestId(value: string | number | boolean | readonly (string | number | boolean)[]): string {
    return `choice-option-${serializeChoiceValueIdentity(value)}`;
  }

  it('renders breadcrumb chips from choiceBreadcrumb', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              options: [makeChoiceOption('zone-c', 'Zone C')],
            },
            choiceBreadcrumb: [
              makeBreadcrumbStep('step-1', 'first', 'zone-a', 'Zone A'),
              makeBreadcrumbStep('step-2', 'second', 'zone-b', 'Zone B'),
            ],
          }),
        }),
      }),
    );

    expect(html).toContain('Zone A');
    expect(html).toContain('Zone B');
    expect(html).toContain('data-testid="choice-breadcrumb-current"');
  });

  it('computes breadcrumb rewind count from total steps and clicked index', () => {
    expect(countChoicesToCancel(3, 0)).toBe(2);
    expect(countChoicesToCancel(3, 1)).toBe(1);
    expect(countChoicesToCancel(3, 2)).toBe(0);
    expect(countChoicesToCancel(3, 3)).toBe(0);
  });

  it('rewinds breadcrumb by dispatching cancelChoice() the expected number of times', async () => {
    const cancelChoice = vi.fn(async () => {});
    const store = createChoiceStore({
      renderModel: makeRenderModel(),
      cancelChoice,
    });
    await rewindChoiceToBreadcrumb(store, 3, 1);

    expect(cancelChoice).toHaveBeenCalledTimes(1);
  });

  it('Back dispatches cancelChoice and is disabled when breadcrumb is empty', () => {
    const cancelChoice = vi.fn(async () => {});
    const tree = ChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
          choiceBreadcrumb: [],
        }),
        cancelChoice,
      }),
    });

    const backButton = findElementByTestId(tree, 'choice-back');
    expect(backButton).not.toBeNull();
    if (backButton === null || backButton.props.onClick === undefined) {
      throw new Error('Expected Back button.');
    }

    expect(backButton.props.disabled).toBe(true);
    expect(cancelChoice).toHaveBeenCalledTimes(0);
  });

  it('Back dispatches cancelChoice when breadcrumb has prior steps', () => {
    const cancelChoice = vi.fn(async () => {});
    const tree = ChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
          choiceBreadcrumb: [
            makeBreadcrumbStep('step-1', 'first', 'zone-a', 'Zone A'),
          ],
        }),
        cancelChoice,
      }),
    });

    const backButton = findElementByTestId(tree, 'choice-back');
    expect(backButton).not.toBeNull();
    if (backButton === null || backButton.props.onClick === undefined) {
      throw new Error('Expected Back button.');
    }

    expect(backButton.props.disabled).toBe(false);
    backButton.props.onClick();
    expect(cancelChoice).toHaveBeenCalledTimes(1);
  });

  it('Cancel dispatches cancelMove', () => {
    const cancelMove = vi.fn();
    const tree = ChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
        }),
        cancelMove,
      }),
    });

    const cancelButton = findElementByTestId(tree, 'choice-cancel');
    expect(cancelButton).not.toBeNull();
    if (cancelButton === null || cancelButton.props.onClick === undefined) {
      throw new Error('Expected Cancel button.');
    }

    cancelButton.props.onClick();
    expect(cancelMove).toHaveBeenCalledTimes(1);
  });

  it('Mode A renders legal options enabled and non-legal options disabled with illegality feedback', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              options: [
                makeChoiceOption('zone-a', 'Zone A'),
                makeChoiceOption('zone-b', 'Zone B', 'illegal', 'blocked'),
              ],
            },
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-mode-discrete"');
    expect(html).toContain(`data-testid="${choiceOptionTestId('zone-a')}"`);
    expect(html).toContain(`data-testid="${choiceOptionTestId('zone-b')}"`);
    expect(html).toContain('data-testid="illegality-feedback"');
  });

  it('clicking a legal option dispatches chooseOne(value)', () => {
    const chooseOne = vi.fn(async () => {});

    const tree = ChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
        }),
        chooseOne,
      }),
    });

    const option = findElementByTestId(tree, choiceOptionTestId('zone-a'));
    expect(option).not.toBeNull();
    if (option === null || option.props.onClick === undefined) {
      throw new Error('Expected legal option button click handler.');
    }

    option.props.onClick();
    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(chooseOne).toHaveBeenCalledWith('zone-a');
  });

  it('uses stable distinct option identities for scalar/array value collisions', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              options: [
                makeChoiceOption('a,b', 'A B String'),
                makeChoiceOption(['a', 'b'] as const, 'A B Array'),
              ],
            },
          }),
        }),
      }),
    );

    expect(html).toContain(`data-testid="${choiceOptionTestId('a,b')}"`);
    expect(html).toContain(`data-testid="${choiceOptionTestId(['a', 'b'])}"`);
  });

  it('renders confirm button only when move is ready and dispatches confirmMove', () => {
    const confirmMove = vi.fn(async () => {});

    const tree = ChoicePanel({
      mode: 'choiceConfirm',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: { kind: 'confirmReady' },
        }),
        selectedAction: asActionId('pass'),
        partialMove: { actionId: asActionId('pass'), params: {} },
        confirmMove,
      }),
    });

    const confirm = findElementByTestId(tree, 'choice-confirm');
    expect(confirm).not.toBeNull();
    if (confirm === null || confirm.props.onClick === undefined) {
      throw new Error('Expected Confirm button click handler.');
    }

    confirm.props.onClick();
    expect(confirmMove).toHaveBeenCalledTimes(1);
  });

  it('renders placeholders for chooseN and numeric modes', () => {
    const chooseNHtml = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteMany',
              options: [],
              min: 1,
              max: 2,
            },
          }),
        }),
      }),
    );
    expect(chooseNHtml).toContain('data-testid="choice-mode-choose-n-placeholder"');

    const numericHtml = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'numeric',
              domain: { min: 0, max: 3, step: 1 },
            },
          }),
        }),
      }),
    );
    expect(numericHtml).toContain('data-testid="choice-mode-numeric-placeholder"');
  });

  it('keeps interactive controls pointer-active via CSS contract', () => {
    const css = readFileSync(new URL('../../src/ui/ChoicePanel.module.css', import.meta.url), 'utf-8');
    const panelBlock = css.match(/\.panel\s*\{[^}]*\}/u)?.[0] ?? '';
    const breadcrumbStepBlock = css.match(/\.breadcrumbStep\s*\{[^}]*\}/u)?.[0] ?? '';
    const optionButtonBlock = css.match(/\.optionButton\s*\{[^}]*\}/u)?.[0] ?? '';
    const navButtonBlock = css.match(/\.navButton\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(panelBlock).toContain('pointer-events: auto;');
    expect(breadcrumbStepBlock).toContain('pointer-events: auto;');
    expect(optionButtonBlock).toContain('pointer-events: auto;');
    expect(navButtonBlock).toContain('pointer-events: auto;');
  });

  it('does not render confirm button when in choicePending mode', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: { kind: 'confirmReady' },
          }),
          selectedAction: asActionId('pass'),
          partialMove: { actionId: asActionId('pass'), params: {} },
        }),
      }),
    );

    expect(html).not.toContain('data-testid="choice-confirm"');
  });

  it('returns null when mode is choicePending but no pending choice exists', () => {
    const tree = ChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: { kind: 'none' },
        }),
      }),
    });

    expect(tree).toBeNull();
  });

  it('returns null when mode is choiceConfirm but choice is still pending', () => {
    const tree = ChoicePanel({
      mode: 'choiceConfirm',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
              kind: 'discreteOne',
              options: [makeChoiceOption('zone-a', 'Zone A')],
            },
        }),
      }),
    });

    expect(tree).toBeNull();
  });

  it('renders deterministic non-interactive output for invalid mode', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choiceInvalid',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: { kind: 'invalid', reason: 'ACTION_MOVE_MISMATCH' },
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-mode-invalid"');
    expect(html).toContain('Invalid choice UI state (ACTION_MOVE_MISMATCH)');
    expect(html).not.toContain('data-testid="choice-back"');
    expect(html).not.toContain('data-testid="choice-cancel"');
    expect(html).not.toContain('data-testid="choice-confirm"');
  });

  it('returns null when mode is choiceInvalid but choiceUi is not invalid', () => {
    const tree = ChoicePanel({
      mode: 'choiceInvalid',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: { kind: 'none' },
        }),
      }),
    });

    expect(tree).toBeNull();
  });
});
