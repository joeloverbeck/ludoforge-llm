import type { ReactElement } from 'react';

import type { BootstrapDescriptor } from '../../bootstrap/bootstrap-registry.js';

interface GameSelectionPlaceholderProps {
  readonly descriptors: readonly BootstrapDescriptor[];
  readonly onSelectGame: (gameId: string) => void;
}

export function GameSelectionPlaceholder({ descriptors, onSelectGame }: GameSelectionPlaceholderProps): ReactElement {
  return (
    <main data-testid="game-selection-screen">
      <h1>Game Selection</h1>
      {descriptors.map((descriptor) => (
        <button
          key={descriptor.id}
          type="button"
          data-testid={`select-game-${descriptor.id}`}
          onClick={() => {
            onSelectGame(descriptor.id);
          }}
        >
          {descriptor.id}
        </button>
      ))}
    </main>
  );
}
