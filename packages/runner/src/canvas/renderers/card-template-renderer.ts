import type { Container } from 'pixi.js';

import type { ResolvedCardField } from '../../config/card-field-resolver.js';
import type { CardTemplate } from '../../config/visual-config-types.js';
import { createKeyedTextReconciler, type KeyedTextReconciler } from '../text/text-runtime.js';
import { resolveCardTemplateFields } from '../../config/card-field-resolver.js';

type CardFieldValue = number | string | boolean;

const runtimeByContainer = new WeakMap<Container, KeyedTextReconciler>();

function getOrCreateRuntime(container: Container): KeyedTextReconciler {
  let runtime = runtimeByContainer.get(container);
  if (runtime === undefined) {
    runtime = createKeyedTextReconciler({ parentContainer: container });
    runtimeByContainer.set(container, runtime);
  }
  return runtime;
}

export function drawCardContent(
  container: Container,
  template: CardTemplate,
  fields: Readonly<Record<string, CardFieldValue>>,
): void {
  drawResolvedCardContent(container, template, resolveCardTemplateFields(template.layout, fields));
}

export function drawResolvedCardContent(
  container: Container,
  template: CardTemplate,
  resolvedFields: readonly ResolvedCardField[],
): void {
  const runtime = getOrCreateRuntime(container);

  if (resolvedFields.length === 0) {
    runtime.reconcile([]);
    return;
  }

  const cardWidth = template.width;
  const cardHeight = template.height;
  const left = -cardWidth / 2;
  const top = -cardHeight / 2;

  runtime.reconcile(resolvedFields.map((field) => {
    const hasWrap = typeof field.wrap === 'number' && Number.isFinite(field.wrap);
    const anchorX = field.align === 'left' ? 0 : field.align === 'center' ? 0.5 : 1;
    const baseX = field.align === 'left' ? left + 3 : field.align === 'center' ? 0 : left + cardWidth - 3;

    return {
      key: field.fieldName,
      text: field.text,
      style: {
        fill: field.color,
        fontSize: field.fontSize,
        fontFamily: 'monospace',
        align: field.align,
        wordWrap: hasWrap,
        wordWrapWidth: hasWrap ? field.wrap : 0,
      },
      anchor: { x: anchorX, y: 0 },
      position: {
        x: baseX + field.x,
        y: top + field.y,
      },
    };
  }));
}

export function destroyCardContentPool(container: Container): void {
  const runtime = runtimeByContainer.get(container);
  if (runtime !== undefined) {
    runtime.destroy();
    runtimeByContainer.delete(container);
  }
}
