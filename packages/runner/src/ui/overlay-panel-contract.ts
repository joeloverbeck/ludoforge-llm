import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';

import type { DiagnosticBuffer } from '../animation/diagnostic-buffer.js';
import type { GameStore } from '../store/game-store.js';

export interface OverlayPanelDiagnostics {
  readonly animationDiagnosticBuffer?: DiagnosticBuffer;
}

export interface OverlayPanelProps {
  readonly store: StoreApi<GameStore>;
  readonly diagnostics?: OverlayPanelDiagnostics;
}

export type OverlayPanelComponent = (props: OverlayPanelProps) => ReactElement | null;
