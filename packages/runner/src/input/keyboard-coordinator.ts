export interface KeyboardHandlerRegistration {
  readonly priority?: number;
}

export interface KeyboardCoordinator {
  register(handler: (event: KeyboardEventLike) => boolean, options?: KeyboardHandlerRegistration): () => void;
  destroy(): void;
}

export interface KeyboardEventLike {
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
}

interface KeydownTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
}

interface RegisteredHandler {
  readonly id: number;
  readonly priority: number;
  readonly handler: (event: KeyboardEventLike) => boolean;
}

export function createKeyboardCoordinator(target: KeydownTarget): KeyboardCoordinator {
  let nextId = 0;
  const handlers: RegisteredHandler[] = [];

  const onKeyDown = (event: KeyboardEventLike): void => {
    if (event.defaultPrevented) {
      return;
    }

    const sortedHandlers = [...handlers].sort((a, b) => {
      if (a.priority === b.priority) {
        return a.id - b.id;
      }
      return b.priority - a.priority;
    });

    for (const entry of sortedHandlers) {
      if (!entry.handler(event)) {
        continue;
      }
      event.preventDefault();
      return;
    }
  };

  target.addEventListener('keydown', onKeyDown);

  return {
    register(handler, options = {}) {
      const entry: RegisteredHandler = {
        id: nextId,
        priority: options.priority ?? 0,
        handler,
      };
      nextId += 1;
      handlers.push(entry);
      return (): void => {
        const index = handlers.findIndex((candidate) => candidate.id === entry.id);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      };
    },
    destroy() {
      handlers.length = 0;
      target.removeEventListener('keydown', onKeyDown);
    },
  };
}
