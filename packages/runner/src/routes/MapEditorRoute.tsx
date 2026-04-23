import type { ReactElement } from 'react';

import { MapEditorScreen } from '../map-editor/MapEditorScreen.js';

interface MapEditorRouteProps {
  readonly gameId: string;
  readonly onBack: () => void;
}

export function MapEditorRoute({
  gameId,
  onBack,
}: MapEditorRouteProps): ReactElement {
  return (
    <MapEditorScreen
      gameId={gameId}
      onBack={onBack}
    />
  );
}
