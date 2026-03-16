// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChooseNOptionResolution, DecisionKey } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { ChoicePanel } from '../../src/ui/ChoicePanel.js';

afterEach(() => {
  cleanup();
});

function createChoiceStore(state: {
  readonly renderModel: GameStore['renderModel'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      selectedAction: null,
      partialMove: null,
      chooseOne: async () => {},
      addChooseNItem: async () => {},
      removeChooseNItem: async () => {},
      confirmChooseN: async () => {},
      cancelChoice: async () => {},
      cancelMove: () => {},
      confirmMove: async () => {},
    }),
  } as unknown as StoreApi<GameStore>;
}

function makeChoiceOption(
  value: string,
  displayName: string,
  legality: 'legal' | 'illegal' | 'unknown' = 'legal',
  resolution?: ChooseNOptionResolution,
) {
  return {
    choiceValueId: serializeChoiceValueIdentity(value),
    value,
    displayName,
    target: { kind: 'scalar' as const, entityId: null, displaySource: 'fallback' as const },
    legality,
    illegalReason: null,
    ...(resolution !== undefined ? { resolution } : {}),
  };
}

describe('ChoicePanel resolution display', () => {
  describe('discreteOne mode', () => {
    it('renders exact+legal option with standard style (no resolution indicator)', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d1'),
            options: [makeChoiceOption('opt-a', 'Option A', 'legal', 'exact')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('opt-a')}`);
      expect(button.className).not.toContain('optionProvisional');
      expect(button.className).not.toContain('optionStochastic');
      expect(button.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it('renders provisional+unknown option with provisional indicator and ARIA label', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d1'),
            options: [makeChoiceOption('opt-b', 'Option B', 'unknown', 'provisional')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('opt-b')}`);
      expect(button.className).toContain('optionProvisional');
      expect(button.getAttribute('aria-label')).toBe('Option B (unverified)');
      const indicator = button.querySelector('[aria-hidden="true"]');
      expect(indicator).not.toBeNull();
      expect(indicator!.textContent).toBe('?');
    });

    it('renders stochastic option with stochastic indicator and ARIA label', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d1'),
            options: [makeChoiceOption('opt-c', 'Option C', 'unknown', 'stochastic')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('opt-c')}`);
      expect(button.className).toContain('optionStochastic');
      expect(button.getAttribute('aria-label')).toBe('Option C (uncertain)');
      const indicator = button.querySelector('[aria-hidden="true"]');
      expect(indicator).not.toBeNull();
      expect(indicator!.textContent).toBe('~');
    });

    it('renders ambiguous option with stochastic style and uncertain ARIA label', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d1'),
            options: [makeChoiceOption('opt-d', 'Option D', 'unknown', 'ambiguous')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('opt-d')}`);
      expect(button.className).toContain('optionStochastic');
      expect(button.getAttribute('aria-label')).toBe('Option D (uncertain)');
    });

    it('renders option without resolution field normally (backward compatibility)', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d1'),
            options: [makeChoiceOption('opt-e', 'Option E', 'legal')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('opt-e')}`);
      expect(button.className).not.toContain('optionProvisional');
      expect(button.className).not.toContain('optionStochastic');
      expect(button.getAttribute('aria-label')).toBe('Option E');
    });
  });

  describe('discreteMany mode', () => {
    it('renders provisional option with dashed style and ARIA label', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('dm1'),
            options: [makeChoiceOption('m-opt-a', 'Multi A', 'unknown', 'provisional')],
            min: null,
            max: null,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('m-opt-a')}`);
      expect(button.className).toContain('optionProvisional');
      expect(button.getAttribute('aria-label')).toBe('Multi A (unverified)');
    });

    it('renders option without resolution normally in multi-select mode', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteMany',
            decisionKey: asDecisionKey('dm2'),
            options: [makeChoiceOption('m-opt-b', 'Multi B', 'legal')],
            min: null,
            max: null,
            selectedChoiceValueIds: [],
            canConfirm: false,
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-multi-option-${serializeChoiceValueIdentity('m-opt-b')}`);
      expect(button.className).not.toContain('optionProvisional');
      expect(button.className).not.toContain('optionStochastic');
      expect(button.getAttribute('aria-label')).toBe('Multi B');
    });
  });

  describe('unknown options remain selectable', () => {
    it('provisional+unknown option is not disabled', () => {
      const store = createChoiceStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            decisionKey: asDecisionKey('d-sel'),
            options: [makeChoiceOption('sel-a', 'Selectable', 'unknown', 'provisional')],
          },
        }),
      });
      render(createElement(ChoicePanel, { store, mode: 'choicePending' }));

      const button = screen.getByTestId(`choice-option-${serializeChoiceValueIdentity('sel-a')}`) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });
});
