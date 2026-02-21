import { Text, type Container } from 'pixi.js';

import type { CardTemplate } from '../../config/visual-config-types.js';
import { type ResolvedCardField, resolveCardTemplateFields } from '../../config/card-field-resolver.js';
import { safeDestroyChildren } from './safe-destroy.js';

type CardFieldValue = number | string | boolean;

const contentSignatureCache = new WeakMap<Container, string>();

function buildContentSignature(
  template: CardTemplate,
  resolvedFields: readonly ResolvedCardField[],
): string {
  const mapped = resolvedFields.map((field) => ([
    field.fieldName,
    field.align,
    field.x,
    field.y,
    field.fontSize,
    field.wrap ?? null,
    field.text,
    field.color,
  ]));
  return JSON.stringify({
    width: template.width,
    height: template.height,
    fields: mapped,
  });
}

export function drawCardContent(
  container: Container,
  template: CardTemplate,
  fields: Readonly<Record<string, CardFieldValue>>,
): void {
  const resolvedFields = resolveCardTemplateFields(template.layout, fields);

  const nextSignature = resolvedFields.length === 0
    ? ''
    : buildContentSignature(template, resolvedFields);

  if (contentSignatureCache.get(container) === nextSignature) {
    return;
  }

  safeDestroyChildren(container);
  contentSignatureCache.set(container, nextSignature);

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
