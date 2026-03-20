import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import type { GameDef, TerminalResult } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createHumanSeatController } from '../../src/seat/seat-controller.js';
import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker } from '../../src/worker/game-worker-api.js';
import type { PlayerSeatConfig } from '../../src/session/session-types.js';

const TWO_PLAYER_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, controller: createHumanSeatController() },
  { playerId: 1, controller: createHumanSeatController() },
];

function compileStoreFixture(terminalThreshold: number): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-game-store-crash-lifecycle-test',
      players: {
        min: 2,
        max: 2,
      },
    },
    globalVars: [
      {
        name: 'round',
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    ],
    zones: [
      {
        id: 'table',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
      },
    ],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'tick',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }],
        limits: [],
      },
    ],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'round' }, right: terminalThreshold },
          result: { type: 'draw' },
        },
      ],
    },
  });

  if (compiled.gameDef === null) {
    throw new Error(`Expected fixture to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }

  return compiled.gameDef;
}

async function createInitializedStore() {
  const store = createGameStore(createGameWorker(), new VisualConfigProvider(null));
  await store.getState().initGame(compileStoreFixture(5), 11, TWO_PLAYER_CONFIG);
  return store;
}

describe('createGameStore crash lifecycle', () => {
  it('reportCanvasCrash transitions to canvasCrashed and preserves game session state', async () => {
    const store = await createInitializedStore();
    const before = store.getState();

    store.getState().reportCanvasCrash();

    const after = store.getState();
    expect(after.gameLifecycle).toBe('canvasCrashed');
    expect(after.gameDef).toBe(before.gameDef);
    expect(after.gameState).toBe(before.gameState);
    expect(after.playerSeats).toBe(before.playerSeats);
    expect(after.legalMoveResult).toBe(before.legalMoveResult);
    expect(after.renderModel).toBe(before.renderModel);
    expect(after.terminal).toBe(before.terminal);
  });

  it('reportCanvasCrash also works from terminal', async () => {
    const store = await createInitializedStore();
    const terminal: TerminalResult = { type: 'draw' };
    store.setState({ gameLifecycle: 'terminal', terminal });

    store.getState().reportCanvasCrash();

    expect(store.getState().gameLifecycle).toBe('canvasCrashed');
    expect(store.getState().terminal).toBe(terminal);
  });

  it('beginCanvasRecovery transitions to reinitializing', async () => {
    const store = await createInitializedStore();
    store.getState().reportCanvasCrash();

    store.getState().beginCanvasRecovery();

    expect(store.getState().gameLifecycle).toBe('reinitializing');
  });

  it('canvasRecovered returns to playing when terminal is null', async () => {
    const store = await createInitializedStore();
    store.getState().reportCanvasCrash();
    store.getState().beginCanvasRecovery();

    store.getState().canvasRecovered();

    expect(store.getState().gameLifecycle).toBe('playing');
  });

  it('canvasRecovered returns to terminal when terminal is set', async () => {
    const store = await createInitializedStore();
    const terminal: TerminalResult = { type: 'draw' };
    store.setState({ gameLifecycle: 'terminal', terminal });
    store.getState().reportCanvasCrash();
    store.getState().beginCanvasRecovery();

    store.getState().canvasRecovered();

    expect(store.getState().gameLifecycle).toBe('terminal');
  });

  it('crash recovery actions are no-op outside their legal source states', async () => {
    const store = await createInitializedStore();

    store.setState({ gameLifecycle: 'idle' });
    store.getState().reportCanvasCrash();
    expect(store.getState().gameLifecycle).toBe('idle');

    store.getState().beginCanvasRecovery();
    expect(store.getState().gameLifecycle).toBe('idle');

    store.getState().canvasRecovered();
    expect(store.getState().gameLifecycle).toBe('idle');

    store.setState({ gameLifecycle: 'canvasCrashed' });
    store.getState().canvasRecovered();
    expect(store.getState().gameLifecycle).toBe('canvasCrashed');

    store.setState({ gameLifecycle: 'reinitializing' });
    store.getState().reportCanvasCrash();
    expect(store.getState().gameLifecycle).toBe('reinitializing');
  });
});
