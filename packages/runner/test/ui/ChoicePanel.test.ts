// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asActionId } from '@ludoforge/engine/runtime';
import type { DecisionKey } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { ChoicePanel, countChoicesToCancel, rewindChoiceToBreadcrumb } from '../../src/ui/ChoicePanel.js';

afterEach(() => {
  cleanup();
});

function createChoiceStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly selectedAction?: GameStore['selectedAction'];
  readonly partialMove?: GameStore['partialMove'];
  readonly chooseOne?: GameStore['chooseOne'];
  readonly addChooseNItem?: GameStore['addChooseNItem'];
  readonly removeChooseNItem?: GameStore['removeChooseNItem'];
  readonly confirmChooseN?: GameStore['confirmChooseN'];
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
      addChooseNItem: state.addChooseNItem ?? (async () => {}),
      removeChooseNItem: state.removeChooseNItem ?? (async () => {}),
      confirmChooseN: state.confirmChooseN ?? (async () => {}),
      cancelChoice: state.cancelChoice ?? (async () => {}),
      cancelMove: state.cancelMove ?? (() => {}),
      confirmMove: state.confirmMove ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('ChoicePanel', () => {
  function renderChoicePanel(props: { readonly mode: 'choicePending' | 'choiceConfirm' | 'choiceInvalid'; readonly store: StoreApi<GameStore> }) {
    return render(createElement(ChoicePanel, props));
  }

  function getByTestId(testId: string): HTMLElement {
    return screen.getByTestId(testId);
  }

  function queryByTestId(testId: string): HTMLElement | null {
    return screen.queryByTestId(testId);
  }

  function makeChoiceOption(
    value: string | number | boolean | readonly (string | number | boolean)[],
    displayName: string,
    legality: 'legal' | 'illegal' | 'unknown' = 'legal',
    illegalReason: string | null = null,
    target: {
      readonly kind: 'zone' | 'token' | 'scalar';
      readonly entityId: string | null;
      readonly displaySource: 'zone' | 'token' | 'fallback';
    } = { kind: 'scalar', entityId: null, displaySource: 'fallback' },
  ) {
    return {
      choiceValueId: serializeChoiceValueIdentity(value),
      value,
      displayName,
      target,
      legality,
      illegalReason,
    } as const;
  }

  function makeBreadcrumbStep(
    decisionKey: string,
    name: string,
    chosenValue: string | number | boolean | readonly (string | number | boolean)[],
    chosenDisplayName: string,
    iterationGroupId: string | null = null,
    iterationLabel: string | null = null,
  ) {
    return {
      decisionKey: asDecisionKey(decisionKey),
      name,
      displayName: name,
      chosenValueId: serializeChoiceValueIdentity(chosenValue),
      chosenValue,
      chosenDisplayName,
      iterationGroupId,
      iterationLabel,
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
              decisionKey: asDecisionKey('test-decision'),
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

    expect(html).toContain('first: Zone A');
    expect(html).toContain('second: Zone B');
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
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('test-decision'),
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
          choiceBreadcrumb: [],
        }),
        cancelChoice,
      }),
    });

    const backButton = getByTestId('choice-back') as HTMLButtonElement;
    expect(backButton.disabled).toBe(true);
    expect(cancelChoice).toHaveBeenCalledTimes(0);
  });

  it('Back dispatches cancelChoice when breadcrumb has prior steps', () => {
    const cancelChoice = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('test-decision'),
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
          choiceBreadcrumb: [
            makeBreadcrumbStep('step-1', 'first', 'zone-a', 'Zone A'),
          ],
        }),
        cancelChoice,
      }),
    });

    const backButton = getByTestId('choice-back');
    expect((backButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(backButton);
    expect(cancelChoice).toHaveBeenCalledTimes(1);
  });

  it('Cancel dispatches cancelMove', () => {
    const cancelMove = vi.fn();
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('test-decision'),
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
        }),
        cancelMove,
      }),
    });

    const cancelButton = getByTestId('choice-cancel');
    fireEvent.click(cancelButton);
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
              decisionKey: asDecisionKey('test-decision'),
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

    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('test-decision'),
            options: [makeChoiceOption('zone-a', 'Zone A')],
          },
        }),
        chooseOne,
      }),
    });

    const option = getByTestId(choiceOptionTestId('zone-a'));
    fireEvent.click(option);
    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(chooseOne).toHaveBeenCalledWith('zone-a');
  });

  it('treats unknown-legality options as selectable in discreteOne mode', () => {
    const chooseOne = vi.fn(async () => {});

    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('test-decision'),
            options: [makeChoiceOption('zone-u', 'Zone U', 'unknown', null)],
          },
        }),
        chooseOne,
      }),
    });

    const unknownOption = getByTestId(choiceOptionTestId('zone-u')) as HTMLButtonElement;
    expect(unknownOption.disabled).toBe(false);
    fireEvent.click(unknownOption);
    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(chooseOne).toHaveBeenCalledWith('zone-u');

    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('zone-u', 'Zone U', 'unknown', null)],
            },
          }),
        }),
      }),
    );
    expect(html).not.toContain('data-testid="illegality-feedback"');
  });

  it('treats unknown-legality options as selectable in discreteMany mode', () => {
    const addChooseNItem = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A', 'unknown', null),
              makeChoiceOption('zone-b', 'Zone B', 'unknown', null),
              makeChoiceOption('zone-c', 'Zone C', 'illegal', 'blocked'),
            ],
            min: 1,
            max: 2,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
        addChooseNItem,
      }),
    });

    // Unknown options should be selectable
    const optionA = getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-a')}`) as HTMLButtonElement;
    expect(optionA.disabled).toBe(false);

    // Illegal option should remain disabled
    const optionC = getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-c')}`) as HTMLButtonElement;
    expect(optionC.disabled).toBe(true);

    // Selection bounds should reflect unknown options (2 legal/unknown), not 0
    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 0 of 1 to 2');

    // Select dispatches incrementally
    fireEvent.click(optionA);
    expect(addChooseNItem).toHaveBeenCalledTimes(1);
    expect(addChooseNItem).toHaveBeenCalledWith('zone-a');
  });

  it('uses stable distinct option identities for scalar/array value collisions', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
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

    renderChoicePanel({
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

    const confirm = getByTestId('choice-confirm');
    fireEvent.click(confirm);
    expect(confirmMove).toHaveBeenCalledTimes(1);
  });

  it('Mode B renders toggle controls and deterministic selected-count indicator', () => {
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
              makeChoiceOption('zone-b', 'Zone B'),
            ],
            min: 1,
            max: 2,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
      }),
    });

    expect(queryByTestId('choice-mode-discrete-many')).not.toBeNull();
    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 0 of 1 to 2');
    expect(getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-a')}`)).not.toBeNull();
    expect(getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-b')}`)).not.toBeNull();
  });

  it('Mode B renders engine-owned selection state and dispatches confirmChooseN', () => {
    const confirmChooseN = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
              makeChoiceOption('zone-b', 'Zone B'),
              makeChoiceOption('zone-c', 'Zone C'),
            ],
            min: 2,
            max: 2,
            selectedChoiceValueIds: [
              serializeChoiceValueIdentity('zone-a'),
              serializeChoiceValueIdentity('zone-b'),
            ],
            canConfirm: true,
          },
        }),
        confirmChooseN,
      }),
    });

    const confirm = getByTestId('choice-multi-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 2 of 2');
    fireEvent.click(getByTestId('choice-multi-confirm'));
    expect(confirmChooseN).toHaveBeenCalledTimes(1);
  });

  it('Mode B keeps non-legal options non-selectable and shows illegality feedback', () => {
    const confirmChooseN = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
              makeChoiceOption('zone-b', 'Zone B', 'illegal', 'blocked'),
            ],
            min: 1,
            max: 1,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
        confirmChooseN,
      }),
    });

    const illegalButton = getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-b')}`) as HTMLButtonElement;
    expect(illegalButton.disabled).toBe(true);
    expect(queryByTestId('illegality-feedback')).not.toBeNull();

    fireEvent.click(illegalButton);
    fireEvent.click(getByTestId('choice-multi-confirm'));
    expect(confirmChooseN).toHaveBeenCalledTimes(0);
  });

  it('Mode B reflects nullable bounds text and dispatches add/remove incrementally', () => {
    const addChooseNItem = vi.fn(async () => {});
    const removeChooseNItem = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
              makeChoiceOption('zone-b', 'Zone B'),
            ],
            min: null,
            max: null,
            selectedChoiceValueIds: [serializeChoiceValueIdentity('zone-a')],
            canConfirm: true,
          },
        }),
        addChooseNItem,
        removeChooseNItem,
      }),
    });

    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 1 of up to 2');
    fireEvent.click(getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-a')}`));
    fireEvent.click(getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-b')}`));
    expect(removeChooseNItem).toHaveBeenCalledWith('zone-a');
    expect(addChooseNItem).toHaveBeenCalledWith('zone-b');
  });

  it('Mode B does not optimistically toggle selection without store-driven rerender', () => {
    const addChooseNItem = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
            ],
            min: 1,
            max: 1,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
        addChooseNItem,
      }),
    });

    const option = getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('zone-a')}`) as HTMLButtonElement;
    expect(option.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(option);

    expect(addChooseNItem).toHaveBeenCalledWith('zone-a');
    expect(option.getAttribute('aria-pressed')).toBe('false');
    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 0 of 1');
  });

  it('Mode B treats canConfirm as authoritative even when count bounds are already met', () => {
    const confirmChooseN = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('test-decision'),
            options: [
              makeChoiceOption('zone-a', 'Zone A'),
            ],
            min: 1,
            max: 1,
            selectedChoiceValueIds: [serializeChoiceValueIdentity('zone-a')],
            canConfirm: false,
          },
        }),
        confirmChooseN,
      }),
    });

    const confirm = getByTestId('choice-multi-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);

    expect(confirmChooseN).not.toHaveBeenCalled();
    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 1 of 1');
  });

  it('Mode C renders slider/number inputs from domain and keeps them synchronized', () => {
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'numeric',
            decisionKey: asDecisionKey('test-numeric'),
            domain: { min: 0, max: 10, step: 2 },
          },
        }),
      }),
    });

    const slider = getByTestId('choice-numeric-slider') as HTMLInputElement;
    const input = getByTestId('choice-numeric-input') as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('10');
    expect(slider.step).toBe('2');
    expect(slider.value).toBe('0');
    expect(input.value).toBe('0');

    fireEvent.change(slider, { target: { value: '6' } });

    expect((getByTestId('choice-numeric-slider') as HTMLInputElement).value).toBe('6');
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('6');
  });

  it('Mode C quick-select buttons snap to valid stepped values', () => {
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'numeric',
            decisionKey: asDecisionKey('test-numeric-quick'),
            domain: { min: 1, max: 11, step: 2 },
          },
        }),
      }),
    });

    fireEvent.click(getByTestId('choice-numeric-quick-25'));
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('3');

    fireEvent.click(getByTestId('choice-numeric-quick-50'));
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('7');

    fireEvent.click(getByTestId('choice-numeric-quick-75'));
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('9');

    fireEvent.click(getByTestId('choice-numeric-quick-max'));
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('11');
  });

  it('Mode C confirm dispatches chooseOne(numericValue)', () => {
    const chooseOne = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'numeric',
            decisionKey: asDecisionKey('test-numeric-confirm'),
            domain: { min: 0, max: 10, step: 1 },
          },
        }),
        chooseOne,
      }),
    });

    fireEvent.change(getByTestId('choice-numeric-input'), { target: { value: '8' } });
    fireEvent.click(getByTestId('choice-numeric-confirm'));
    expect(chooseOne).toHaveBeenCalledTimes(1);
    expect(chooseOne).toHaveBeenCalledWith(8);
  });

  it('resets NumericMode value when decisionKey changes (stale state regression)', () => {
    const chooseOne = vi.fn(async () => {});

    const firstDecision = makeRenderModel({
      choiceUi: {
        kind: 'numeric',
        decisionKey: asDecisionKey('numeric-decision-1'),
        domain: { min: 0, max: 10, step: 1 },
      },
    });

    const secondDecision = makeRenderModel({
      choiceUi: {
        kind: 'numeric',
        decisionKey: asDecisionKey('numeric-decision-2'),
        domain: { min: 0, max: 10, step: 1 },
      },
    });

    let currentModel = firstDecision;
    const store = {
      getState: () => ({
        renderModel: currentModel,
        chooseOne,
        cancelChoice: async () => {},
        cancelMove: () => {},
      }),
      subscribe: () => () => {},
      getInitialState: () => ({ renderModel: currentModel }),
    } as unknown as StoreApi<GameStore>;

    const { rerender } = render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

    fireEvent.change(getByTestId('choice-numeric-slider'), { target: { value: '7' } });
    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('7');

    currentModel = secondDecision;
    rerender(createElement(ChoicePanel, { store, mode: 'choicePending' }));

    expect((getByTestId('choice-numeric-input') as HTMLInputElement).value).toBe('0');
  });

  it('does not render Mode B/Mode C placeholder copy', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteMany',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('zone-a', 'Zone A')],
              min: 1,
              max: 1,
              selectedChoiceValueIds: [],
              canConfirm: false,
            },
          }),
        }),
      }),
    );
    expect(html).not.toContain('Multi-select coming soon');
    expect(html).not.toContain('Numeric input coming soon');
  });

  it('keeps interactive controls pointer-active via CSS contract', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const cssPath = resolve(currentDir, '../../src/ui/ChoicePanel.module.css');
    const css = readFileSync(cssPath, 'utf-8');
    const panelBlock = css.match(/\.panel\s*\{[^}]*\}/u)?.[0] ?? '';
    const breadcrumbStepBlock = css.match(/\.breadcrumbStep\s*\{[^}]*\}/u)?.[0] ?? '';
    const optionButtonBlock = css.match(/\.optionButton\s*\{[^}]*\}/u)?.[0] ?? '';
    const navButtonBlock = css.match(/\.navButton\s*\{[^}]*\}/u)?.[0] ?? '';
    const breadcrumbStepIndentedBlock =
      css.match(/\.breadcrumbStepIndented\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(panelBlock).toContain('pointer-events: auto;');
    expect(breadcrumbStepBlock).toContain('pointer-events: auto;');
    expect(optionButtonBlock).toContain('pointer-events: auto;');
    expect(navButtonBlock).toContain('pointer-events: auto;');
    expect(breadcrumbStepIndentedBlock).toContain('pointer-events: auto;');
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
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: { kind: 'none' },
          }),
        }),
      }),
    );
    expect(html).toBe('');
  });

  it('returns null when mode is choiceConfirm but choice is still pending', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choiceConfirm',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('zone-a', 'Zone A')],
            },
          }),
        }),
      }),
    );
    expect(html).toBe('');
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
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choiceInvalid',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: { kind: 'none' },
          }),
        }),
      }),
    );
    expect(html).toBe('');
  });

  it('renders ChoiceContextHeader when choiceContext is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceContext: {
              actionDisplayName: 'Train Troops',
              decisionPrompt: 'Select a space',
              decisionParamName: 'targetSpace',
              boundsText: '1-3',
              iterationLabel: 'Da Nang',
              iterationProgress: '1 of 3',
            },
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('zone-a', 'Zone A')],
            },
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-context-header"');
    expect(html).toContain('data-testid="choice-context-action"');
    expect(html).toContain('Train Troops');
    expect(html).toContain('data-testid="choice-context-prompt"');
    expect(html).toContain('Da Nang: Select a space (1 to 3) — step 1 of 3');
  });

  it('does not render ChoiceContextHeader when choiceContext is null', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceContext: null,
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('zone-a', 'Zone A')],
            },
          }),
        }),
      }),
    );

    expect(html).not.toContain('data-testid="choice-context-header"');
  });

  it('renders ChoiceContextHeader without optional fields', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceContext: {
              actionDisplayName: 'Pass',
              decisionPrompt: 'Confirm action',
              decisionParamName: 'confirm',
              boundsText: null,
              iterationLabel: null,
              iterationProgress: null,
            },
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
              options: [makeChoiceOption('yes', 'Yes')],
            },
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-context-header"');
    expect(html).toContain('Pass');
    expect(html).toContain('Confirm action');
    expect(html).not.toContain('of');
  });

  it('renders updated engine-owned multi-select state when decisionKey changes', () => {
    const addChooseNItem = vi.fn(async () => {});

    const firstDecision = makeRenderModel({
      choiceUi: {
        kind: 'discreteMany',
        decisionKey: asDecisionKey('decision-1'),
        options: [
          makeChoiceOption('zone-a', 'Zone A'),
          makeChoiceOption('zone-b', 'Zone B'),
        ],
        min: 1,
        max: 2,
        selectedChoiceValueIds: [serializeChoiceValueIdentity('zone-a'), serializeChoiceValueIdentity('zone-b')],
        canConfirm: true,
      },
    });

    const secondDecision = makeRenderModel({
      choiceUi: {
        kind: 'discreteMany',
        decisionKey: asDecisionKey('decision-2'),
        options: [
          makeChoiceOption('zone-a', 'Zone A'),
          makeChoiceOption('zone-b', 'Zone B'),
          makeChoiceOption('zone-c', 'Zone C'),
        ],
        min: 1,
        max: 1,
        selectedChoiceValueIds: [],
        canConfirm: false,
      },
    });

    let currentModel = firstDecision;
    const store = {
      getState: () => ({
        renderModel: currentModel,
        addChooseNItem,
        removeChooseNItem: async () => {},
        confirmChooseN: async () => {},
        cancelChoice: async () => {},
        cancelMove: () => {},
      }),
      subscribe: () => () => {},
      getInitialState: () => ({ renderModel: currentModel }),
    } as unknown as StoreApi<GameStore>;

    const { rerender } = render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 2');

    currentModel = secondDecision;
    rerender(createElement(ChoicePanel, { store, mode: 'choicePending' }));

    expect(getByTestId('choice-multi-count').textContent).toContain('Selected: 0');
  });

  it('renders grouped breadcrumb steps inside a group container with iteration labels', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('decision:placeType::zone-c'),
              options: [makeChoiceOption('irregulars', 'Irregulars')],
            },
            choiceBreadcrumb: [
              makeBreadcrumbStep('pick-spaces', 'pickSpaces', ['zone-a', 'zone-b', 'zone-c'], 'Zone A, Zone B, Zone C'),
              makeBreadcrumbStep('decision:placeType::zone-a', 'placeType', 'irregulars', 'Irregulars', 'decision:placeType', 'Zone A'),
              makeBreadcrumbStep('decision:placeType::zone-b', 'placeType', 'base', 'At Base', 'decision:placeType', 'Zone B'),
            ],
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-breadcrumb-group-decision:placeType"');
    expect(html).toContain('Zone A: Irregulars');
    expect(html).toContain('Zone B: At Base');
  });

  it('renders non-grouped breadcrumb steps as flat pills without group container', () => {
    const html = renderToStaticMarkup(
      createElement(ChoicePanel, {
        mode: 'choicePending',
        store: createChoiceStore({
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('target'),
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

    expect(html).not.toContain('breadcrumbGroup');
    expect(html).toContain('first: Zone A');
    expect(html).toContain('second: Zone B');
  });

  it('grouped breadcrumb step click handlers trigger rewind with correct original index', () => {
    const cancelChoice = vi.fn(async () => {});
    renderChoicePanel({
      mode: 'choicePending',
      store: createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('decision:placeType::zone-c'),
            options: [makeChoiceOption('irregulars', 'Irregulars')],
          },
          choiceBreadcrumb: [
            makeBreadcrumbStep('pick-spaces', 'pickSpaces', ['zone-a', 'zone-b'], 'Zone A, Zone B'),
            makeBreadcrumbStep('decision:placeType::zone-a', 'placeType', 'irregulars', 'Irregulars', 'decision:placeType', 'Zone A'),
            makeBreadcrumbStep('decision:placeType::zone-b', 'placeType', 'base', 'At Base', 'decision:placeType', 'Zone B'),
          ],
        }),
        cancelChoice,
      }),
    });

    // Click on the second grouped step (original index 2), should rewind 0 times (it's the last step)
    fireEvent.click(getByTestId('choice-breadcrumb-step-2'));
    expect(cancelChoice).toHaveBeenCalledTimes(0);

    // Click on the first grouped step (original index 1), should rewind 1 time
    fireEvent.click(getByTestId('choice-breadcrumb-step-1'));
    expect(cancelChoice).toHaveBeenCalledTimes(1);
  });
});
