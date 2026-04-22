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
type AgentMode = 'policy';

const CONTROLLER_KIND_OPTIONS: ReadonlyArray<{ readonly value: ControllerKind; readonly label: string }> = [
  { value: 'human', label: 'Human' },
  { value: 'agent', label: 'Agent' },
];

const AGENT_MODE_OPTIONS: ReadonlyArray<{ readonly value: AgentMode; readonly label: string }> = [
  { value: 'policy', label: 'Authored Policy' },
];

export function PreGameConfigScreen({ gameId, descriptor, onStartGame, onBack }: PreGameConfigScreenProps): ReactElement {
  const metadata = descriptor?.gameMetadata;
  const playerMin = metadata?.playerMin ?? 1;
  const playerMax = metadata?.playerMax ?? playerMin;
  const initialPlayerCount = clampPlayerCount(playerMin, playerMin, playerMax);
  const isFixedPlayerCount = playerMin === playerMax;
  const seatModelSummary = describeSeatModel(playerMin, playerMax, metadata?.factionIds ?? []);

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
      <button
        type="button"
        className={styles.backLink}
        data-testid="pre-game-back-link"
        onClick={onBack}
      >
        Back to library
      </button>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Pre-Game Setup</p>
        <h1 className={styles.title}>Configure your table</h1>
        <p className={styles.subtitle} data-testid="pre-game-selected-id">{metadata?.name ?? gameId}</p>
        {metadata?.description?.length
          ? <p className={styles.lead}>{metadata.description}</p>
          : null}
        <div className={styles.metaGroup}>
          <span className={styles.metaBadge}>{formatPlayerSummary(playerMin, playerMax, isFixedPlayerCount)}</span>
          <span className={styles.metaBadge}>{`${playerCount} seat${playerCount === 1 ? '' : 's'} configured`}</span>
        </div>
        <p className={styles.heroNote}>{describeGamePayoff(playerMin, playerMax, factionIds)}</p>
      </section>

      <div className={styles.layout}>
        <section className={styles.formPanel}>
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.sectionEyebrow}>Table Setup</p>
              <h2 className={styles.sectionTitle}>Session options</h2>
            </div>
            <p className={styles.sectionCopy}>
              {seatModelSummary}
            </p>
          </div>

          <section className={styles.formSection} aria-labelledby="player-count-heading">
            <div className={styles.sectionBlockHeader}>
              <div>
                <h3 id="player-count-heading" className={styles.blockTitle}>Player count</h3>
                <p className={styles.blockCopy}>
                  {isFixedPlayerCount
                    ? 'This game always starts with the full table.'
                    : 'Adjust how many seats are active before the game begins.'}
                </p>
              </div>
              <div className={styles.playerCountValue}>
                <span className={styles.playerCountNumber}>{playerCount}</span>
                <span className={styles.playerCountLabel}>{playerCount === 1 ? 'player' : 'players'}</span>
              </div>
            </div>
            {isFixedPlayerCount
              ? (
                <div className={styles.fixedValueCard} data-testid="pre-game-player-count-fixed">
                  Fixed at {playerCount} players
                </div>
              )
              : (
                <>
                  <label className={styles.fieldLabel} htmlFor="pre-game-player-count">
                    Active seats
                  </label>
                  <input
                    id="pre-game-player-count"
                    data-testid="pre-game-player-count"
                    className={styles.rangeInput}
                    type="range"
                    min={String(playerMin)}
                    max={String(playerMax)}
                    step="1"
                    value={String(playerCount)}
                    onChange={(event) => {
                      handlePlayerCountChange(event.currentTarget.value);
                    }}
                  />
                  <p className={styles.fieldHint}>
                    Available range: {playerMin} to {playerMax} players.
                  </p>
                </>
              )}
          </section>

          <section aria-label="Seat assignments" className={styles.formSection}>
            <div className={styles.sectionBlockHeader}>
              <div>
                <h3 className={styles.blockTitle}>Seat assignments</h3>
                <p className={styles.blockCopy}>
                  Each seat can be controlled by a person or by one of the available runner agents.
                </p>
              </div>
            </div>
            {hasMixedNamedAndGenericSeats(factionIds, playerCount)
              ? (
                <p className={styles.seatModelNote} data-testid="pre-game-seat-model-note">
                  Named seats come from the game metadata. Additional seats are generic table positions added by your chosen player count.
                </p>
              )
              : null}
            <div className={styles.seats}>
              {Array.from({ length: playerCount }, (_, seatIndex) => {
                const controller = seatControllers[seatIndex] ?? createAgentSeatController();
                const seatDescriptor = resolveSeatDescriptor(
                  seatIndex,
                  factionIds,
                  visualConfigProvider,
                  hasMixedNamedAndGenericSeats(factionIds, playerCount),
                );
                return (
                  <div key={seatIndex} className={styles.seatRow} data-testid={`pre-game-seat-row-${seatIndex}`}>
                    <div className={styles.seatIdentity}>
                      <p className={styles.seatEyebrow}>{`Seat ${seatIndex + 1}`}</p>
                      <p className={styles.seatLabel} data-testid={`pre-game-seat-label-${seatIndex}`}>
                        {seatDescriptor.label}
                      </p>
                      {seatDescriptor.note === null
                        ? null
                        : <p className={styles.seatNote}>{seatDescriptor.note}</p>}
                    </div>
                    <div className={styles.seatControls}>
                      <label className={styles.selectField}>
                        <span className={styles.selectLabel}>Controller</span>
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
                      </label>
                      {controller.kind !== 'agent'
                        ? null
                        : (
                          <label className={styles.selectField}>
                            <span className={styles.selectLabel}>Agent mode</span>
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
                          </label>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionBlockHeader}>
              <div>
                <h3 className={styles.blockTitle}>Seed</h3>
                <p className={styles.blockCopy}>
                  Leave this blank for a random session, or set a value to reproduce the same start state later.
                </p>
              </div>
            </div>
            <label className={styles.fieldLabel} htmlFor="pre-game-seed">Seed (optional)</label>
            <input
              id="pre-game-seed"
              data-testid="pre-game-seed"
              className={styles.seedInput}
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
            <p className={styles.fieldHint}>Accepted values are non-negative safe integers.</p>
          </section>

          {validationMessage === null
            ? null
            : <p className={styles.error} data-testid="pre-game-validation">{validationMessage}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryAction}
              data-testid="pre-game-start"
              onClick={handleStartGame}
            >
              Start Game
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              data-testid="pre-game-back"
              onClick={onBack}
            >
              Back
            </button>
          </div>
        </section>

        <aside className={styles.summaryPanel}>
          <p className={styles.sectionEyebrow}>What happens next</p>
          <h2 className={styles.sectionTitle}>Session summary</h2>
          <p className={styles.summaryLead}>{describeSummaryLead(playerMin, playerMax, factionIds)}</p>
          <ul className={styles.summaryList}>
            <li>
              <span className={styles.summaryLabel}>Game</span>
              <span className={styles.summaryValue}>{metadata?.name ?? gameId}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>Seats</span>
              <span className={styles.summaryValue}>{formatSeatSummary(playerCount, playerMin, playerMax)}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>Human seats</span>
              <span className={styles.summaryValue}>{seatControllers.slice(0, playerCount).filter((seat) => seat.kind === 'human').length}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>Seed</span>
              <span className={styles.summaryValue}>{seedInput.trim().length === 0 ? 'Randomized at launch' : seedInput.trim()}</span>
            </li>
          </ul>
          <p className={styles.summaryNote}>
            You can return to the library at any time before launch without losing these setup choices.
          </p>
        </aside>
      </div>
    </main>
  );
}

function resolveSeatDescriptor(
  seatIndex: number,
  factionIds: readonly string[],
  visualConfigProvider: VisualConfigProvider,
  hasMixedSeats: boolean,
): { readonly label: string; readonly note: string | null } {
  const factionId = factionIds[seatIndex];
  if (factionId === undefined) {
    return {
      label: `Seat ${seatIndex + 1}`,
      note: 'Generic table position',
    };
  }

  return {
    label: visualConfigProvider.getFactionDisplayName(factionId)
      ?? formatIdAsDisplayName(factionId),
    note: hasMixedSeats
      ? 'Named role from game metadata'
      : null,
  };
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
  if (mode !== 'policy') {
    throw new Error(`Unsupported agent mode: ${String(mode)}`);
  }
  return { kind: 'policy' };
}

function formatAgentMode(agent: AgentDescriptor): AgentMode {
  if (agent.kind !== 'policy') {
    throw new Error(`Unsupported agent descriptor kind: ${String(agent.kind)}`);
  }
  return 'policy';
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

function formatPlayerSummary(playerMin: number, playerMax: number, isFixed: boolean): string {
  if (isFixed) {
    return `${playerMin} players fixed`;
  }
  return `${playerMin}-${playerMax} players`;
}

function formatSeatSummary(playerCount: number, playerMin: number, playerMax: number): string {
  if (playerMin === playerMax) {
    return `${playerCount} fixed seats`;
  }
  return `${playerCount} active of ${playerMax} max`;
}

function hasMixedNamedAndGenericSeats(factionIds: readonly string[], playerCount: number): boolean {
  return factionIds.length > 0 && factionIds.length < playerCount;
}

function describeSeatModel(playerMin: number, playerMax: number, factionIds: readonly string[]): string {
  if (playerMin === playerMax && factionIds.length === playerMax && playerMax > 1) {
    return 'Every seat is already mapped to a named role, so this pass is about choosing who pilots each side and whether you want a reproducible seed.';
  }

  if (factionIds.length > 0 && factionIds.length < playerMax) {
    return 'Choose how many seats are active, decide who controls each position, and use the named seats as anchors when the table mixes special roles with generic positions.';
  }

  return 'Choose how many seats are active, assign controllers, and optionally lock in a deterministic seed for reproducible setup.';
}

function describeSummaryLead(playerMin: number, playerMax: number, factionIds: readonly string[]): string {
  if (playerMin === playerMax && factionIds.length === playerMax && playerMax > 1) {
    return 'Launch will open the full asymmetric table immediately with one configured controller for each named side.';
  }

  if (factionIds.length > 0 && factionIds.length < playerMax) {
    return 'The runner will keep named roles intact and fill the rest of the table with generic seat positions based on your player-count choice.';
  }

  return 'The runner will open a fresh table with the seat count, controller mix, and seed you choose here.';
}

function describeGamePayoff(playerMin: number, playerMax: number, factionIds: readonly string[]): string {
  if (playerMin === playerMax && factionIds.length === playerMax && playerMax > 1) {
    return 'Best for full-table asymmetric sessions where every side enters from the opening move.';
  }

  if (factionIds.length > 0 && factionIds.length < playerMax) {
    return 'Best for flexible table sessions where one anchor role stays named while the rest of the seats scale with your chosen player count.';
  }

  if (playerMin !== playerMax) {
    return 'Best for quickly reshaping the table size before launch while keeping the same controller mix and seed options.';
  }

  return 'Best for a fast start: lock the controllers, set a seed if needed, and launch straight into the table.';
}
