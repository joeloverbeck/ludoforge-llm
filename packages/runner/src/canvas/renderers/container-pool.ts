import { Container } from 'pixi.js';
import { safeDestroyChildren, safeDestroyDisplayObject } from './safe-destroy.js';

const DEFAULT_EVENT_MODE = 'none' as const;

function resetContainerDefaults(container: Container): void {
  container.removeFromParent();
  safeDestroyChildren(container);
  container.removeAllListeners();

  container.position.set(0, 0);
  container.scale.set(1, 1);
  container.pivot.set(0, 0);
  container.skew.set(0, 0);
  container.rotation = 0;

  container.alpha = 1;
  container.visible = true;
  container.renderable = true;
  container.zIndex = 0;
  container.eventMode = DEFAULT_EVENT_MODE;
  container.interactiveChildren = true;
}

export interface ContainerPoolPolicy {
  createContainer?(): Container;
  resetContainer?(container: Container): void;
  destroyContainer?(container: Container): void;
}

export class ContainerPool {
  private readonly available: Container[] = [];

  private readonly inPool = new Set<Container>();

  private readonly createContainer: () => Container;

  private readonly resetContainer: (container: Container) => void;

  private readonly destroyContainer: (container: Container) => void;

  constructor(policy: ContainerPoolPolicy = {}) {
    this.createContainer = policy.createContainer ?? (() => new Container());
    this.resetContainer = policy.resetContainer ?? resetContainerDefaults;
    this.destroyContainer =
      policy.destroyContainer ??
      ((container: Container) => {
        safeDestroyDisplayObject(container, { children: true });
      });
  }

  acquire(): Container {
    const container = this.available.pop();
    if (container !== undefined) {
      this.inPool.delete(container);
      return container;
    }

    return this.createContainer();
  }

  release(container: Container): void {
    if (this.inPool.has(container)) {
      return;
    }

    this.resetContainer(container);
    this.available.push(container);
    this.inPool.add(container);
  }

  destroyAll(): void {
    for (const container of this.available) {
      this.destroyContainer(container);
    }

    this.available.length = 0;
    this.inPool.clear();
  }
}
