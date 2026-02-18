import { asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { makeRenderModelFixture as makeRenderModel } from '../ui/helpers/render-model-fixture.js';
import {
  projectTooltipPayload,
  selectTooltipPayloadSignature,
} from '../../src/model/tooltip-payload.js';

describe('tooltip-payload projection', () => {
  it('projects a hovered zone into normalized rows and sections', () => {
    const renderModel = makeRenderModel({
      zones: [{
        id: 'zone:alpha',
        displayName: 'Alpha Zone',
        ordering: 'stack',
        tokenIDs: ['token:1', 'token:2'],
        hiddenTokenCount: 1,
        markers: [{
          id: 'marker:control',
          displayName: 'Control',
          state: 'Blue',
          possibleStates: ['Blue', 'Red'],
        }],
        visibility: 'public',
        isSelectable: true,
        isHighlighted: false,
        ownerID: asPlayerId(0),
        metadata: {},
      }],
    });

    expect(projectTooltipPayload(renderModel, { kind: 'zone', id: 'zone:alpha' })).toEqual({
      kind: 'zone',
      title: 'Alpha Zone',
      rows: [
        { label: 'Zone ID', value: 'zone:alpha' },
        { label: 'Tokens', value: '3' },
        { label: 'Visibility', value: 'public' },
        { label: 'Owner', value: '0' },
      ],
      sections: [
        {
          title: 'Markers',
          rows: [{ label: 'Control', value: 'Blue' }],
        },
      ],
    });
  });

  it('projects a hovered token into normalized rows and sections', () => {
    const renderModel = makeRenderModel({
      tokens: [{
        id: 'token:7',
        type: 'Infantry',
        zoneID: 'zone:alpha',
        ownerID: asPlayerId(1),
        factionId: null,
        faceUp: true,
        properties: {
          strength: 3,
          ready: true,
        },
        isSelectable: true,
        isSelected: false,
      }],
    });

    expect(projectTooltipPayload(renderModel, { kind: 'token', id: 'token:7' })).toEqual({
      kind: 'token',
      title: 'Infantry',
      rows: [
        { label: 'Token ID', value: 'token:7' },
        { label: 'Owner', value: '1' },
        { label: 'Face Up', value: 'yes' },
        { label: 'Zone', value: 'zone:alpha' },
      ],
      sections: [
        {
          title: 'Properties',
          rows: [
            { label: 'ready', value: 'true' },
            { label: 'strength', value: '3' },
          ],
        },
      ],
    });
  });

  it('returns null payload/signature for missing or invalid hover targets', () => {
    const renderModel = makeRenderModel();

    expect(projectTooltipPayload(renderModel, null)).toBeNull();
    expect(projectTooltipPayload(renderModel, { kind: 'zone', id: 'missing' })).toBeNull();
    expect(selectTooltipPayloadSignature({ renderModel }, null)).toBeNull();
    expect(selectTooltipPayloadSignature({ renderModel }, { kind: 'token', id: 'missing' })).toBeNull();
  });
});
