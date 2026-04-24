import type { ReactElement } from 'react';

import type { BootstrapDescriptor } from '../bootstrap/bootstrap-registry.js';
import { PreGameConfigScreen } from '../ui/PreGameConfigScreen.js';
import type { PlayerSeatConfig } from '../seat/seat-controller.js';

interface PreGameConfigRouteProps {
  readonly gameId: string;
  readonly descriptor: BootstrapDescriptor | null;
  readonly onStartGame: (seed: number, playerConfig: readonly PlayerSeatConfig[]) => void;
  readonly onBack: () => void;
}

export function PreGameConfigRoute({
  gameId,
  descriptor,
  onStartGame,
  onBack,
}: PreGameConfigRouteProps): ReactElement {
  return (
    <PreGameConfigScreen
      gameId={gameId}
      descriptor={descriptor}
      onStartGame={onStartGame}
      onBack={onBack}
    />
  );
}
