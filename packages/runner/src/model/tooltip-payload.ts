import type { HoveredCanvasTarget } from '../canvas/hover-anchor-contract.js';
import type { RenderModel, RenderToken, RenderZone } from './render-model.js';
import type { GameStore } from '../store/game-store.js';

export interface TooltipPayload {
  readonly kind: 'zone' | 'token';
  readonly title: string;
  readonly rows: readonly TooltipRow[];
  readonly sections: readonly TooltipSection[];
}

export interface TooltipRow {
  readonly label: string;
  readonly value: string;
}

export interface TooltipSection {
  readonly title: string;
  readonly rows: readonly TooltipRow[];
}

export function projectTooltipPayload(
  renderModel: RenderModel | null,
  hoverTarget: HoveredCanvasTarget | null,
): TooltipPayload | null {
  if (renderModel === null || hoverTarget === null) {
    return null;
  }

  if (hoverTarget.kind === 'zone') {
    const zone = renderModel.zones.find((candidate) => candidate.id === hoverTarget.id);
    return zone === undefined ? null : projectZoneTooltipPayload(zone);
  }

  const token = renderModel.tokens.find((candidate) => candidate.id === hoverTarget.id);
  return token === undefined ? null : projectTokenTooltipPayload(token);
}

export function selectTooltipPayloadFromStoreState(
  state: Pick<GameStore, 'renderModel'>,
  hoverTarget: HoveredCanvasTarget | null,
): TooltipPayload | null {
  return projectTooltipPayload(state.renderModel, hoverTarget);
}

export function selectTooltipPayloadSignature(
  state: Pick<GameStore, 'renderModel'>,
  hoverTarget: HoveredCanvasTarget | null,
): string | null {
  const payload = selectTooltipPayloadFromStoreState(state, hoverTarget);
  return payload === null ? null : serializeTooltipPayload(payload);
}

function projectZoneTooltipPayload(zone: RenderZone): TooltipPayload {
  return {
    kind: 'zone',
    title: zone.displayName,
    rows: [
      { label: 'Zone ID', value: zone.id },
      { label: 'Tokens', value: String(zone.tokenIDs.length + zone.hiddenTokenCount) },
      { label: 'Visibility', value: zone.visibility },
      { label: 'Owner', value: zone.ownerID === null ? 'none' : String(zone.ownerID) },
    ],
    sections: [
      {
        title: 'Markers',
        rows: zone.markers.length === 0
          ? [{ label: 'None', value: 'none' }]
          : zone.markers.map((marker) => ({
              label: marker.displayName,
              value: marker.state,
            })),
      },
    ],
  };
}

function projectTokenTooltipPayload(token: RenderToken): TooltipPayload {
  return {
    kind: 'token',
    title: token.type,
    rows: [
      { label: 'Token ID', value: token.id },
      { label: 'Owner', value: token.ownerID === null ? 'none' : String(token.ownerID) },
      { label: 'Face Up', value: token.faceUp ? 'yes' : 'no' },
      { label: 'Zone', value: token.zoneID },
    ],
    sections: [
      {
        title: 'Properties',
        rows: derivePropertyRows(token),
      },
    ],
  };
}

function derivePropertyRows(token: RenderToken): readonly TooltipRow[] {
  const entries = Object.entries(token.properties).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return [{ label: 'None', value: 'none' }];
  }

  return entries.map(([key, value]) => ({
    label: key,
    value: String(value),
  }));
}

function serializeTooltipPayload(payload: TooltipPayload): string {
  const rowKey = payload.rows
    .map((row) => `${row.label}=${row.value}`)
    .join('|');
  const sectionKey = payload.sections
    .map((section) => {
      const sectionRows = section.rows
        .map((row) => `${row.label}=${row.value}`)
        .join('|');
      return `${section.title}:${sectionRows}`;
    })
    .join('||');

  return `${payload.kind}::${payload.title}::${rowKey}::${sectionKey}`;
}
