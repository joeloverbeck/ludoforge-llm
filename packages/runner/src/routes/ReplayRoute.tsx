import type { ReactElement } from 'react';

import type { ReplayState } from '../session/session-types.js';
import { useReplayRuntime } from '../session/replay-runtime.js';
import { ReplayScreen } from '../ui/ReplayScreen.js';

interface ReplayRouteProps {
  readonly sessionState: ReplayState;
  readonly onBackToMenu: () => void;
}

export function ReplayRoute({
  sessionState,
  onBackToMenu,
}: ReplayRouteProps): ReactElement {
  const replayRuntime = useReplayRuntime(sessionState);

  return (
    <ReplayScreen
      runtime={replayRuntime}
      onBackToMenu={onBackToMenu}
    />
  );
}
