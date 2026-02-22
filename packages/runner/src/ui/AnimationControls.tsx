import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import type { AnimationDetailLevel, AnimationPlaybackSpeed } from '../animation/animation-types.js';
import type { OverlayPanelProps } from './overlay-panel-contract.js';
import styles from './AnimationControls.module.css';

const SPEED_OPTIONS: readonly AnimationPlaybackSpeed[] = ['1x', '2x', '4x'];

export function AnimationControls({ store, diagnostics }: OverlayPanelProps): ReactElement {
  const diagnosticBuffer = diagnostics?.animationDiagnosticBuffer;
  const animationPlaying = useStore(store, (state) => state.animationPlaying);
  const animationPaused = useStore(store, (state) => state.animationPaused);
  const animationSpeed = useStore(store, (state) => state.animationPlaybackSpeed);
  const aiDetailLevel = useStore(store, (state) => state.aiPlaybackDetailLevel);
  const aiAutoSkip = useStore(store, (state) => state.aiPlaybackAutoSkip);

  const setAnimationSpeed = useStore(store, (state) => state.setAnimationPlaybackSpeed);
  const setAnimationPaused = useStore(store, (state) => state.setAnimationPaused);
  const skipCurrentAnimation = useStore(store, (state) => state.requestAnimationSkipCurrent);
  const setAiDetailLevel = useStore(store, (state) => state.setAiPlaybackDetailLevel);
  const setAiAutoSkip = useStore(store, (state) => state.setAiPlaybackAutoSkip);

  return (
    <section className={styles.container} data-testid="animation-controls" aria-label="Animation controls">
      <div className={styles.group} role="group" aria-label="Animation speed" data-testid="animation-speed-controls">
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={styles.speedButton}
            aria-pressed={animationSpeed === speed}
            data-testid={`animation-speed-${speed}`}
            onClick={() => {
              setAnimationSpeed(speed);
            }}
          >
            {speed}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={styles.controlButton}
        data-testid="animation-pause-toggle"
        disabled={!animationPlaying}
        onClick={() => {
          setAnimationPaused(!animationPaused);
        }}
      >
        {animationPaused ? 'Resume' : 'Pause'}
      </button>

      <button
        type="button"
        className={styles.controlButton}
        data-testid="animation-skip-current"
        disabled={!animationPlaying}
        onClick={() => {
          skipCurrentAnimation();
        }}
      >
        Skip
      </button>

      <label className={styles.label}>
        AI Detail
        <select
          className={styles.select}
          data-testid="animation-ai-detail-level"
          value={aiDetailLevel}
          onChange={(event) => {
            setAiDetailLevel(event.currentTarget.value as AnimationDetailLevel);
          }}
        >
          <option value="full">Full</option>
          <option value="standard">Standard</option>
          <option value="minimal">Minimal</option>
        </select>
      </label>

      <label className={styles.label}>
        <input
          type="checkbox"
          data-testid="animation-ai-auto-skip"
          checked={aiAutoSkip}
          onChange={(event) => {
            setAiAutoSkip(event.currentTarget.checked);
          }}
        />
        AI Auto-Skip
      </label>

      {import.meta.env.DEV && diagnosticBuffer !== undefined ? (
        <button
          type="button"
          className={styles.controlButton}
          data-testid="animation-download-log"
          onClick={() => {
            diagnosticBuffer.downloadAsJson();
          }}
        >
          Download Log
        </button>
      ) : null}
    </section>
  );
}
