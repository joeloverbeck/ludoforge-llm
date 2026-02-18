import type { MoveParamValue } from '@ludoforge/engine/runtime';
import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import type { ChoicePanelMode } from './bottom-bar-mode.js';
import { IllegalityFeedback } from './IllegalityFeedback.js';
import styles from './ChoicePanel.module.css';

interface ChoicePanelProps {
  readonly store: StoreApi<GameStore>;
  readonly mode: ChoicePanelMode;
}

function isChoiceScalar(value: MoveParamValue): value is ChoiceScalar {
  return !Array.isArray(value);
}

type ChoiceScalar = Exclude<MoveParamValue, readonly unknown[]>;
type NumericDomain = { readonly min: number; readonly max: number; readonly step: number };

export function countChoicesToCancel(totalSteps: number, clickedIndex: number): number {
  return Math.max(0, totalSteps - clickedIndex - 1);
}

export async function rewindChoiceToBreadcrumb(
  store: StoreApi<GameStore>,
  totalSteps: number,
  clickedIndex: number,
): Promise<void> {
  const cancelCount = countChoicesToCancel(totalSteps, clickedIndex);
  for (let step = 0; step < cancelCount; step += 1) {
    await store.getState().cancelChoice();
  }
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNumericDomain(
  domain: NonNullable<Extract<NonNullable<GameStore['renderModel']>['choiceUi'], { readonly kind: 'numeric' }>['domain']>,
): NumericDomain {
  const min = toFiniteNumber(domain.min) ?? 0;
  const maxCandidate = toFiniteNumber(domain.max) ?? min;
  const max = maxCandidate >= min ? maxCandidate : min;
  const stepCandidate = toFiniteNumber(domain.step) ?? 1;
  const step = stepCandidate > 0 ? stepCandidate : 1;
  return { min, max, step };
}

function inferStepPrecision(step: number): number {
  const textual = String(step);
  const scientific = textual.match(/e-(\d+)$/u);
  if (scientific !== null) {
    return Number(scientific[1]);
  }
  const decimal = textual.split('.')[1];
  return decimal === undefined ? 0 : decimal.length;
}

function clampAndAlignNumericValue(value: number, domain: NumericDomain): number {
  const clamped = Math.min(domain.max, Math.max(domain.min, value));
  const offset = Math.round((clamped - domain.min) / domain.step);
  const aligned = domain.min + offset * domain.step;
  return Number(aligned.toFixed(inferStepPrecision(domain.step)));
}

function deriveMultiSelectBounds(min: number | null, max: number | null, legalOptionCount: number): { min: number; max: number } {
  const effectiveMin = Math.max(0, min ?? 0);
  const maxCandidate = max ?? legalOptionCount;
  const boundedMax = Math.max(0, Math.min(legalOptionCount, maxCandidate));
  return {
    min: effectiveMin,
    max: Math.max(effectiveMin, boundedMax),
  };
}

function formatSelectionBounds(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

interface MultiSelectModeProps {
  readonly choiceUi: Extract<NonNullable<GameStore['renderModel']>['choiceUi'], { readonly kind: 'discreteMany' }>;
  readonly chooseN: (selectedValues: readonly ChoiceScalar[]) => Promise<void>;
}

function isLegalScalarChoiceOption(
  option: Extract<NonNullable<GameStore['renderModel']>['choiceUi'], { readonly kind: 'discreteMany' }>['options'][number],
): option is (typeof option & { readonly value: ChoiceScalar; readonly legality: 'legal' }) {
  return option.legality === 'legal' && isChoiceScalar(option.value);
}

function MultiSelectMode({ choiceUi, chooseN }: MultiSelectModeProps): ReactElement {
  const legalScalarOptions = useMemo(
    () => choiceUi.options.filter(isLegalScalarChoiceOption),
    [choiceUi.options],
  );
  const legalChoiceValueIds = useMemo(
    () => new Set(legalScalarOptions.map((option) => option.choiceValueId)),
    [legalScalarOptions],
  );
  const bounds = useMemo(
    () => deriveMultiSelectBounds(choiceUi.min, choiceUi.max, legalScalarOptions.length),
    [choiceUi.max, choiceUi.min, legalScalarOptions.length],
  );

  const [selectedChoiceValueIds, setSelectedChoiceValueIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setSelectedChoiceValueIds((previous) => previous.filter((id) => legalChoiceValueIds.has(id)));
  }, [legalChoiceValueIds]);

  const selectedValues = useMemo(() => {
    const selected = new Set(selectedChoiceValueIds);
    return legalScalarOptions
      .filter((option) => selected.has(option.choiceValueId))
      .map((option) => option.value);
  }, [legalScalarOptions, selectedChoiceValueIds]);

  const selectedCount = selectedValues.length;
  const canConfirm = selectedCount >= bounds.min && selectedCount <= bounds.max;

  return (
    <div className={styles.multiSelectMode} data-testid="choice-mode-discrete-many">
      <p className={styles.selectionCount} data-testid="choice-multi-count">
        Selected: {selectedCount} of {formatSelectionBounds(bounds.min, bounds.max)}
      </p>
      <div className={styles.options}>
        {choiceUi.options.map((option) => {
          const isSelected = selectedChoiceValueIds.includes(option.choiceValueId);
          const isLegalScalar = option.legality === 'legal' && isChoiceScalar(option.value);
          const atSelectionLimit = !isSelected && selectedCount >= bounds.max;
          const isDisabled = !isLegalScalar || atSelectionLimit;

          return (
            <div key={option.choiceValueId} className={styles.optionRow}>
              <button
                type="button"
                className={isSelected ? `${styles.optionButton} ${styles.optionSelected}` : styles.optionButton}
                disabled={isDisabled}
                aria-disabled={isDisabled ? 'true' : undefined}
                aria-pressed={isSelected}
                data-testid={`choice-multi-option-${option.choiceValueId}`}
                onClick={() => {
                  if (!isLegalScalar) {
                    return;
                  }
                  setSelectedChoiceValueIds((previous) => {
                    if (previous.includes(option.choiceValueId)) {
                      return previous.filter((id) => id !== option.choiceValueId);
                    }
                    if (previous.length >= bounds.max) {
                      return previous;
                    }
                    return [...previous, option.choiceValueId];
                  });
                }}
              >
                <span className={styles.checkboxIndicator} aria-hidden="true">
                  {isSelected ? 'x' : ''}
                </span>
                <span>{option.displayName}</span>
              </button>
              {!isLegalScalar ? <IllegalityFeedback illegalReason={option.illegalReason} /> : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.multiSelectConfirm}
        data-testid="choice-multi-confirm"
        disabled={!canConfirm}
        onClick={() => {
          if (!canConfirm) {
            return;
          }
          void chooseN(selectedValues);
        }}
      >
        Confirm selection
      </button>
    </div>
  );
}

interface NumericModeProps {
  readonly choiceUi: Extract<NonNullable<GameStore['renderModel']>['choiceUi'], { readonly kind: 'numeric' }>;
  readonly chooseOne: (value: ChoiceScalar) => Promise<void>;
}

function NumericMode({ choiceUi, chooseOne }: NumericModeProps): ReactElement {
  const domain = useMemo(() => normalizeNumericDomain(choiceUi.domain), [choiceUi.domain]);
  const [value, setValue] = useState<number>(domain.min);

  useEffect(() => {
    setValue((previous) => clampAndAlignNumericValue(previous, domain));
  }, [domain]);

  const handleInputValue = (nextValue: number): void => {
    setValue(clampAndAlignNumericValue(nextValue, domain));
  };

  const onNumericInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const parsed = Number(event.target.value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    handleInputValue(parsed);
  };

  const quickSelects = [
    { label: '25%', testId: 'choice-numeric-quick-25', fraction: 0.25 },
    { label: '50%', testId: 'choice-numeric-quick-50', fraction: 0.5 },
    { label: '75%', testId: 'choice-numeric-quick-75', fraction: 0.75 },
    { label: 'Max', testId: 'choice-numeric-quick-max', fraction: 1 },
  ] as const;

  return (
    <div className={styles.numericMode} data-testid="choice-mode-numeric">
      <label className={styles.numericLabel} htmlFor="choice-numeric-slider">
        Value
      </label>
      <input
        id="choice-numeric-slider"
        type="range"
        className={styles.numericSlider}
        data-testid="choice-numeric-slider"
        min={domain.min}
        max={domain.max}
        step={domain.step}
        value={value}
        onChange={onNumericInputChange}
      />
      <input
        type="number"
        className={styles.numericInput}
        data-testid="choice-numeric-input"
        min={domain.min}
        max={domain.max}
        step={domain.step}
        value={value}
        onChange={onNumericInputChange}
      />
      <div className={styles.quickSelectRow}>
        {quickSelects.map((quickSelect) => (
          <button
            key={quickSelect.testId}
            type="button"
            className={styles.quickSelectButton}
            data-testid={quickSelect.testId}
            onClick={() => {
              const rawValue = domain.min + (domain.max - domain.min) * quickSelect.fraction;
              handleInputValue(rawValue);
            }}
          >
            {quickSelect.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.numericConfirm}
        data-testid="choice-numeric-confirm"
        onClick={() => {
          void chooseOne(value);
        }}
      >
        Confirm value
      </button>
    </div>
  );
}

export function ChoicePanel({ store, mode }: ChoicePanelProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (renderModel == null) {
    return null;
  }
  const choiceModel = renderModel as NonNullable<GameStore['renderModel']>;
  const choiceUi = choiceModel.choiceUi;
  const isPendingChoice = choiceUi.kind === 'discreteOne'
    || choiceUi.kind === 'discreteMany'
    || choiceUi.kind === 'numeric';
  const isConfirmReady = choiceUi.kind === 'confirmReady';
  const isInvalid = choiceUi.kind === 'invalid';

  if (mode === 'choicePending' && !isPendingChoice) {
    return null;
  }

  if (mode === 'choiceConfirm' && !isConfirmReady) {
    return null;
  }

  if (mode === 'choiceInvalid' && !isInvalid) {
    return null;
  }

  const showConfirm = mode === 'choiceConfirm';
  const showNavigation = mode !== 'choiceInvalid';

  return (
    <section className={styles.panel} aria-label="Choice panel" data-testid="choice-panel">
      {mode !== 'choiceInvalid' ? (
        <div className={styles.breadcrumb} data-testid="choice-breadcrumb">
          {choiceModel.choiceBreadcrumb.map((step, index) => (
            <button
              key={`${step.decisionId}:${step.chosenValueId}`}
              type="button"
              className={styles.breadcrumbStep}
              data-testid={`choice-breadcrumb-step-${index}`}
              onClick={() => {
                void rewindChoiceToBreadcrumb(store, choiceModel.choiceBreadcrumb.length, index);
              }}
            >
              {step.chosenDisplayName}
            </button>
          ))}
          {isPendingChoice ? (
            <span className={styles.breadcrumbCurrent} data-testid="choice-breadcrumb-current">
              Current
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.body}>
        {choiceUi.kind === 'invalid' ? (
          <p className={styles.placeholder} data-testid="choice-mode-invalid">
            Invalid choice UI state ({choiceUi.reason})
          </p>
        ) : null}

        {choiceUi.kind === 'discreteOne' ? (
          <div className={styles.options} data-testid="choice-mode-discrete">
            {choiceUi.options.map((option) => {
              const isLegal = option.legality === 'legal';
              return (
                <div key={option.choiceValueId} className={styles.optionRow}>
                  <button
                    type="button"
                    className={styles.optionButton}
                    disabled={!isLegal}
                    aria-disabled={isLegal ? undefined : 'true'}
                    data-testid={`choice-option-${option.choiceValueId}`}
                    onClick={() => {
                      if (!isLegal || !isChoiceScalar(option.value)) {
                        return;
                      }
                      void store.getState().chooseOne(option.value);
                    }}
                  >
                    {option.displayName}
                  </button>
                  {!isLegal ? <IllegalityFeedback illegalReason={option.illegalReason} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {choiceUi.kind === 'discreteMany' ? (
          <MultiSelectMode
            choiceUi={choiceUi}
            chooseN={async (selectedValues) => {
              await store.getState().chooseN(selectedValues);
            }}
          />
        ) : null}

        {choiceUi.kind === 'numeric' ? (
          <NumericMode
            choiceUi={choiceUi}
            chooseOne={async (value) => {
              await store.getState().chooseOne(value);
            }}
          />
        ) : null}
      </div>

      {showNavigation ? (
        <div className={styles.navigation} data-testid="choice-navigation">
          <button
            type="button"
            className={styles.navButton}
            data-testid="choice-back"
            disabled={choiceModel.choiceBreadcrumb.length === 0}
            onClick={() => {
              void store.getState().cancelChoice();
            }}
          >
            Back
          </button>
          <button
            type="button"
            className={styles.navButton}
            data-testid="choice-cancel"
            onClick={() => {
              store.getState().cancelMove();
            }}
          >
            Cancel
          </button>
          {showConfirm ? (
            <button
              type="button"
              className={styles.navButton}
              data-testid="choice-confirm"
              onClick={() => {
                void store.getState().confirmMove();
              }}
            >
              Confirm
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
