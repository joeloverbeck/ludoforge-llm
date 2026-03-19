import type { Move } from '@ludoforge/engine/runtime';
import type { StoreApi } from 'zustand';

import type { RenderModel } from '../model/render-model.js';
import type { AppliedMoveEvent, GameStore } from '../store/game-store.js';
import type { PositionStore } from '../canvas/position-store.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

const PLAYER_ANNOUNCEMENT_Y_OFFSET = 72;

interface SelectorSubscribeStore<TState> extends StoreApi<TState> {
  subscribe: {
    (listener: (state: TState, previousState: TState) => void): () => void;
    <TSelected>(
      selector: (state: TState) => TSelected,
      listener: (selectedState: TSelected, previousSelectedState: TSelected) => void,
      options?: {
        readonly equalityFn?: (a: TSelected, b: TSelected) => boolean;
        readonly fireImmediately?: boolean;
      },
    ): () => void;
  };
}

export interface PresentationActionAnnouncementSpec {
  readonly queueKey: string;
  readonly actorId: AppliedMoveEvent['actorId'];
  readonly text: string;
  readonly anchor: {
    readonly x: number;
    readonly y: number;
  };
  readonly sequence: number;
  readonly signature: string;
}

export interface ActionAnnouncementPresenter {
  start(): void;
  destroy(): void;
}

export interface ActionAnnouncementPresenterOptions {
  readonly store: StoreApi<GameStore>;
  readonly positionStore: PositionStore;
  readonly onAnnouncement: (spec: PresentationActionAnnouncementSpec) => void;
}

export function createActionAnnouncementPresenter(
  options: ActionAnnouncementPresenterOptions,
): ActionAnnouncementPresenter {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  let started = false;
  let destroyed = false;
  let unsubscribe: (() => void) | null = null;

  return {
    start(): void {
      if (started || destroyed) {
        return;
      }
      started = true;
      unsubscribe = selectorStore.subscribe(
        (state) => state.appliedMoveEvent,
        (event, previousEvent) => {
          if (event === null || event === previousEvent || previousEvent?.sequence === event.sequence) {
            return;
          }
          const spec = resolveActionAnnouncementSpec(
            selectorStore.getState().renderModel,
            options.positionStore.getSnapshot().positions,
            event,
          );
          if (spec !== null) {
            options.onAnnouncement(spec);
          }
        },
      );
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      started = false;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

export function resolveActionAnnouncementSpec(
  renderModel: RenderModel | null,
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  event: AppliedMoveEvent,
): PresentationActionAnnouncementSpec | null {
  if (!isAiSeat(event.actorSeat)) {
    return null;
  }
  if (renderModel === null) {
    return null;
  }

  const anchor = resolveAnnouncementAnchor(renderModel, positions, event.actorId);
  if (anchor === null) {
    return null;
  }

  const text = formatAnnouncementText(renderModel, event.move);
  return {
    queueKey: String(event.actorId),
    actorId: event.actorId,
    text,
    anchor,
    sequence: event.sequence,
    signature: `${event.sequence}|${event.actorId}|${text}|${anchor.x}|${anchor.y}`,
  };
}

function isAiSeat(seat: AppliedMoveEvent['actorSeat']): boolean {
  return seat !== 'human' && seat !== 'unknown';
}

function formatMoveSummary(move: Move): string {
  const params = Object.values(move.params);
  if (params.length === 0) {
    return '';
  }
  const formatted = params
    .map((value) => formatMoveParamValue(value))
    .filter((value) => value.length > 0);
  if (formatted.length === 0) {
    return '';
  }
  return ` (${formatted.join(', ')})`;
}

function formatMoveParamValue(value: Move['params'][string]): string {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => String(entry));
    return entries.length === 0 ? '' : `[${entries.join(', ')}]`;
  }
  return String(value);
}

function formatAnnouncementText(renderModel: RenderModel, move: Move): string {
  const actionId = String(move.actionId);
  const actionDisplayName = renderModel.actionGroups
    .flatMap((group) => group.actions)
    .find((action) => action.actionId === actionId)
    ?.displayName
    ?? formatIdAsDisplayName(actionId);
  return `${actionDisplayName}${formatMoveSummary(move)}`;
}

function resolveAnnouncementAnchor(
  renderModel: RenderModel,
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  actorId: AppliedMoveEvent['actorId'],
): { x: number; y: number } | null {
  const ownerZones = renderModel.zones
    .filter((zone) => zone.ownerID === actorId)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const zone of ownerZones) {
    const position = positions.get(zone.id);
    if (position === undefined) {
      continue;
    }
    return {
      x: position.x,
      y: position.y + PLAYER_ANNOUNCEMENT_Y_OFFSET,
    };
  }
  return null;
}
