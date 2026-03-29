import type { ChooseNOptionResolution, MoveParamValue } from '@ludoforge/engine/runtime';
import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import type { RenderChoiceContext, RenderChoiceStep } from '../model/render-model.js';
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

function resolutionCssClass(resolution: ChooseNOptionResolution | undefined): string {
  switch (resolution) {
    case 'provisional':
      return styles.optionProvisional ?? '';
    case 'stochastic':
    case 'ambiguous':
      return styles.optionStochastic ?? '';
    default:
      return '';
  }
}

function resolutionIndicatorText(resolution: ChooseNOptionResolution | undefined): string | null {
  switch (resolution) {
    case 'provisional':
      return '?';
    case 'stochastic':
      return '~';
    case 'ambiguous':
      return '~';
    default:
      return null;
  }
}

function resolutionAriaLabel(displayName: string, resolution: ChooseNOptionResolution | undefined): string {
  switch (resolution) {
    case 'provisional':
      return `${displayName} (unverified)`;
    case 'stochastic':
      return `${displayName} (uncertain)`;
    case 'ambiguous':
      return `${displayName} (uncertain)`;
    default:
      return displayName;
  }
}

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
  readonly addChooseNItem: (value: ChoiceScalar) => Promise<void>;
  readonly removeChooseNItem: (value: ChoiceScalar) => Promise<void>;
  readonly confirmChooseN: () => Promise<void>;
}

function isLegalScalarChoiceOption(
  option: Extract<NonNullable<GameStore['renderModel']>['choiceUi'], { readonly kind: 'discreteMany' }>['options'][number],
): option is (typeof option & { readonly value: ChoiceScalar; readonly legality: 'legal' | 'unknown' }) {
  return option.legality !== 'illegal' && isChoiceScalar(option.value);
}

