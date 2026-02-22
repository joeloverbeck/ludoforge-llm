import type { Container } from 'pixi.js';

import type { CardTemplate } from '../../config/visual-config-types.js';
import { type ResolvedCardField, resolveCardTemplateFields } from '../../config/card-field-resolver.js';
import { createTextSlotPool, type TextSlotPool } from './text-slot-pool.js';

type CardFieldValue = number | string | boolean;

const contentSignatureCache = new WeakMap<Container, string>();
const poolByContainer = new WeakMap<Container, TextSlotPool>();

function getOrCreatePool(container: Container): TextSlotPool {
  let pool = poolByContainer.get(container);
  if (pool === undefined) {
    pool = createTextSlotPool(container);
    poolByContainer.set(container, pool);
  }
  return pool;
}

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

  contentSignatureCache.set(container, nextSignature);

  const pool = getOrCreatePool(container);

  if (resolvedFields.length === 0) {
    pool.hideFrom(0);
    return;
  }

  const cardWidth = template.width;
  const cardHeight = template.height;
  const left = -cardWidth / 2;
  const top = -cardHeight / 2;

  for (let i = 0; i < resolvedFields.length; i++) {
    const field = resolvedFields[i]!;
    const hasWrap = typeof field.wrap === 'number' && Number.isFinite(field.wrap);

    const text = pool.acquire(i);

    text.text = field.text;
    text.style.fill = field.color;
    text.style.fontSize = field.fontSize;
    text.style.fontFamily = 'monospace';
    text.style.align = field.align;

    if (hasWrap) {
      text.style.wordWrap = true;
      text.style.wordWrapWidth = field.wrap as number;
    } else {
      text.style.wordWrap = false;
      text.style.wordWrapWidth = 0;
    }

    text.eventMode = 'none';
    text.interactiveChildren = false;
    text.anchor.set(field.align === 'left' ? 0 : field.align === 'center' ? 0.5 : 1, 0);
    const baseX = field.align === 'left' ? left + 3 : field.align === 'center' ? 0 : left + cardWidth - 3;
    text.position.set(
      baseX + field.x,
      top + field.y,
    );
  }

  pool.hideFrom(resolvedFields.length);
}

export function destroyCardContentPool(container: Container): void {
  const pool = poolByContainer.get(container);
  if (pool !== undefined) {
    pool.destroyAll();
    poolByContainer.delete(container);
  }
  contentSignatureCache.delete(container);
}
