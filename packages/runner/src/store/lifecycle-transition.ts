import type { TerminalResult } from '@ludoforge/engine/runtime';

export type GameLifecycle = 'idle' | 'initializing' | 'playing' | 'canvasCrashed' | 'reinitializing' | 'terminal';

const ALLOWED_LIFECYCLE_TRANSITIONS: Readonly<Record<GameLifecycle, readonly GameLifecycle[]>> = {
  idle: ['idle', 'initializing'],
  initializing: ['idle', 'initializing', 'playing', 'terminal'],
  playing: ['initializing', 'playing', 'canvasCrashed', 'terminal'],
  canvasCrashed: ['canvasCrashed', 'reinitializing'],
  reinitializing: ['reinitializing', 'playing', 'terminal'],
  terminal: ['initializing', 'playing', 'canvasCrashed', 'terminal'],
};

export function assertLifecycleTransition(current: GameLifecycle, next: GameLifecycle, path: string): GameLifecycle {
  if (ALLOWED_LIFECYCLE_TRANSITIONS[current].includes(next)) {
    return next;
  }

  throw new Error(`Illegal game lifecycle transition on ${path}: ${current} -> ${next}`);
}

export function lifecycleFromTerminal(terminal: TerminalResult | null): Exclude<GameLifecycle, 'idle' | 'initializing'> {
  return terminal === null ? 'playing' : 'terminal';
}