function MultiSelectMode({ choiceUi, addChooseNItem, removeChooseNItem, confirmChooseN }: MultiSelectModeProps): ReactElement {
  const legalScalarOptions = useMemo(
    () => choiceUi.options.filter(isLegalScalarChoiceOption),
    [choiceUi.options],
  );
  const bounds = useMemo(
    () => deriveMultiSelectBounds(choiceUi.min, choiceUi.max, legalScalarOptions.length),
    [choiceUi.max, choiceUi.min, legalScalarOptions.length],
  );
  const selectedChoiceValueIds = choiceUi.selectedChoiceValueIds;
  const selectedChoiceValueIdSet = useMemo(
    () => new Set(selectedChoiceValueIds),
    [selectedChoiceValueIds],
  );
  const selectedCount = selectedChoiceValueIds.length;
  const canConfirm = choiceUi.canConfirm;

  return (
    <div className={styles.multiSelectMode} data-testid="choice-mode-discrete-many">
      <p className={styles.selectionCount} data-testid="choice-multi-count">
        Selected: {selectedCount} of {formatBoundsForDisplay(formatSelectionBounds(bounds.min, bounds.max)) ?? formatSelectionBounds(bounds.min, bounds.max)}
      </p>
      <div className={styles.options}>
        {choiceUi.options.map((option) => {
          const isSelected = selectedChoiceValueIdSet.has(option.choiceValueId);
          const isLegalScalar = option.legality !== 'illegal' && isChoiceScalar(option.value);
          const isDisabled = !isLegalScalar;

          const resCss = resolutionCssClass(option.resolution);
          const baseClass = isSelected ? `${styles.optionButton} ${styles.optionSelected}` : styles.optionButton;
          const buttonClass = resCss !== '' ? `${baseClass} ${resCss}` : baseClass;
          const indicator = resolutionIndicatorText(option.resolution);

          return (
            <div key={option.choiceValueId} className={styles.optionRow}>
              <button
                type="button"
                className={buttonClass}
                disabled={isDisabled}
                aria-disabled={isDisabled ? 'true' : undefined}
                aria-pressed={isSelected}
                aria-label={resolutionAriaLabel(option.displayName, option.resolution)}
                data-testid={`choice-multi-option-${option.choiceValueId}`}
                onClick={() => {
                  if (!isLegalScalar) {
                    return;
                  }
                  if (isSelected) {
                    void removeChooseNItem(option.value);
                    return;
                  }
                  void addChooseNItem(option.value);
                }}
              >
                <span className={styles.checkboxIndicator} aria-hidden="true">
                  {isSelected ? 'x' : ''}
                </span>
                <span>{option.displayName}</span>
                {indicator !== null ? (
                  <span className={styles.resolutionIndicator} aria-hidden="true">{indicator}</span>
                ) : null}
              </button>
              {!isLegalScalar && !isSelected ? <IllegalityFeedback illegalReason={option.illegalReason} /> : null}
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
          void confirmChooseN();
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

type BreadcrumbSegment =
  | { readonly kind: 'flat'; readonly step: RenderChoiceStep; readonly originalIndex: number }
  | { readonly kind: 'group'; readonly groupId: string; readonly steps: readonly { readonly step: RenderChoiceStep; readonly originalIndex: number }[] };

function segmentBreadcrumb(steps: readonly RenderChoiceStep[]): readonly BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i] as RenderChoiceStep;
    if (step.iterationGroupId === null) {
      segments.push({ kind: 'flat', step, originalIndex: i });
      i += 1;
    } else {
      const groupId = step.iterationGroupId;
      const groupSteps: { readonly step: RenderChoiceStep; readonly originalIndex: number }[] = [];
      while (i < steps.length) {
        const current = steps[i] as RenderChoiceStep;
        if (current.iterationGroupId !== groupId) {
          break;
        }
        groupSteps.push({ step: current, originalIndex: i });
        i += 1;
      }
      segments.push({ kind: 'group', groupId, steps: groupSteps });
    }
  }
  return segments;
}

function formatBoundsForDisplay(boundsText: string | null): string | null {
  if (boundsText === null) {
    return null;
  }
  if (boundsText.includes('-')) {
    const [min, max] = boundsText.split('-');
    if (min === '0') {
      return `up to ${max}`;
    }
    return `${min} to ${max}`;
  }
  return boundsText;
}

function ChoiceContextHeader({ context }: { readonly context: RenderChoiceContext }): ReactElement {
  const humanBounds = formatBoundsForDisplay(context.boundsText);
  return (
    <div className={styles.choiceContextHeader} data-testid="choice-context-header">
      <span className={styles.actionBadge} data-testid="choice-context-action">
        {context.actionDisplayName}
      </span>
      <span className={styles.decisionPrompt} data-testid="choice-context-prompt">
        {context.iterationLabel != null ? `${context.iterationLabel}: ` : ''}
        {context.decisionPrompt}
        {humanBounds != null ? ` (${humanBounds})` : ''}
        {context.iterationProgress != null ? ` — step ${context.iterationProgress}` : ''}
      </span>
    </div>
  );
}

const MAX_VISIBLE_BREADCRUMB_SEGMENTS = 3;

interface CollapsedBreadcrumbProps {
  readonly steps: readonly RenderChoiceStep[];
  readonly totalSteps: number;
  readonly store: StoreApi<GameStore>;
  readonly showCurrent: boolean;
}

function CollapsedBreadcrumb({ steps, totalSteps, store, showCurrent }: CollapsedBreadcrumbProps): ReactElement {
  const allSegments = segmentBreadcrumb(steps);
  const shouldCollapse = allSegments.length > MAX_VISIBLE_BREADCRUMB_SEGMENTS;
  const visibleSegments = shouldCollapse
    ? allSegments.slice(allSegments.length - MAX_VISIBLE_BREADCRUMB_SEGMENTS)
    : allSegments;

  return (
    <div className={styles.breadcrumb} data-testid="choice-breadcrumb">
      {shouldCollapse ? (
        <span className={styles.breadcrumbEllipsis} data-testid="choice-breadcrumb-ellipsis" aria-label={`${allSegments.length - MAX_VISIBLE_BREADCRUMB_SEGMENTS} earlier steps hidden`}>
          ...
        </span>
      ) : null}
      {visibleSegments.map((segment) => {
        if (segment.kind === 'flat') {
          return (
            <button
              key={`${segment.step.decisionKey}:${segment.step.chosenValueId}`}
              type="button"
              className={styles.breadcrumbStep}
              data-testid={`choice-breadcrumb-step-${segment.originalIndex}`}
              onClick={() => {
                void rewindChoiceToBreadcrumb(store, totalSteps, segment.originalIndex);
              }}
            >
              {segment.step.displayName}
              {segment.step.iterationLabel != null ? ` (${segment.step.iterationLabel})` : ''}
              : {segment.step.chosenDisplayName}
            </button>
          );
        }
        {
          const firstStep = segment.steps[0]?.step;
          const groupLabel = firstStep?.displayName ?? segment.groupId;
          return (
            <div key={segment.groupId} className={styles.breadcrumbGroup} data-testid={`choice-breadcrumb-group-${segment.groupId}`}>
              <span className={styles.breadcrumbGroupLabel}>{groupLabel} ({segment.steps.length}x)</span>
              <div className={styles.breadcrumbGroupChildren}>
                {segment.steps.map(({ step, originalIndex }) => (
                  <button
                    key={`${step.decisionKey}:${step.chosenValueId}`}
                    type="button"
                    className={styles.breadcrumbStepIndented}
                    data-testid={`choice-breadcrumb-step-${originalIndex}`}
                    onClick={() => {
                      void rewindChoiceToBreadcrumb(store, totalSteps, originalIndex);
                    }}
                  >
                    {step.iterationLabel != null ? `${step.iterationLabel}: ` : ''}{step.chosenDisplayName}
                  </button>
                ))}
              </div>
            </div>
          );
        }
      })}
      {showCurrent ? (
        <span className={styles.breadcrumbCurrent} data-testid="choice-breadcrumb-current">
          Current
        </span>
      ) : null}
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

  const effectiveContext = useMemo(() => {
    if (choiceModel.choiceContext == null || choiceUi.kind !== 'discreteMany') {
      return choiceModel.choiceContext;
    }
    const legalCount = choiceUi.options.filter((o) => o.legality !== 'illegal').length;
    const bounds = deriveMultiSelectBounds(choiceUi.min, choiceUi.max, legalCount);
    const effectiveBoundsText = bounds.min === 0 && bounds.max === 0
      ? null
      : `${bounds.min}${bounds.max === bounds.min ? '' : `-${bounds.max}`}`;
    if (effectiveBoundsText === choiceModel.choiceContext.boundsText) {
      return choiceModel.choiceContext;
    }
    return { ...choiceModel.choiceContext, boundsText: effectiveBoundsText };
  }, [choiceModel.choiceContext, choiceUi]);

  return (
    <section className={styles.panel} aria-label="Choice panel" data-testid="choice-panel">
      {effectiveContext != null ? (
        <ChoiceContextHeader context={effectiveContext} />
      ) : null}
      {mode !== 'choiceInvalid' ? (
        <CollapsedBreadcrumb
          steps={choiceModel.choiceBreadcrumb}
          totalSteps={choiceModel.choiceBreadcrumb.length}
          store={store}
          showCurrent={isPendingChoice && choiceModel.choiceBreadcrumb.length > 0}
        />
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
              const isLegal = option.legality !== 'illegal';
              const resCss = resolutionCssClass(option.resolution);
              const buttonClass = resCss !== ''
                ? `${styles.optionButton} ${resCss}`
                : styles.optionButton;
              const indicator = resolutionIndicatorText(option.resolution);
              return (
                <div key={option.choiceValueId} className={styles.optionRow}>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!isLegal}
                    aria-disabled={isLegal ? undefined : 'true'}
                    aria-label={resolutionAriaLabel(option.displayName, option.resolution)}
                    data-testid={`choice-option-${option.choiceValueId}`}
                    onClick={() => {
                      if (!isLegal || !isChoiceScalar(option.value)) {
                        return;
                      }
                      void store.getState().chooseOne(option.value);
                    }}
                  >
                    <span>{option.displayName}</span>
                    {indicator !== null ? (
                      <span className={styles.resolutionIndicator} aria-hidden="true">{indicator}</span>
                    ) : null}
                  </button>
                  {!isLegal ? <IllegalityFeedback illegalReason={option.illegalReason} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {choiceUi.kind === 'discreteMany' ? (
          <MultiSelectMode
            key={choiceUi.decisionKey}
            choiceUi={choiceUi}
            addChooseNItem={async (value) => {
              await store.getState().addChooseNItem(value);
            }}
            removeChooseNItem={async (value) => {
              await store.getState().removeChooseNItem(value);
            }}
            confirmChooseN={async () => {
              await store.getState().confirmChooseN();
            }}
          />
        ) : null}

        {choiceUi.kind === 'numeric' ? (
          <NumericMode
            key={choiceUi.decisionKey}
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
