import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderInterruptFrame } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import styles from './InterruptBanner.module.css';

interface InterruptBannerProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_INTERRUPT_STACK: readonly RenderInterruptFrame[] = [];

export function InterruptBanner({ store }: InterruptBannerProps): ReactElement | null {
  const isInInterrupt = useStore(store, (state) => state.renderModel?.isInInterrupt ?? false);
  const interruptStack = useStore(store, (state) => state.renderModel?.interruptStack ?? EMPTY_INTERRUPT_STACK);

  if (!isInInterrupt) {
    return null;
  }

  const currentInterrupt = interruptStack.at(-1);
  if (currentInterrupt === undefined) {
    return null;
  }

  return (
    <section className={styles.banner} data-testid="interrupt-banner" aria-label="Interrupt active">
      <p className={styles.title}>Interrupt: {currentInterrupt.phase}</p>
      <p className={styles.resume}>Resumes: {currentInterrupt.resumePhase}</p>
    </section>
  );
}
