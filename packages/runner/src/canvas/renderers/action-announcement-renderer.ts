import { gsap } from 'gsap';
import { Text, type Container } from 'pixi.js';

import type { PresentationActionAnnouncementSpec } from '../../presentation/action-announcement-presentation.js';
import { createManagedText, destroyManagedText } from '../text/text-runtime.js';

const FADE_IN_SECONDS = 0.3;
const HOLD_SECONDS = 1.5;
const FADE_OUT_SECONDS = 0.7;
const ANNOUNCEMENT_RISE = 18;

interface ActiveAnnouncement {
  readonly textNode: Text;
  readonly timeline: gsap.core.Timeline;
}

interface PlayerAnnouncementState {
  active: ActiveAnnouncement | null;
  readonly queue: PresentationActionAnnouncementSpec[];
}

export interface ActionAnnouncementRenderer {
  enqueue(spec: PresentationActionAnnouncementSpec): void;
  destroy(): void;
}

export interface ActionAnnouncementRendererOptions {
  readonly parentContainer: Container;
}

export function createActionAnnouncementRenderer(
  options: ActionAnnouncementRendererOptions,
): ActionAnnouncementRenderer {
  const announcementByPlayer = new Map<string, PlayerAnnouncementState>();
  let destroyed = false;

  const clearActiveAnnouncement = (playerKey: string): void => {
    const playerState = announcementByPlayer.get(playerKey);
    if (playerState === undefined || playerState.active === null) {
      return;
    }

    playerState.active.timeline.kill();
    destroyManagedText(playerState.active.textNode);
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
    const nextSpec = playerState.queue.shift();
    if (nextSpec === undefined) {
      return;
    }

    const textNode = createManagedText({
      parent: options.parentContainer,
      text: nextSpec.text,
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
      anchor: { x: 0.5, y: 0.5 },
      position: { x: nextSpec.anchor.x, y: nextSpec.anchor.y },
    });
    textNode.alpha = 0;

    const fadeOutTargetY = nextSpec.anchor.y - ANNOUNCEMENT_RISE;
    const timeline = gsap.timeline({
      onComplete: () => {
        const currentPlayerState = announcementByPlayer.get(playerKey);
        destroyManagedText(textNode);
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

  const queueAnnouncement = (spec: PresentationActionAnnouncementSpec): void => {
    const playerState = announcementByPlayer.get(spec.queueKey) ?? { active: null, queue: [] };
    playerState.queue.push(spec);
    announcementByPlayer.set(spec.queueKey, playerState);
    maybeRenderNext(spec.queueKey);
  };

  return {
    enqueue(spec: PresentationActionAnnouncementSpec): void {
      if (destroyed) {
        return;
      }
      queueAnnouncement(spec);
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;

      for (const [playerKey] of announcementByPlayer.entries()) {
        clearActiveAnnouncement(playerKey);
      }
      announcementByPlayer.clear();
    },
  };
}
