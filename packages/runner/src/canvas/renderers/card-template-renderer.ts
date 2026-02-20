import { Text, type Container } from 'pixi.js';

import type { CardTemplate } from '../../config/visual-config-types.js';

function normalizeAlign(value: 'left' | 'center' | 'right' | undefined): 'left' | 'center' | 'right' {
  return value ?? 'left';
}

function toTextValue(value: number | string | boolean | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return String(value);
}

function resolveDisplayText(
  fieldName: string,
  sourceField: string | undefined,
  symbolMap: Readonly<Record<string, string>> | undefined,
  fields: Readonly<Record<string, number | string | boolean>>,
): string | null {
  const rawValue = fields[sourceField ?? fieldName];
  const textValue = toTextValue(rawValue);
  if (textValue === null) {
    return null;
  }
  if (symbolMap === undefined) {
    return textValue;
  }
  return symbolMap[textValue] ?? textValue;
}

function resolveTextColor(
  colorFromProp: string | undefined,
  colorMap: Readonly<Record<string, string>> | undefined,
  fields: Readonly<Record<string, number | string | boolean>>,
): string {
  if (colorFromProp === undefined || colorMap === undefined) {
    return '#f8fafc';
  }
  const colorKey = toTextValue(fields[colorFromProp]);
  if (colorKey === null) {
    return '#f8fafc';
  }
  return colorMap[colorKey] ?? '#f8fafc';
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
    const textValue = resolveDisplayText(
      fieldName,
      fieldLayout.sourceField,
      fieldLayout.symbolMap,
      fields,
    );
    if (textValue === null) {
      continue;
    }

    const align = normalizeAlign(fieldLayout.align);
    const hasWrap = typeof fieldLayout.wrap === 'number' && Number.isFinite(fieldLayout.wrap);
    const baseStyle = {
      fill: resolveTextColor(fieldLayout.colorFromProp, fieldLayout.colorMap, fields),
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
    const baseX = align === 'left' ? left + 3 : align === 'center' ? 0 : left + cardWidth - 3;
    text.position.set(
      baseX + (fieldLayout.x ?? 0),
      top + (fieldLayout.y ?? 0),
    );

    container.addChild(text);
  }
}
