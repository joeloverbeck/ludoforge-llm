import type { ReactElement } from 'react';

import type { BootstrapDescriptor } from '../../bootstrap/bootstrap-registry.js';

interface PreGameConfigPlaceholderProps {
  readonly gameId: string;
  readonly descriptor: BootstrapDescriptor | null;
  readonly onStartGame: (seed: number, playerId: number) => void;
  readonly onBack: () => void;
}

export function PreGameConfigPlaceholder({ gameId, descriptor, onStartGame, onBack }: PreGameConfigPlaceholderProps): ReactElement {
  return (
    <main data-testid="pre-game-config-screen">
      <h1>Pre-Game Config</h1>
      <p data-testid="pre-game-selected-id">{gameId}</p>
      <button
        type="button"
        data-testid="pre-game-start"
        onClick={() => {
          const defaultPlayerId = descriptor?.defaultPlayerId ?? 0;
          onStartGame(descriptor?.defaultSeed ?? 42, defaultPlayerId);
        }}
      >
        Start Game
      </button>
      <button
        type="button"
        data-testid="pre-game-back"
        onClick={onBack}
      >
        Back
      </button>
    </main>
  );
}
