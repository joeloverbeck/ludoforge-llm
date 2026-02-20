import type { CSSProperties, ReactElement } from 'react';

import type { RenderToken } from '../model/render-model.js';
import { resolveCardTemplateFields } from '../config/card-field-resolver.js';
import type { CardTemplate } from '../config/visual-config-types.js';
import styles from './MiniCard.module.css';

interface MiniCardProps {
  readonly token: RenderToken;
  readonly template: CardTemplate;
}

const MINI_CARD_WIDTH = 56;
const MINI_CARD_HEIGHT = 80;
const LEFT_PADDING = 3;
const RIGHT_PADDING = 3;
const MINI_CARD_STYLE: CSSProperties = {
  width: `${MINI_CARD_WIDTH}px`,
  height: `${MINI_CARD_HEIGHT}px`,
};

function toFieldStyle(
  widthScale: number,
  heightScale: number,
  templateWidth: number,
  field: {
    readonly align: 'left' | 'center' | 'right';
    readonly x: number;
    readonly y: number;
    readonly fontSize: number;
    readonly wrap: number | undefined;
    readonly color: string;
  },
): CSSProperties {
  const baseX = field.align === 'left'
    ? LEFT_PADDING
    : field.align === 'center'
      ? templateWidth / 2
      : templateWidth - RIGHT_PADDING;
  const left = (baseX + field.x) * widthScale;
  const top = field.y * heightScale;

  return {
    left: `${left}px`,
    top: `${top}px`,
    fontSize: `${Math.max(8, field.fontSize * Math.min(widthScale, heightScale))}px`,
    color: field.color,
    maxWidth: field.wrap === undefined ? undefined : `${Math.max(8, field.wrap * widthScale)}px`,
    transform: field.align === 'left' ? undefined : field.align === 'center' ? 'translateX(-50%)' : 'translateX(-100%)',
    textAlign: field.align,
    whiteSpace: field.wrap === undefined ? 'nowrap' : 'normal',
  };
}

export function MiniCard({ token, template }: MiniCardProps): ReactElement {
  const templateWidth = Math.max(1, template.width);
  const templateHeight = Math.max(1, template.height);
  const widthScale = MINI_CARD_WIDTH / templateWidth;
  const heightScale = MINI_CARD_HEIGHT / templateHeight;
  const resolvedFields = resolveCardTemplateFields(template.layout, token.properties);

  if (!token.faceUp) {
    return (
      <div
        className={`${styles.card} ${styles.cardBack}`}
        style={MINI_CARD_STYLE}
        data-testid={`mini-card-${token.id}`}
        aria-label={`Face-down card ${token.id}`}
      />
    );
  }

  return (
    <div
      className={`${styles.card} ${styles.cardFace}`}
      style={MINI_CARD_STYLE}
      data-testid={`mini-card-${token.id}`}
      aria-label={`Card ${token.id}`}
    >
      {resolvedFields.map((field) => (
        <span
          key={field.fieldName}
          className={styles.cardField}
          style={toFieldStyle(widthScale, heightScale, templateWidth, field)}
          data-testid={`mini-card-field-${token.id}-${field.fieldName}`}
        >
          {field.text}
        </span>
      ))}
    </div>
  );
}
