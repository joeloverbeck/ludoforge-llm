import { Text, type Container } from 'pixi.js';

import type { CardTemplate } from '../../config/visual-config-types.js';

function normalizeAlign(value: string | undefined): 'left' | 'center' | 'right' {
  if (value === 'center' || value === 'right') {
    return value;
  }
  return 'left';
}

function toTextValue(value: number | string | boolean | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return String(value);
}

export function drawCardContent(
  container: Container,
  template: CardTemplate,
  fields: Readonly<Record<string, number | string | boolean>>,
): void {
  container.removeChildren();

  const layout = template.layout;
  if (layout === undefined) {
    return;
  }

  const cardWidth = template.width;
  const cardHeight = template.height;
  const left = -cardWidth / 2;
  const top = -cardHeight / 2;

  for (const [fieldName, fieldLayout] of Object.entries(layout)) {
    const textValue = toTextValue(fields[fieldName]);
    if (textValue === null) {
      continue;
    }

    const align = normalizeAlign(fieldLayout.align);
    const hasWrap = typeof fieldLayout.wrap === 'number' && Number.isFinite(fieldLayout.wrap);
    const baseStyle = {
      fill: '#f8fafc',
      fontSize: fieldLayout.fontSize ?? 11,
      fontFamily: 'monospace',
      align,
    };
    const style = hasWrap
      ? { ...baseStyle, wordWrap: true as const, wordWrapWidth: fieldLayout.wrap as number }
      : baseStyle;

    const text = new Text({
      text: textValue,
      style,
    });

    text.eventMode = 'none';
    text.interactiveChildren = false;
    text.anchor.set(align === 'left' ? 0 : align === 'center' ? 0.5 : 1, 0);
    text.position.set(
      align === 'left' ? left + 3 : align === 'center' ? 0 : left + cardWidth - 3,
      top + (fieldLayout.y ?? 0),
    );

    container.addChild(text);
  }
}
