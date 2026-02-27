import { describe, expect, it } from 'vitest';
import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import { hasDisplayableContent } from '../../src/ui/has-displayable-content.js';

function makeDescription(
  overrides: Partial<AnnotatedActionDescription> = {},
): AnnotatedActionDescription {
  return {
    sections: [],
    limitUsage: [],
    ...overrides,
  };
}

describe('hasDisplayableContent', () => {
  it('returns false for empty sections and empty limitUsage', () => {
    const desc = makeDescription({ sections: [], limitUsage: [] });
    expect(hasDisplayableContent(desc)).toBe(false);
  });

  it('returns true when sections is non-empty', () => {
    const desc = makeDescription({
      sections: [{ kind: 'group', label: 'Effects', children: [] }],
    });
    expect(hasDisplayableContent(desc)).toBe(true);
  });

  it('returns true when limitUsage is non-empty', () => {
    const desc = makeDescription({
      limitUsage: [{ scope: 'turn', max: 2, current: 1 }],
    });
    expect(hasDisplayableContent(desc)).toBe(true);
  });

  it('returns true when both sections and limitUsage are non-empty', () => {
    const desc = makeDescription({
      sections: [{ kind: 'group', label: 'Effects', children: [] }],
      limitUsage: [{ scope: 'turn', max: 2, current: 1 }],
    });
    expect(hasDisplayableContent(desc)).toBe(true);
  });
});
