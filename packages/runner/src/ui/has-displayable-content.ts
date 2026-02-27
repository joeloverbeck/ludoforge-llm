import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

export function hasDisplayableContent(description: AnnotatedActionDescription): boolean {
  return description.sections.length > 0 || description.limitUsage.length > 0;
}
