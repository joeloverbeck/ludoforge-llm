const LIVE_REGION_SELECTOR = '[data-ludoforge-live-region="true"]';

export interface AriaAnnouncer {
  announce(message: string): void;
  destroy(): void;
}

export function createAriaAnnouncer(container: HTMLElement): AriaAnnouncer {
  const existingLiveRegion = container.querySelector<HTMLElement>(LIVE_REGION_SELECTOR);
  const ownerDocument = container.ownerDocument;
  const createdLiveRegion = existingLiveRegion === null ? ownerDocument.createElement('div') : existingLiveRegion;

  if (existingLiveRegion === null) {
    createdLiveRegion.dataset.ludoforgeLiveRegion = 'true';
    createdLiveRegion.dataset.ludoforgeManagedRegion = 'true';
    container.appendChild(createdLiveRegion);
  }

  configureLiveRegion(createdLiveRegion);

  return {
    announce(message: string): void {
      createdLiveRegion.textContent = '';
      createdLiveRegion.textContent = message;
    },
    destroy(): void {
      createdLiveRegion.textContent = '';
      if (createdLiveRegion.dataset.ludoforgeManagedRegion === 'true') {
        createdLiveRegion.remove();
      }
    },
  };
}

function configureLiveRegion(liveRegion: HTMLElement): void {
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.style.position = 'absolute';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.margin = '-1px';
  liveRegion.style.padding = '0';
  liveRegion.style.border = '0';
  liveRegion.style.overflow = 'hidden';
  liveRegion.style.clip = 'rect(0 0 0 0)';
  liveRegion.style.clipPath = 'inset(50%)';
  liveRegion.style.whiteSpace = 'nowrap';
}
