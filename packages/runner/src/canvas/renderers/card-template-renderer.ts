import { Text, type Container } from 'pixi.js';

import type { CardTemplate } from '../../config/visual-config-types.js';
import { resolveCardTemplateFields } from '../../config/card-field-resolver.js';

export function drawCardContent(
  container: Container,
  template: CardTemplate,
  fields: Readonly<Record<string, number | string | boolean>>,
): void {
  container.removeChildren();

  const resolvedFields = resolveCardTemplateFields(template.layout, fields);
  if (resolvedFields.length === 0) return;

  const cardWidth = template.width;
  const cardHeight = template.height;
  const left = -cardWidth / 2;
  const top = -cardHeight / 2;

  for (const field of resolvedFields) {
    const hasWrap = typeof field.wrap === 'number' && Number.isFinite(field.wrap);
    const baseStyle = {
      fill: field.color,
      fontSize: field.fontSize,
      fontFamily: 'monospace',
      align: field.align,
    };
    const style = hasWrap
      ? { ...baseStyle, wordWrap: true as const, wordWrapWidth: field.wrap as number }
      : baseStyle;

    const text = new Text({
      text: field.text,
      style,
    });

    text.eventMode = 'none';
    text.interactiveChildren = false;
    text.anchor.set(field.align === 'left' ? 0 : field.align === 'center' ? 0.5 : 1, 0);
    const baseX = field.align === 'left' ? left + 3 : field.align === 'center' ? 0 : left + cardWidth - 3;
    text.position.set(
      baseX + field.x,
      top + field.y,
    );

    container.addChild(text);
  }
}
