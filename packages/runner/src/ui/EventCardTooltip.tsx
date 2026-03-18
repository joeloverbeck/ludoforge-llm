import { useEffect, type ReactElement } from 'react';
import { flip, offset, shift, useFloating } from '@floating-ui/react-dom';

import type { RenderEventCard } from '../model/render-model.js';
import styles from './EventCardTooltip.module.css';

interface EventCardTooltipProps {
  readonly card: RenderEventCard;
  readonly anchorElement: HTMLElement;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
}

export function EventCardTooltip({ card, anchorElement, onPointerEnter, onPointerLeave }: EventCardTooltipProps): ReactElement | null {
  const { x, y, strategy, refs } = useFloating({
    placement: 'bottom',
    middleware: [offset(12), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(anchorElement);
  }, [refs, anchorElement]);

  const hasContent = card.unshadedText !== null || card.shadedText !== null;

  if (!hasContent) {
    return null;
  }

  return (
    <div
      ref={refs.setFloating}
      className={styles.tooltip}
      role="tooltip"
      data-testid="event-card-tooltip"
      style={{
        position: strategy,
        left: x ?? 0,
        top: y ?? 0,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.header}>
        <span className={styles.title} data-testid="event-card-tooltip-title">{card.title}</span>
        {card.orderNumber !== null && (
          <span className={styles.orderNumber} data-testid="event-card-tooltip-number">#{card.orderNumber}</span>
        )}
      </div>
      <span className={styles.badge} data-testid="event-card-tooltip-badge">
        {card.sideMode === 'dual' ? 'Dual' : 'Single'}
      </span>
      {card.unshadedText !== null && (
        <div className={styles.sideSection} data-testid="event-card-tooltip-unshaded">
          <div className={styles.sideLabel}>Unshaded:</div>
          <div className={styles.sideText}>{card.unshadedText}</div>
        </div>
      )}
      {card.unshadedText !== null && card.shadedText !== null && (
        <div className={styles.divider} />
      )}
      {card.shadedText !== null && (
        <div className={styles.sideSection} data-testid="event-card-tooltip-shaded">
          <div className={styles.sideLabel}>Shaded:</div>
          <div className={styles.sideText}>{card.shadedText}</div>
        </div>
      )}
    </div>
  );
}
