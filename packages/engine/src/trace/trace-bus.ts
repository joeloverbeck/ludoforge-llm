import type { TraceEvent, TraceSubscriber } from './trace-events.js';

export interface TraceBus {
  subscribe(fn: TraceSubscriber): () => void;
  emit(event: TraceEvent): void;
  unsubscribeAll(): void;
}

export function createTraceBus(): TraceBus {
  const subscribers = new Set<TraceSubscriber>();

  return {
    subscribe(fn: TraceSubscriber): () => void {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    emit(event: TraceEvent): void {
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    },

    unsubscribeAll(): void {
      subscribers.clear();
    },
  };
}
