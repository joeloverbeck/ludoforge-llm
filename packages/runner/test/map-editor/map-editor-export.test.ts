// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { parseVisualConfigStrict } from '../../src/config/validate-visual-config-refs.js';
import {
  buildExportConfig,
  exportVisualConfig,
  serializeVisualConfig,
  triggerDownload,
} from '../../src/map-editor/map-editor-export.js';
import type { ConnectionRouteDefinition, VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('map-editor-export', () => {
  it('buildExportConfig writes fixed positions, anchors, and routes while preserving unrelated sections', () => {
    const input = makeExportInput();

    const exported = buildExportConfig(input);

    expect(exported.layout?.hints?.fixed).toEqual([
      { zone: 'zone:a', x: 10, y: 20 },
      { zone: 'zone:b', x: 40, y: 60 },
    ]);
    expect(exported.zones?.connectionAnchors).toEqual({
      bend: { x: 22, y: 33 },
      ctrl: { x: 44, y: 55 },
    });
    expect(exported.zones?.connectionRoutes).toEqual({
      'route:none': {
        points: [
          { kind: 'zone', zoneId: 'zone:a' },
          { kind: 'anchor', anchorId: 'bend' },
          { kind: 'zone', zoneId: 'zone:b' },
        ],
        segments: [
          { kind: 'straight' },
          { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'ctrl' } },
        ],
      },
    });
    expect(exported.factions).toEqual(input.originalVisualConfig.factions);
    expect(exported.tokenTypes).toEqual(input.originalVisualConfig.tokenTypes);
    expect(input.originalVisualConfig.layout?.hints?.fixed).toEqual([{ zone: 'existing', x: 1, y: 2 }]);
  });

  it('exportVisualConfig round-trips through YAML parsing and strict schema validation', () => {
    const yaml = exportVisualConfig(makeExportInput());

    const reparsed = parseVisualConfigStrict(parse(yaml));

    expect(reparsed?.layout?.hints?.fixed).toEqual([
      { zone: 'zone:a', x: 10, y: 20 },
      { zone: 'zone:b', x: 40, y: 60 },
    ]);
    expect(reparsed?.zones?.connectionAnchors).toEqual({
      bend: { x: 22, y: 33 },
      ctrl: { x: 44, y: 55 },
    });
    expect(reparsed?.zones?.connectionRoutes?.['route:none']).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'anchor', anchorId: 'bend' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [
        { kind: 'straight' },
        { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'ctrl' } },
      ],
    });
  });

  it('serializeVisualConfig emits yaml text', () => {
    const yaml = serializeVisualConfig(buildExportConfig(makeExportInput()));

    expect(yaml).toContain('version: 1');
    expect(yaml).toContain('fixed:');
    expect(yaml).toContain('connectionRoutes:');
  });

  it('triggerDownload creates a blob url, clicks an anchor, and revokes the url', () => {
    const createObjectURL = vi.fn(() => 'blob:visual-config');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return { click, href: '', download: '' } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    }) as typeof document.createElement);

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    triggerDownload('version: 1\n', 'visual-config.yaml');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:visual-config');

    createElement.mockRestore();
  });

  it('triggerDownload throws when browser download apis are unavailable', () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: undefined,
      revokeObjectURL: undefined,
    });

    expect(() => triggerDownload('version: 1\n', 'visual-config.yaml')).toThrow('Browser download APIs are unavailable.');
  });
});

function makeExportInput() {
  return {
    originalVisualConfig: {
      version: 1,
      layout: {
        mode: 'graph',
        hints: {
          fixed: [{ zone: 'existing', x: 1, y: 2 }],
          regions: [{ name: 'north', zones: ['zone:a'] }],
        },
      },
      factions: {
        blue: { color: '#00f', displayName: 'Blue' },
      },
      tokenTypes: {
        cube: { shape: 'cube', color: '#333' },
      },
      zones: {
        connectionAnchors: {
          old: { x: 1, y: 1 },
        },
        connectionRoutes: {
          old: {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [{ kind: 'straight' }],
          },
        },
      },
    } satisfies VisualConfig,
    zonePositions: new Map([
      ['zone:a', { x: 10, y: 20 }],
      ['zone:b', { x: 40, y: 60 }],
    ]),
    connectionAnchors: new Map([
      ['bend', { x: 22, y: 33 }],
      ['ctrl', { x: 44, y: 55 }],
    ]),
    connectionRoutes: new Map<string, ConnectionRouteDefinition>([
      ['route:none', {
        points: [
          { kind: 'zone', zoneId: 'zone:a' },
          { kind: 'anchor', anchorId: 'bend' },
          { kind: 'zone', zoneId: 'zone:b' },
        ],
        segments: [
          { kind: 'straight' },
          { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'ctrl' } },
        ],
      }],
    ]),
  };
}
