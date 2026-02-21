import { type CSSProperties, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderTrack } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import { buildFactionColorValue } from './faction-color-style.js';
import styles from './Scoreboard.module.css';

interface ScoreboardProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_TRACKS: readonly RenderTrack[] = [];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateTrackFillPercent(track: RenderTrack): number {
  if (track.max <= track.min) {
    return track.currentValue > track.min ? 100 : 0;
  }

  const ratio = (track.currentValue - track.min) / (track.max - track.min);
  return clamp(ratio * 100, 0, 100);
}

function groupFactionTracks(tracks: readonly RenderTrack[]): Map<string, readonly RenderTrack[]> {
  const grouped = new Map<string, RenderTrack[]>();

  for (const track of tracks) {
    const key = track.seat ?? 'Unscoped';
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, [track]);
      continue;
    }

    existing.push(track);
  }

  return grouped;
}

function buildFillStyle(track: RenderTrack, fallbackIndex: number): CSSProperties {
  return {
    width: `${calculateTrackFillPercent(track)}%`,
    backgroundColor: track.scope === 'seat'
      ? buildFactionColorValue(track.seat, fallbackIndex)
      : 'var(--accent)',
  };
}

export function Scoreboard({ store }: ScoreboardProps): ReactElement | null {
  const tracks = useStore(store, (state) => state.renderModel?.tracks ?? EMPTY_TRACKS);

  if (tracks.length === 0) {
    return null;
  }

  const globalTracks = tracks.filter((track) => track.scope === 'global');
  const factionTracks = tracks.filter((track) => track.scope === 'seat');
  const factionGroups = Array.from(groupFactionTracks(factionTracks).entries());

  return (
    <CollapsiblePanel
      title="Scoreboard"
      panelTestId="scoreboard"
      toggleTestId="scoreboard-toggle"
      contentTestId="scoreboard-content"
    >
      {globalTracks.length > 0 ? (
        <section className={styles.section} data-testid="scoreboard-global-section">
          <h3 className={styles.sectionTitle}>Global</h3>
          {globalTracks.map((track) => (
            <article key={track.id} className={styles.trackRow} data-testid={`track-${track.id}`}>
              <div className={styles.trackHeader}>
                <span>{track.displayName}</span>
                <span className={styles.trackValue}>{track.currentValue} / {track.max}</span>
              </div>
              <div className={styles.trackBar}>
                <div className={styles.trackFill} data-testid={`track-fill-${track.id}`} style={buildFillStyle(track, 0)} />
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {factionGroups.length > 0 ? (
        <section className={styles.section} data-testid="scoreboard-faction-section">
          <h3 className={styles.sectionTitle}>Factions</h3>
          {factionGroups.map(([faction, scopedTracks], factionIndex) => (
            <div key={faction} className={styles.factionGroup} data-testid={`scoreboard-faction-${faction}`}>
              <h4 className={styles.factionTitle}>{faction}</h4>
              {scopedTracks.map((track) => (
                <article key={track.id} className={styles.trackRow} data-testid={`track-${track.id}`}>
                  <div className={styles.trackHeader}>
                    <span>{track.displayName}</span>
                    <span className={styles.trackValue}>{track.currentValue} / {track.max}</span>
                  </div>
                  <div className={styles.trackBar}>
                    <div
                      className={styles.trackFill}
                      data-testid={`track-fill-${track.id}`}
                      style={buildFillStyle(track, factionIndex)}
                    />
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </CollapsiblePanel>
  );
}
