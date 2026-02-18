import type { MoveParamValue } from '@ludoforge/engine/runtime';
import type { ReactElement } from 'react';
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

export function ChoicePanel({ store, mode }: ChoicePanelProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (renderModel == null) {
    return null;
  }
  const choiceModel = renderModel as NonNullable<GameStore['renderModel']>;
  const isPendingChoice = choiceModel.choiceType !== null;
  const isConfirmReady = choiceModel.choiceType === null
    && choiceModel.currentChoiceOptions === null
    && choiceModel.currentChoiceDomain === null;

  if (mode === 'choicePending' && !isPendingChoice) {
    return null;
  }

  if (mode === 'choiceConfirm' && !isConfirmReady) {
    return null;
  }

  const showConfirm = mode === 'choiceConfirm';

  return (
    <section className={styles.panel} aria-label="Choice panel" data-testid="choice-panel">
      <div className={styles.breadcrumb} data-testid="choice-breadcrumb">
        {choiceModel.choiceBreadcrumb.map((step, index) => (
          <button
            key={`${step.decisionId}:${index}`}
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
        {choiceModel.choiceType !== null ? (
          <span className={styles.breadcrumbCurrent} data-testid="choice-breadcrumb-current">
            Current
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        {choiceModel.choiceType === 'chooseOne' && choiceModel.currentChoiceOptions !== null ? (
          <div className={styles.options} data-testid="choice-mode-discrete">
            {choiceModel.currentChoiceOptions.map((option, index) => {
              const isLegal = option.legality === 'legal';
              return (
                <div key={`${String(option.value)}:${index}`} className={styles.optionRow}>
                  <button
                    type="button"
                    className={styles.optionButton}
                    disabled={!isLegal}
                    aria-disabled={isLegal ? undefined : 'true'}
                    data-testid={`choice-option-${String(option.value)}`}
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

        {choiceModel.choiceType === 'chooseN' ? (
          <p className={styles.placeholder} data-testid="choice-mode-choose-n-placeholder">
            Multi-select coming soon
          </p>
        ) : null}

        {choiceModel.choiceType === 'chooseOne' && choiceModel.currentChoiceDomain !== null ? (
          <p className={styles.placeholder} data-testid="choice-mode-numeric-placeholder">
            Numeric input coming soon
          </p>
        ) : null}
      </div>

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
    </section>
  );
}
