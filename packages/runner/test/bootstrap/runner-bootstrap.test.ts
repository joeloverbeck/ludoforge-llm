import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';

async function importFreshRunnerBootstrap() {
  return import('../../src/bootstrap/runner-bootstrap.js');
}

describe('runner-bootstrap', () => {
  it('resolves full bootstrap state and centralized capabilities for FITL', async () => {
    const { resolveRunnerBootstrapByGameId } = await importFreshRunnerBootstrap();
    const resolved = await resolveRunnerBootstrapByGameId('fitl');

    expect(resolved).not.toBeNull();
    expect(resolved?.descriptor.id).toBe('fitl');
    expect(resolved?.gameDef.metadata.id).toBe('fire-in-the-lake');
    expect(resolved?.capabilities.supportsMapEditor).toBe(true);
    expect(resolved?.visualConfigProvider.getConnectionRoutes().size).toBe(17);
  }, 20000);

  it('returns null for unknown descriptor ids', async () => {
    const { resolveRunnerBootstrapByGameId } = await importFreshRunnerBootstrap();
    await expect(resolveRunnerBootstrapByGameId('missing-game')).resolves.toBeNull();
  });

  it('derives runtime playerId from the human seat and falls back to descriptor defaults', async () => {
    const { resolveRuntimeBootstrap } = await importFreshRunnerBootstrap();
    const explicitHuman = resolveRuntimeBootstrap(
      'fitl',
      77,
      [
        { playerId: 3, controller: createHumanSeatController() },
        { playerId: 1, controller: createAgentSeatController() },
      ],
    );
    const defaultSeat = resolveRuntimeBootstrap(
      'fitl',
      77,
      [{ playerId: 1, controller: createAgentSeatController() }],
    );

    expect(explicitHuman?.playerId).toBe(3);
    expect(defaultSeat?.playerId).toBe(0);
  });
});

describe('runner-bootstrap with mocked bootstrap inputs', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/bootstrap/bootstrap-registry.js');
    vi.doUnmock('../../src/bootstrap/texas-game-def.json');
  });

  it('fails immediately when shared visual config schema is malformed', async () => {
    vi.resetModules();
    vi.doMock('../../src/bootstrap/bootstrap-registry.js', async () => {
      const texasFixture = (await import('../../src/bootstrap/texas-game-def.json')).default;
      return {
        findBootstrapDescriptorById: () => ({
          id: 'texas',
          queryValue: 'texas',
          defaultSeed: 42,
          defaultPlayerId: 0,
          sourceLabel: 'Texas Hold\'em bootstrap fixture',
          gameMetadata: {
            name: "Texas Hold'em",
            description: '',
            playerMin: 2,
            playerMax: 10,
            factionIds: [],
          },
          resolveGameDefInput: async () => texasFixture,
          resolveVisualConfigYaml: () => ({
            version: 2,
          }),
        }),
      };
    });

    const { resolveRunnerBootstrapByGameId } = await importFreshRunnerBootstrap();
    await expect(resolveRunnerBootstrapByGameId('texas')).rejects.toThrowError(/Invalid visual config schema/u);
  });
});
