import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, asPlayerId, initialState, type AttributeValue, type ChoicePendingRequest, type DecisionKey, type GameDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { deriveRunnerFrame } from '../../src/model/derive-runner-frame.js';
import { projectRenderModel } from '../../src/model/project-render-model.js';
import type { RenderContext } from '../../src/store/store-types.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-frame-boundary-test',
      players: { min: 2, max: 2 },
    },
    globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [
      { id: 'table', owner: 'none', visibility: 'public', ordering: 'stack', category: 'board' },
      {
        id: 'reserve',
        owner: 'none',
        visibility: 'public',
        ordering: 'stack',
        category: 'board',
        attributes: { country: 'southVietnam' } as Readonly<Record<string, AttributeValue>>,
      },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'tick',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 999 },
          result: { type: 'draw' },
        },
      ],
    },
  });

  if (compiled.gameDef === null) {
    throw new Error(`fixture failed: ${JSON.stringify(compiled.diagnostics)}`);
  }

  return compiled.gameDef;
}

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    playerID: asPlayerId(0),
    legalMoveResult: { moves: [], warnings: [] },
    choicePending: null,
    selectedAction: asActionId('tick'),
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map([
      [asPlayerId(0), 'human'],
      [asPlayerId(1), 'human'],
    ]),
    terminal: null,
    ...overrides,
  };
}

describe('runner frame / render model boundary', () => {
  it('keeps semantic zones provider-free and free of presentation fields', () => {
    const def = compileFixture();
    const state = initialState(def, 1, 2).state;

    const { frame } = deriveRunnerFrame(state, def, makeContext());
    const reserve = frame.zones.find((zone) => zone.id === 'reserve:none');

    expect(reserve).toBeDefined();
    expect('displayName' in (reserve as object)).toBe(false);
    expect('visual' in (reserve as object)).toBe(false);
  });

  it('does not expose dead global-markers or tracks fields on the frame/model boundary', () => {
    const def = compileFixture();
    const state = initialState(def, 1, 2).state;
    const bundle = deriveRunnerFrame(state, def, makeContext());
    const renderModel = projectRenderModel(bundle, new VisualConfigProvider(null));
    const frame = bundle.frame;

    expect('globalMarkers' in (frame as object)).toBe(false);
    expect('tracks' in (frame as object)).toBe(false);
    expect('globalVars' in (frame as object)).toBe(false);
    expect('playerVars' in (frame as object)).toBe(false);
    expect(bundle.source.globalVars).toEqual([{ name: 'tick', value: 0 }]);
    expect('globalMarkers' in (renderModel as object)).toBe(false);
    expect('tracks' in (renderModel as object)).toBe(false);
  });

  it('applies hidden-zone filtering and labels only in render-model projection', () => {
    const def = compileFixture();
    const state = initialState(def, 1, 2).state;
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('pick-zone'),
      name: 'targetZone',
      type: 'chooseOne',
      targetKinds: ['zone'],
      options: [
          { value: 'table:none', legality: 'legal', illegalReason: null },
          { value: 'reserve:none', legality: 'legal', illegalReason: null },
      ],
    };
    const bundle = deriveRunnerFrame(state, def, makeContext({
      choicePending,
      partialMove: { actionId: asActionId('tick'), params: {} },
    }));
    const frame = bundle.frame;

    expect(frame.zones.map((zone) => zone.id)).toContain('reserve:none');

    const renderModel = projectRenderModel(bundle, new VisualConfigProvider({
      version: 1,
      zones: {
        hiddenZones: ['reserve:none'],
        overrides: { 'table:none': { label: 'Center Table' } },
      },
    }));

    expect(renderModel.zones.map((zone) => zone.id)).toEqual(['table:none']);
    expect(renderModel.zones[0]?.displayName).toBe('Center Table');
    expect(renderModel.globalVars).toEqual([{ name: 'tick', value: 0, displayName: 'Tick' }]);
    expect(renderModel.choiceUi.kind).toBe('discreteOne');
    if (renderModel.choiceUi.kind === 'discreteOne') {
      expect(renderModel.choiceUi.options.map((option) => option.displayName)).toEqual(['Center Table', 'Reserve None']);
    }
  });
});
