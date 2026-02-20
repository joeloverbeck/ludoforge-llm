import type { CardFieldLayout } from './visual-config-types.js';

export const DEFAULT_CARD_TEXT_COLOR = '#f8fafc';

export type CardFieldAlign = 'left' | 'center' | 'right';

export interface ResolvedCardField {
  readonly fieldName: string;
  readonly align: CardFieldAlign;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly wrap: number | undefined;
  readonly text: string;
  readonly color: string;
}

type CardFieldValue = number | string | boolean;

function toTextValue(value: CardFieldValue | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return String(value);
}

function normalizeAlign(value: CardFieldLayout['align']): CardFieldAlign {
  return value ?? 'left';
}

export function resolveCardFieldDisplayText(
  fieldName: string,
  fieldLayout: CardFieldLayout,
  fields: Readonly<Record<string, CardFieldValue>>,
): string | null {
  const rawValue = fields[fieldLayout.sourceField ?? fieldName];
  const textValue = toTextValue(rawValue);
  if (textValue === null) {
    return null;
  }
  if (fieldLayout.symbolMap === undefined) {
    return textValue;
  }
  return fieldLayout.symbolMap[textValue] ?? textValue;
}

export function resolveCardFieldTextColor(
  fieldLayout: CardFieldLayout,
  fields: Readonly<Record<string, CardFieldValue>>,
): string {
  if (fieldLayout.colorFromProp === undefined || fieldLayout.colorMap === undefined) {
    return DEFAULT_CARD_TEXT_COLOR;
  }
  const colorKey = toTextValue(fields[fieldLayout.colorFromProp]);
  if (colorKey === null) {
    return DEFAULT_CARD_TEXT_COLOR;
  }
  return fieldLayout.colorMap[colorKey] ?? DEFAULT_CARD_TEXT_COLOR;
}

export function resolveCardTemplateFields(
  layout: Readonly<Record<string, CardFieldLayout>> | undefined,
  fields: Readonly<Record<string, CardFieldValue>>,
): readonly ResolvedCardField[] {
  if (layout === undefined) {
    return [];
  }

  const resolved: ResolvedCardField[] = [];
  for (const [fieldName, fieldLayout] of Object.entries(layout)) {
    const textValue = resolveCardFieldDisplayText(fieldName, fieldLayout, fields);
    if (textValue === null) {
      continue;
    }
    resolved.push({
      fieldName,
      align: normalizeAlign(fieldLayout.align),
      x: fieldLayout.x ?? 0,
      y: fieldLayout.y ?? 0,
      fontSize: fieldLayout.fontSize ?? 11,
      wrap: fieldLayout.wrap,
      text: textValue,
      color: resolveCardFieldTextColor(fieldLayout, fields),
    });
  }
  return resolved;
}
