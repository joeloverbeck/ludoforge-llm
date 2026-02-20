import { gsap } from 'gsap';
import type { Move } from '@ludoforge/engine/runtime';
import { Text, type Container } from 'pixi.js';
import type { StoreApi } from 'zustand';

import type { AppliedMoveEvent, GameStore } from '../../store/game-store.js';
import type { PositionStore } from '../position-store.js';
import { formatIdAsDisplayName } from '../../utils/format-display-name.js';

const FADE_IN_SECONDS = 0.3;
const HOLD_SECONDS = 1.5;
const FADE_OUT_SECONDS = 0.7;
const PLAYER_ANNOUNCEMENT_Y_OFFSET = 72;
const ANNOUNCEMENT_RISE = 18;

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

interface ActiveAnnouncement {
  readonly textNode: Text;
  readonly timeline: gsap.core.Timeline;
}

interface PlayerAnnouncementState {
  active: ActiveAnnouncement | null;
  readonly queue: AnnouncementPayload[];
}

export interface ActionAnnouncementRenderer {
  start(): void;
  destroy(): void;
}

export interface ActionAnnouncementRendererOptions {
  readonly store: StoreApi<GameStore>;
  readonly positionStore: PositionStore;
  readonly parentContainer: Container;
}

interface AnnouncementPayload {
  readonly actorId: AppliedMoveEvent['actorId'];
  readonly text: string;
}

function isAiSeat(seat: AppliedMoveEvent['actorSeat']): boolean {
  return seat === 'ai-random' || seat === 'ai-greedy';
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

function formatAnnouncementText(state: GameStore, move: Move): string {
  const actionId = String(move.actionId);
  const actionDisplayName = state.renderModel?.actionGroups
    .flatMap((group) => group.actions)
    .find((action) => action.actionId === actionId)
    ?.displayName
    ?? formatIdAsDisplayName(actionId);
  return `${actionDisplayName}${formatMoveSummary(move)}`;
}

function resolveAnnouncementAnchor(
  state: GameStore,
  positionStore: PositionStore,
  actorId: AppliedMoveEvent['actorId'],
): { x: number; y: number } | null {
  const renderModel = state.renderModel;
  if (renderModel === null) {
    return null;
  }

  const positions = positionStore.getSnapshot().positions;
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

export function createActionAnnouncementRenderer(
  options: ActionAnnouncementRendererOptions,
): ActionAnnouncementRenderer {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const announcementByPlayer = new Map<string, PlayerAnnouncementState>();
  let started = false;
  let destroyed = false;
  let unsubscribe: (() => void) | null = null;

  const clearActiveAnnouncement = (playerKey: string): void => {
    const playerState = announcementByPlayer.get(playerKey);
    if (playerState === undefined || playerState.active === null) {
      return;
    }

    playerState.active.timeline.kill();
    playerState.active.textNode.removeFromParent();
    playerState.active.textNode.destroy();
    playerState.active = null;
  };

  const maybeRenderNext = (playerKey: string): void => {
    if (destroyed) {
      return;
    }
    const playerState = announcementByPlayer.get(playerKey);
    if (playerState === undefined || playerState.active !== null) {
      return;
    }
    const nextPayload = playerState.queue.shift();
    if (nextPayload === undefined) {
      return;
    }

    const state = selectorStore.getState();
    const anchor = resolveAnnouncementAnchor(state, options.positionStore, nextPayload.actorId);
    if (anchor === null) {
      maybeRenderNext(playerKey);
      return;
    }

    const textNode = new Text({
      text: nextPayload.text,
      style: {
        fill: '#ffffff',
        fontSize: 22,
        fontWeight: '600',
        stroke: {
          color: '#0f172a',
          width: 4,
        },
        dropShadow: {
          color: '#020617',
          alpha: 0.8,
          blur: 4,
          distance: 2,
          angle: Math.PI / 2,
        },
      },
    });
    textNode.anchor.set(0.5, 0.5);
    textNode.position.set(anchor.x, anchor.y);
    textNode.alpha = 0;
    options.parentContainer.addChild(textNode);

    const fadeOutTargetY = anchor.y - ANNOUNCEMENT_RISE;
    const timeline = gsap.timeline({
      onComplete: () => {
        const currentPlayerState = announcementByPlayer.get(playerKey);
        textNode.removeFromParent();
        textNode.destroy();
        if (currentPlayerState !== undefined) {
          currentPlayerState.active = null;
          maybeRenderNext(playerKey);
        }
      },
    });
    timeline.to(textNode, {
      alpha: 1,
      duration: FADE_IN_SECONDS,
      ease: 'power2.out',
    });
    timeline.to(textNode, {
      alpha: 1,
      duration: HOLD_SECONDS,
    });
    timeline.to(textNode, {
      alpha: 0,
      y: fadeOutTargetY,
      duration: FADE_OUT_SECONDS,
      ease: 'power1.in',
    });
    playerState.active = {
      textNode,
      timeline,
    };
  };

  const queueAnnouncement = (playerId: string, payload: AnnouncementPayload): void => {
    const playerState = announcementByPlayer.get(playerId) ?? { active: null, queue: [] };
    playerState.queue.push(payload);
    announcementByPlayer.set(playerId, playerState);
    maybeRenderNext(playerId);
  };

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
          if (!isAiSeat(event.actorSeat)) {
            return;
          }
          queueAnnouncement(String(event.actorId), {
            actorId: event.actorId,
            text: formatAnnouncementText(selectorStore.getState(), event.move),
          });
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

      for (const [playerKey] of announcementByPlayer.entries()) {
        clearActiveAnnouncement(playerKey);
      }
      announcementByPlayer.clear();
    },
  };
}
