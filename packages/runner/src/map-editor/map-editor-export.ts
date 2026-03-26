import { stringify } from 'yaml';

import {
  VisualConfigSchema,
  type VisualConfig,
} from '../config/visual-config-types.js';
import { cloneConnectionRouteDefinition } from '../config/connection-route-utils.js';
import type { MapEditorDocumentState } from './map-editor-types.js';

export interface EditorExportInput extends MapEditorDocumentState {
  readonly originalVisualConfig: VisualConfig;
}

export function buildExportConfig({
  originalVisualConfig,
  zonePositions,
  connectionAnchors,
  connectionRoutes,
}: EditorExportInput): VisualConfig {
  const config = cloneSerializable(originalVisualConfig);

  const hiddenZoneSet = new Set(originalVisualConfig.zones?.hiddenZones ?? []);
  config.layout = {
    ...config.layout,
    hints: {
      ...config.layout?.hints,
      fixed: [...zonePositions.entries()]
        .filter(([zone]) => !hiddenZoneSet.has(zone))
        .map(([zone, position]) => ({
          zone,
          x: position.x,
          y: position.y,
        })),
    },
  };

  config.zones = {
    ...config.zones,
    connectionAnchors: Object.fromEntries(
      [...connectionAnchors.entries()].map(([anchorId, position]) => [
        anchorId,
        { x: position.x, y: position.y },
      ]),
    ),
    connectionRoutes: Object.fromEntries(
      [...connectionRoutes.entries()].map(([routeId, route]) => [
        routeId,
        cloneConnectionRouteDefinition(route),
      ]),
    ),
  };

  return config;
}

export function serializeVisualConfig(config: VisualConfig): string {
  return stringify(config, {
    aliasDuplicateObjects: false,
    lineWidth: 0,
  });
}

export function exportVisualConfig(input: EditorExportInput): string {
  const config = VisualConfigSchema.parse(buildExportConfig(input));
  return serializeVisualConfig(config);
}

export function triggerDownload(yamlString: string, filename: string): void {
  if (
    typeof Blob === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
    || typeof URL.revokeObjectURL !== 'function'
    || typeof document === 'undefined'
  ) {
    throw new Error('Browser download APIs are unavailable.');
  }

  const blob = new Blob([yamlString], { type: 'text/yaml' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function cloneSerializable<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
