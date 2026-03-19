import { type ReactElement, useMemo, useState } from 'react';
import type { AgentDescriptor } from '@ludoforge/engine/runtime';

import type { BootstrapDescriptor } from '../bootstrap/bootstrap-registry.js';
import { createVisualConfigProvider } from '../config/visual-config-loader.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import {
  createAgentSeatController,
  createHumanSeatController,
  isHumanSeatController,
  type PlayerSeatConfig,
  type SeatController,
} from '../seat/seat-controller.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import styles from './PreGameConfigScreen.module.css';

interface PreGameConfigScreenProps {
  readonly gameId: string;
  readonly descriptor: BootstrapDescriptor | null;
  readonly onStartGame: (seed: number, playerConfig: readonly PlayerSeatConfig[]) => void;
  readonly onBack: () => void;
}

type ControllerKind = SeatController['kind'];
type AgentMode = 'policy' | 'builtin:greedy' | 'builtin:random';

const CONTROLLER_KIND_OPTIONS: ReadonlyArray<{ readonly value: ControllerKind; readonly label: string }> = [
  { value: 'human', label: 'Human' },
  { value: 'agent', label: 'Agent' },
];

const AGENT_MODE_OPTIONS: ReadonlyArray<{ readonly value: AgentMode; readonly label: string }> = [
  { value: 'policy', label: 'Authored Policy' },
  { value: 'builtin:greedy', label: 'Built-in Greedy' },
  { value: 'builtin:random', label: 'Built-in Random' },
];

export function PreGameConfigScreen({ gameId, descriptor, onStartGame, onBack }: PreGameConfigScreenProps): ReactElement {
  const playerMin = descriptor?.gameMetadata.playerMin ?? 1;
  const playerMax = descriptor?.gameMetadata.playerMax ?? playerMin;
  const initialPlayerCount = clampPlayerCount(playerMin, playerMin, playerMax);

  const [playerCount, setPlayerCount] = useState<number>(initialPlayerCount);
  const [seatControllers, setSeatControllers] = useState<readonly SeatController[]>(() => buildSeatControllers(initialPlayerCount));
  const [seedInput, setSeedInput] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const factionIds = descriptor?.gameMetadata.factionIds ?? [];
  const visualConfigProvider = useMemo(() => createVisualConfigProvider(descriptor?.resolveVisualConfigYaml() ?? null), [descriptor]);

  function handlePlayerCountChange(nextCountRaw: string): void {
    const nextCount = clampPlayerCount(parseInteger(nextCountRaw, playerCount), playerMin, playerMax);
    setPlayerCount(nextCount);
    setSeatControllers((current) => resizeSeatControllers(current, nextCount));
  }

  function handleControllerKindChange(seatIndex: number, nextKind: ControllerKind): void {
    setSeatControllers((current) => {
      const next = current.slice(0, playerCount);
      next[seatIndex] = nextKind === 'human'
        ? createHumanSeatController()
        : createAgentSeatController();
      return next;
    });
  }

  function handleAgentModeChange(seatIndex: number, nextMode: AgentMode): void {
    setSeatControllers((current) => {
      const next = current.slice(0, playerCount);
      next[seatIndex] = createAgentSeatController(parseAgentMode(nextMode));
      return next;
    });
  }

  function handleStartGame(): void {
    const playerConfig = seatControllers
      .slice(0, playerCount)
      .map((controller, seatIndex) => ({ playerId: seatIndex, controller } satisfies PlayerSeatConfig));

    if (!playerConfig.some((seat) => isHumanSeatController(seat.controller))) {
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
          const controller = seatControllers[seatIndex] ?? createAgentSeatController();
          return (
            <div key={seatIndex} className={styles.seatRow} data-testid={`pre-game-seat-row-${seatIndex}`}>
              <span data-testid={`pre-game-seat-label-${seatIndex}`}>
                {resolveSeatLabel(seatIndex, factionIds, visualConfigProvider)}
              </span>
              <select
                data-testid={`pre-game-seat-kind-${seatIndex}`}
                value={controller.kind}
                onChange={(event) => {
                  handleControllerKindChange(seatIndex, event.currentTarget.value as ControllerKind);
                }}
              >
                {CONTROLLER_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {controller.kind !== 'agent'
                ? null
                : (
                  <select
                    data-testid={`pre-game-seat-agent-${seatIndex}`}
                    value={formatAgentMode(controller.agent)}
                    onChange={(event) => {
                      handleAgentModeChange(seatIndex, event.currentTarget.value as AgentMode);
                    }}
                  >
                    {AGENT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
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

function buildSeatControllers(playerCount: number): readonly SeatController[] {
  return Array.from({ length: playerCount }, (_, index) => (index === 0 ? createHumanSeatController() : createAgentSeatController()));
}

function resizeSeatControllers(current: readonly SeatController[], playerCount: number): readonly SeatController[] {
  const next = current.slice(0, playerCount);
  while (next.length < playerCount) {
    next.push(next.length === 0 ? createHumanSeatController() : createAgentSeatController());
  }
  return next;
}

function parseAgentMode(mode: AgentMode): AgentDescriptor {
  switch (mode) {
    case 'policy':
      return { kind: 'policy' };
    case 'builtin:greedy':
      return { kind: 'builtin', builtinId: 'greedy' };
    case 'builtin:random':
      return { kind: 'builtin', builtinId: 'random' };
    default:
      throw new Error(`Unsupported agent mode: ${String(mode)}`);
  }
}

function formatAgentMode(agent: AgentDescriptor): AgentMode {
  if (agent.kind === 'policy') {
    return 'policy';
  }
  return `builtin:${agent.builtinId}`;
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
