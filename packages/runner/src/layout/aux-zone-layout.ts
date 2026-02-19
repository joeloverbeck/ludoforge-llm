import type { ZoneDef } from '@ludoforge/engine/runtime';

import type { AuxLayoutResult } from './layout-types.js';
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from './layout-constants.js';

const SIDEBAR_MARGIN_X = ZONE_RENDER_WIDTH + 40;
const ZONE_VERTICAL_SPACING = ZONE_RENDER_HEIGHT + 20;
const GROUP_VERTICAL_SPACING = ZONE_RENDER_HEIGHT + 60;

type AuxGroupKey = 'cards' | 'forcePools' | 'hands' | 'other';

const GROUP_ORDER: readonly AuxGroupKey[] = ['cards', 'forcePools', 'hands', 'other'];
const GROUP_LABELS: Readonly<Record<AuxGroupKey, string>> = {
  cards: 'Cards',
  forcePools: 'Force Pools',
  hands: 'Hands',
  other: 'Other',
};

export function computeAuxLayout(
  auxZones: readonly ZoneDef[],
  boardBounds: { minX: number; minY: number; maxX: number; maxY: number },
): AuxLayoutResult {
  if (auxZones.length === 0) {
    return {
      positions: new Map(),
      groups: [],
    };
  }

  const groupedIDs: Record<AuxGroupKey, string[]> = {
    cards: [],
    forcePools: [],
    hands: [],
    other: [],
  };

  for (const zone of auxZones) {
    groupedIDs[classifyAuxZone(zone)].push(zone.id);
  }

  for (const key of GROUP_ORDER) {
    groupedIDs[key].sort((left, right) => left.localeCompare(right));
  }

  const groups: { label: string; zoneIds: readonly string[] }[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  const sidebarX = boardBounds.maxX + SIDEBAR_MARGIN_X;
  let groupTopY = boardBounds.minY;

  for (const key of GROUP_ORDER) {
    const zoneIDs = groupedIDs[key];
    if (zoneIDs.length === 0) {
      continue;
    }

    groups.push({ label: GROUP_LABELS[key], zoneIds: zoneIDs });

    for (let index = 0; index < zoneIDs.length; index += 1) {
      const zoneID = zoneIDs[index];
      if (zoneID === undefined) {
        continue;
      }
      positions.set(zoneID, {
        x: sidebarX,
        y: groupTopY + (index * ZONE_VERTICAL_SPACING),
      });
    }

    const lastZoneY = groupTopY + ((zoneIDs.length - 1) * ZONE_VERTICAL_SPACING);
    groupTopY = lastZoneY + GROUP_VERTICAL_SPACING;
  }

  return {
    positions,
    groups,
  };
}

function classifyAuxZone(zone: ZoneDef): AuxGroupKey {
  if (zone.layoutRole === 'card') {
    return 'cards';
  }
  if (zone.layoutRole === 'forcePool') {
    return 'forcePools';
  }
  if (zone.layoutRole === 'hand') {
    return 'hands';
  }
  if (zone.layoutRole === 'other') {
    return 'other';
  }

  if (isCardZone(zone)) {
    return 'cards';
  }
  if (isHandZone(zone)) {
    return 'hands';
  }
  return 'other';
}

function isCardZone(zone: ZoneDef): boolean {
  return zone.ordering === 'stack' && (zone.adjacentTo?.length ?? 0) === 0;
}

function isHandZone(zone: ZoneDef): boolean {
  return zone.owner === 'player' && zone.visibility === 'owner';
}
