import { describe, expect, it } from 'vitest';

import { createAriaAnnouncer } from '../../../src/canvas/interactions/aria-announcer';

class MockElement {
  readonly dataset: Record<string, string> = {};

  readonly style: Record<string, string> = {};

  readonly children: MockElement[] = [];

  readonly attributes = new Map<string, string>();

  parentElement: MockElement | null = null;

  textContent = '';

  constructor(readonly ownerDocument: MockDocument) {}

  appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector<TElement extends MockElement = MockElement>(selector: string): TElement | null {
    if (selector !== '[data-ludoforge-live-region="true"]') {
      return null;
    }

    return this.children.find((child) => child.dataset.ludoforgeLiveRegion === 'true') as TElement | undefined ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  remove(): void {
    if (this.parentElement === null) {
      return;
    }

    const nextChildren = this.parentElement.children.filter((child) => child !== this);
    this.parentElement.children.length = 0;
    this.parentElement.children.push(...nextChildren);
    this.parentElement = null;
  }
}

class MockDocument {
  createElement(_tagName: string): MockElement {
    return new MockElement(this);
  }
}

function createContainer(): MockElement {
  const document = new MockDocument();
  return new MockElement(document);
}

describe('createAriaAnnouncer', () => {
  it('sets live region text when announce is called and replaces previous text', () => {
    const container = createContainer();
    const announcer = createAriaAnnouncer(container as unknown as HTMLElement);
    const liveRegion = container.querySelector('[data-ludoforge-live-region="true"]');

    announcer.announce('Zone selected: Saigon');
    expect(liveRegion?.textContent).toBe('Zone selected: Saigon');

    announcer.announce('Zone selected: Hanoi');
    expect(liveRegion?.textContent).toBe('Zone selected: Hanoi');
  });

  it('destroy removes managed live region from the container', () => {
    const container = createContainer();
    const announcer = createAriaAnnouncer(container as unknown as HTMLElement);

    expect(container.querySelector('[data-ludoforge-live-region="true"]')).not.toBeNull();

    announcer.destroy();

    expect(container.querySelector('[data-ludoforge-live-region="true"]')).toBeNull();
  });

  it('ensures live region has polite status semantics', () => {
    const container = createContainer();
    createAriaAnnouncer(container as unknown as HTMLElement);
    const liveRegion = container.querySelector('[data-ludoforge-live-region="true"]');

    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.getAttribute('role')).toBe('status');
  });

  it('reuses preexisting un-managed live region and does not remove it on destroy', () => {
    const container = createContainer();
    const existingRegion = container.ownerDocument.createElement('div');
    existingRegion.dataset.ludoforgeLiveRegion = 'true';
    container.appendChild(existingRegion);

    const announcer = createAriaAnnouncer(container as unknown as HTMLElement);

    announcer.destroy();

    expect(container.querySelector('[data-ludoforge-live-region="true"]')).toBe(existingRegion);
    expect(existingRegion.textContent).toBe('');
  });
});
