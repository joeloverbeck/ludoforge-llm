import { Fragment, type ReactElement } from 'react';
import { useStore } from 'zustand';

import type { OverlayPanelProps } from './overlay-panel-contract.js';
import type { GameStore } from '../store/game-store.js';
import { buildRunnerControlSections, type RunnerControlDescriptor } from './runner-control-surface.js';
import styles from './AnimationControls.module.css';

export function AnimationControls({ store, diagnostics }: OverlayPanelProps): ReactElement {
  const diagnosticBuffer = diagnostics?.animationDiagnosticBuffer;
  const controlState = useStore(store, selectControlState);
  const controlActions = useStore(store, selectControlActions);
  const sections = buildRunnerControlSections(controlState, controlActions, {
    ...(diagnosticBuffer === undefined || !import.meta.env.DEV
      ? {}
      : {
        diagnostics: {
          available: true,
          download: () => {
            diagnosticBuffer.downloadAsJson();
          },
        },
      }),
  });

  return (
    <section className={styles.container} data-testid="animation-controls" aria-label="Animation controls">
      {sections.map((section) => {
        const visibleControls = section.controls.filter((control) => control.hidden !== true);
        if (visibleControls.length === 0) {
          return null;
        }
        return (
          <div
            key={section.id}
            className={styles.group}
            role="group"
            aria-label={section.label}
            data-testid={`animation-section-${section.id}`}
          >
            {visibleControls.map((control) => renderAnimationControl(control))}
          </div>
        );
      })}
    </section>
  );
}

function renderAnimationControl(control: RunnerControlDescriptor): ReactElement {
  switch (control.kind) {
    case 'segmented':
      return (
        <Fragment key={control.id}>
          {control.options.map((option) => (
            <button
              key={`${control.id}-${option.value}`}
              type="button"
              className={styles.speedButton}
              aria-pressed={control.value === option.value}
              data-testid={`animation-${control.id}-${option.value}`}
              onClick={() => {
                control.onSelect(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </Fragment>
      );
    case 'select':
      return (
        <label key={control.id} className={styles.label}>
          {control.label}
          <select
            className={styles.select}
            data-testid={`animation-${control.id}`}
            value={control.value}
            disabled={control.disabled}
            onChange={(event) => {
              control.onSelect(event.currentTarget.value);
            }}
          >
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'toggle':
      return (
        <label key={control.id} className={styles.label}>
          <input
            type="checkbox"
            data-testid={`animation-${control.id}`}
            checked={control.checked}
            disabled={control.disabled}
            onChange={(event) => {
              control.onToggle(event.currentTarget.checked);
            }}
          />
          {control.label}
        </label>
      );
    case 'action':
      return (
        <button
          key={control.id}
          type="button"
          className={styles.controlButton}
          data-testid={`animation-${control.id}`}
          disabled={control.disabled}
          onClick={() => {
            control.onSelect();
          }}
        >
          {control.label}
        </button>
      );
  }
}

function selectControlState(state: GameStore) {
  return {
    animationPlaying: state.animationPlaying,
    animationPaused: state.animationPaused,
    animationPlaybackSpeed: state.animationPlaybackSpeed,
    aiPlaybackDetailLevel: state.aiPlaybackDetailLevel,
    aiPlaybackAutoSkip: state.aiPlaybackAutoSkip,
  };
}

function selectControlActions(state: GameStore) {
  return {
    setAnimationPlaybackSpeed: state.setAnimationPlaybackSpeed,
    setAnimationPaused: state.setAnimationPaused,
    requestAnimationSkipCurrent: state.requestAnimationSkipCurrent,
    setAiPlaybackDetailLevel: state.setAiPlaybackDetailLevel,
    setAiPlaybackAutoSkip: state.setAiPlaybackAutoSkip,
  };
}
