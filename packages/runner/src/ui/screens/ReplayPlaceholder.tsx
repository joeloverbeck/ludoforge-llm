import type { ReactElement } from 'react';

interface ReplayPlaceholderProps {
  readonly onBackToMenu: () => void;
}

export function ReplayPlaceholder({ onBackToMenu }: ReplayPlaceholderProps): ReactElement {
  return (
    <main data-testid="replay-screen">
      <h1>Replay</h1>
      <button
        type="button"
        data-testid="replay-back-to-menu"
        onClick={onBackToMenu}
      >
        Back to Menu
      </button>
    </main>
  );
}
