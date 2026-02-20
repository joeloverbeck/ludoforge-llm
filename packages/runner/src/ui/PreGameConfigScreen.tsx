import { type ReactElement, useMemo, useState } from 'react';

import type { BootstrapDescriptor } from '../bootstrap/bootstrap-registry.js';
import { createVisualConfigProvider } from '../config/visual-config-loader.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { PlayerSeatConfig } from '../session/session-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import styles from './PreGameConfigScreen.module.css';

interface PreGameConfigScreenProps {
  readonly gameId: string;
  readonly descriptor: BootstrapDescriptor | null;
  readonly onStartGame: (seed: number, playerConfig: readonly PlayerSeatConfig[]) => void;
  readonly onBack: () => void;
}

type SeatType = PlayerSeatConfig['type'];

const SEAT_OPTIONS: ReadonlyArray<{ readonly value: SeatType; readonly label: string }> = [
  { value: 'human', label: 'Human' },
  { value: 'ai-random', label: 'AI - Random' },
  { value: 'ai-greedy', label: 'AI - Greedy' },
];

export function PreGameConfigScreen({ gameId, descriptor, onStartGame, onBack }: PreGameConfigScreenProps): ReactElement {
  const playerMin = descriptor?.gameMetadata.playerMin ?? 1;
  const playerMax = descriptor?.gameMetadata.playerMax ?? playerMin;
  const initialPlayerCount = clampPlayerCount(playerMin, playerMin, playerMax);

  const [playerCount, setPlayerCount] = useState<number>(initialPlayerCount);
  const [seatTypes, setSeatTypes] = useState<readonly SeatType[]>(() => buildSeatTypes(initialPlayerCount));
  const [seedInput, setSeedInput] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const factionIds = descriptor?.gameMetadata.factionIds ?? [];
  const visualConfigProvider = useMemo(() => createVisualConfigProvider(descriptor?.resolveVisualConfigYaml() ?? null), [descriptor]);

  function handlePlayerCountChange(nextCountRaw: string): void {
    const nextCount = clampPlayerCount(parseInteger(nextCountRaw, playerCount), playerMin, playerMax);
    setPlayerCount(nextCount);
    setSeatTypes((current) => resizeSeatTypes(current, nextCount));
  }

  function handleSeatTypeChange(seatIndex: number, nextType: SeatType): void {
    setSeatTypes((current) => {
      const next = current.slice(0, playerCount);
      next[seatIndex] = nextType;
      return next;
    });
  }

  function handleStartGame(): void {
    const playerConfig = seatTypes
      .slice(0, playerCount)
      .map((type, seatIndex) => ({ playerId: seatIndex, type } satisfies PlayerSeatConfig));

    if (!playerConfig.some((seat) => seat.type === 'human')) {
      setValidationMessage('At least one seat must be Human.');
      return;
    }

    const parsedSeed = parseSeedValue(seedInput);
    if (parsedSeed === null) {
      setValidationMessage('Seed must be a non-negative safe integer.');
      return;
    }

    setValidationMessage(null);
    onStartGame(parsedSeed, playerConfig);
  }

  return (
    <main className={styles.screen} data-testid="pre-game-config-screen">
      <h1>Pre-Game Configuration</h1>
      <p className={styles.subtitle} data-testid="pre-game-selected-id">Game: {gameId}</p>

      <label className={styles.fieldLabel} htmlFor="pre-game-player-count">Player Count: {playerCount}</label>
      <input
        id="pre-game-player-count"
        data-testid="pre-game-player-count"
        type="range"
        min={String(playerMin)}
        max={String(playerMax)}
        step="1"
        value={String(playerCount)}
        onChange={(event) => {
          handlePlayerCountChange(event.currentTarget.value);
        }}
      />

      <section aria-label="Seat assignments" className={styles.seats}>
        {Array.from({ length: playerCount }, (_, seatIndex) => {
          const seatType = seatTypes[seatIndex] ?? 'ai-random';
          return (
            <div key={seatIndex} className={styles.seatRow} data-testid={`pre-game-seat-row-${seatIndex}`}>
              <span data-testid={`pre-game-seat-label-${seatIndex}`}>
                {resolveSeatLabel(seatIndex, factionIds, visualConfigProvider)}
              </span>
              <select
                data-testid={`pre-game-seat-type-${seatIndex}`}
                value={seatType}
                onChange={(event) => {
                  handleSeatTypeChange(seatIndex, event.currentTarget.value as SeatType);
                }}
              >
                {SEAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </section>

      <label className={styles.fieldLabel} htmlFor="pre-game-seed">Seed (optional)</label>
      <input
        id="pre-game-seed"
        data-testid="pre-game-seed"
        type="text"
        value={seedInput}
        placeholder="Random"
        onChange={(event) => {
          setSeedInput(event.currentTarget.value);
          if (validationMessage !== null) {
            setValidationMessage(null);
          }
        }}
      />

      {validationMessage === null
        ? null
        : <p className={styles.error} data-testid="pre-game-validation">{validationMessage}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          data-testid="pre-game-start"
          onClick={handleStartGame}
        >
          Start Game
        </button>
        <button
          type="button"
          data-testid="pre-game-back"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </main>
  );
}

function resolveSeatLabel(
  seatIndex: number,
  factionIds: readonly string[],
  visualConfigProvider: VisualConfigProvider,
): string {
  const factionId = factionIds[seatIndex];
  if (factionId === undefined) {
    return `Player ${seatIndex}`;
  }

  return visualConfigProvider.getFactionDisplayName(factionId)
    ?? formatIdAsDisplayName(factionId);
}

function buildSeatTypes(playerCount: number): readonly SeatType[] {
  return Array.from({ length: playerCount }, (_, index) => (index === 0 ? 'human' : 'ai-random'));
}

function resizeSeatTypes(current: readonly SeatType[], playerCount: number): readonly SeatType[] {
  const next = current.slice(0, playerCount);
  while (next.length < playerCount) {
    next.push(next.length === 0 ? 'human' : 'ai-random');
  }
  return next;
}

function parseSeedValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return randomSeed();
  }

  if (!/^\d+$/u.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseInteger(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }
  return parsed;
}

function clampPlayerCount(count: number, min: number, max: number): number {
  if (count < min) {
    return min;
  }
  if (count > max) {
    return max;
  }
  return count;
}

function randomSeed(): number {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(2);
    globalThis.crypto.getRandomValues(values);
    const high = values[0] ?? 0;
    const low = values[1] ?? 0;
    const combined = (BigInt(high) << 32n) | BigInt(low);
    return Number(combined % BigInt(Number.MAX_SAFE_INTEGER));
  }

  return Math.trunc(Math.random() * Number.MAX_SAFE_INTEGER);
}
