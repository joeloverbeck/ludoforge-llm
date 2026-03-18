import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';

import type { DiagnosticBuffer } from '../animation/diagnostic-buffer.js';
import type { RenderEventCard } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';

export interface OverlayPanelDiagnostics {
  readonly animationDiagnosticBuffer?: DiagnosticBuffer;
}

export interface OverlayPanelProps {
  readonly store: StoreApi<GameStore>;
  readonly diagnostics?: OverlayPanelDiagnostics;
  readonly onCardHoverStart?: (card: RenderEventCard, element: HTMLElement) => void;
  readonly onCardHoverEnd?: () => void;
}

export type OverlayPanelComponent = (props: OverlayPanelProps) => ReactElement | null;
