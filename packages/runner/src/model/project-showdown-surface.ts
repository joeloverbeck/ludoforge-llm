import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type {
  RenderPlayer,
  RenderShowdownCard,
  RenderShowdownPlayerEntry,
  ShowdownSurfaceModel,
} from './render-model.js';
import type { RunnerProjectionBundle, RunnerVariable } from './runner-frame.js';

const EMPTY_SHOWDOWN_CARDS: readonly RenderShowdownCard[] = [];

export function projectShowdownSurface(
  bundle: RunnerProjectionBundle,
  players: readonly RenderPlayer[],
  visualConfigProvider: VisualConfigProvider,
): ShowdownSurfaceModel | null {
  const config = visualConfigProvider.getShowdownSurface();
  if (config === null || bundle.frame.phaseName !== config.when.phase) {
    return null;
  }

  const tokensById = new Map(bundle.frame.tokens.map((token) => [token.id, token] as const));
  const allowedPlayerZones = new Set(config.playerCards.zones);
  const communityCards: RenderShowdownCard[] = [];

  for (const zoneId of config.communityCards.zones) {
    const zone = bundle.frame.zones.find((entry) => entry.id === zoneId);
    if (zone === undefined) {
      continue;
    }
    for (const tokenId of zone.tokenIDs) {
      const token = tokensById.get(tokenId);
      if (token !== undefined) {
        communityCards.push(toShowdownCard(token));
      }
    }
  }

  const rankedPlayers: RenderShowdownPlayerEntry[] = [];
  for (const player of players) {
    if (player.isEliminated) {
      continue;
    }

    const score = findPerPlayerNumericVar(
      bundle.source.playerVars.get(player.id) ?? [],
      config.ranking.source.name,
    );
    if (score === null) {
      continue;
    }
    if (config.ranking.hideZeroScores === true && score === 0) {
      continue;
    }

    const holeCards: RenderShowdownCard[] = [];
    for (const zone of bundle.frame.zones) {
      if (!allowedPlayerZones.has(zone.id) || zone.ownerID !== player.id) {
        continue;
      }
      for (const tokenId of zone.tokenIDs) {
        const token = tokensById.get(tokenId);
        if (token !== undefined) {
          holeCards.push(toShowdownCard(token));
        }
      }
    }

    rankedPlayers.push({
      playerId: player.id,
      displayName: player.displayName,
      score,
      holeCards,
    });
  }

  rankedPlayers.sort((left, right) => right.score - left.score);

  if (rankedPlayers.length === 0 && communityCards.length === 0) {
    return null;
  }

  return {
    communityCards: communityCards.length === 0 ? EMPTY_SHOWDOWN_CARDS : communityCards,
    rankedPlayers,
  };
}

export function showdownSurfaceEqual(
  previous: ShowdownSurfaceModel | null,
  next: ShowdownSurfaceModel | null,
): boolean {
  if (previous === next) {
    return true;
  }
  if (previous === null || next === null) {
    return false;
  }

  return showdownCardsEqual(previous.communityCards, next.communityCards)
    && showdownPlayersEqual(previous.rankedPlayers, next.rankedPlayers);
}

function showdownCardsEqual(
  previous: readonly RenderShowdownCard[],
  next: readonly RenderShowdownCard[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index];
    const right = next[index];
    if (
      left?.id !== right?.id
      || left?.type !== right?.type
      || left?.faceUp !== right?.faceUp
      || !recordEqual(left?.properties ?? {}, right?.properties ?? {})
    ) {
      return false;
    }
  }

  return true;
}

function showdownPlayersEqual(
  previous: readonly RenderShowdownPlayerEntry[],
  next: readonly RenderShowdownPlayerEntry[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index];
    const right = next[index];
    if (
      left?.playerId !== right?.playerId
      || left?.displayName !== right?.displayName
      || left?.score !== right?.score
      || !showdownCardsEqual(left?.holeCards ?? EMPTY_SHOWDOWN_CARDS, right?.holeCards ?? EMPTY_SHOWDOWN_CARDS)
    ) {
      return false;
    }
  }

  return true;
}

function toShowdownCard(
  token: RunnerProjectionBundle['frame']['tokens'][number],
): RenderShowdownCard {
  return {
    id: token.id,
    type: token.type,
    faceUp: token.faceUp,
    properties: token.properties,
  };
}

function findPerPlayerNumericVar(
  variables: readonly RunnerVariable[],
  name: string,
): number | null {
  const variable = variables.find((entry) => entry.name === name);
  return typeof variable?.value === 'number' ? variable.value : null;
}

function recordEqual(
  previous: Readonly<Record<string, string | number | boolean>>,
  next: Readonly<Record<string, string | number | boolean>>,
): boolean {
  const previousEntries = Object.entries(previous);
  const nextEntries = Object.entries(next);
  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (const [key, value] of previousEntries) {
    if (next[key] !== value) {
      return false;
    }
  }

  return true;
}
