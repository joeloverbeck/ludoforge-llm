import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPlayerId,
  asTokenId,
  ILLEGAL_MOVE_REASONS,
  type EffectAST,
  type GameState,
  type MapPayload,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const operationInitialState = (
  def: Parameters<typeof makeIsolatedInitialState>[0],
  seed: number,
  playerCount: number,
): GameState => {
  return {
    ...makeIsolatedInitialState(def, seed, playerCount, { turnOrderMode: 'roundRobin' }),
    activePlayer: asPlayerId(2),
  };
};

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (
  state: GameState,
  zone: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zone] ?? []).filter(predicate).length;

const containsFloorDivOp = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => containsFloorDivOp(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    if (record.op === 'floorDiv') {
      return true;
    }
    return Object.values(record).some((entry) => containsFloorDivOp(entry));
  }
  return false;
};

const containsSetActivityActive = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => containsSetActivityActive(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    const setTokenProp = record.setTokenProp;
    if (setTokenProp && typeof setTokenProp === 'object' && !Array.isArray(setTokenProp)) {
      const setTokenPropRecord = setTokenProp as Readonly<Record<string, unknown>>;
      if (setTokenPropRecord.prop === 'activity' && setTokenPropRecord.value === 'active') {
        return true;
      }
    }
    return Object.values(record).some((entry) => containsSetActivityActive(entry));
  }
  return false;
};

const getMapSpace = (spaceId: string): { readonly population: number; readonly econ: number } => {
  const { parsed } = compileProductionSpec();
  const mapAsset = (parsed.doc.dataAssets ?? []).find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  assert.ok(mapAsset, 'Expected fitl-map-production map asset');
  const mapPayload = mapAsset.payload as MapPayload;
  const rawSpace = mapPayload.spaces.find((entry) => entry.id === spaceId);
  assert.ok(rawSpace, `Expected map space ${spaceId}`);
  return { population: (rawSpace.attributes?.population as number) ?? 0, econ: (rawSpace.attributes?.econ as number) ?? 0 };
};

describe('FITL NVA/VC special activities integration', () => {
  it('compiles NVA/VC special-activity profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileSummaries = profiles.map((profile) => ({
      id: profile.id,
      actionId: String(profile.actionId),
      windows: profile.linkedWindows ?? [],
    }));

    for (const expected of [
      { id: 'infiltrate-profile', actionId: 'infiltrate', windows: ['nva-special-window'] },
      { id: 'bombard-profile', actionId: 'bombard', windows: ['nva-special-window'] },
      { id: 'nva-ambush-profile', actionId: 'ambushNva', windows: ['nva-special-window'] },
      { id: 'tax-profile', actionId: 'tax', windows: ['vc-special-window'] },
      { id: 'subvert-profile', actionId: 'subvert', windows: ['vc-special-window'] },
      { id: 'vc-ambush-profile', actionId: 'ambushVc', windows: ['vc-special-window'] },
    ]) {
      const found = profileSummaries.find((p) => p.id === expected.id);
      assert.ok(found, `Expected profile ${expected.id}`);
      assert.equal(found!.actionId, expected.actionId);
      assert.deepEqual(found!.windows, expected.windows);
    }
  });

  it('executes infiltrate build-up and guerrilla replacement without spending resources', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'quang-nam:none';
    const start = operationInitialState(def, 131, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        trail: 2,
        nvaResources: 10,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('inf-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
          makeToken('inf-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('inf-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('inf-avail-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t3', 'troops', 'NVA', { type: 'troops' }),
          makeToken('inf-avail-t4', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('infiltrate'),
      params: {
        targetSpaces: [space],
        [`$infiltrateMode@${space}`]: 'build-up',
        [`$infiltrateGuerrillasToReplace@${space}`]: [asTokenId('inf-g1')],
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.infiltrateCount, 1);
    assert.equal(final.globalVars.nvaResources, 10, 'Infiltrate should have no additional resource cost');
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      4,
      'Build-up should place trail+bases troops and replacement should add one more troop',
    );
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      1,
      'Selected NVA guerrilla should be replaced by a troop',
    );
  });

  it('executes infiltrate takeover with opposition shift and tunneled-base tunnel transfer', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'tay-ninh:none';
    const start = operationInitialState(def, 177, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 9,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('take-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('take-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('take-nva-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('take-vc-base', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
        ],
        'available-NVA:none': [
          makeToken('take-avail-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
      markers: {
        ...start.markers,
        [space]: {
          ...(start.markers[space] ?? {}),
          supportOpposition: 'passiveOpposition',
        },
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('infiltrate'),
      params: {
        targetSpaces: [space],
        [`$infiltrateMode@${space}`]: 'takeover',
        [`$infiltrateTakeoverReplace@${space}`]: 'yes',
        [`$infiltrateTakeoverTargetType@${space}`]: 'base',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.nvaResources, 9, 'Infiltrate takeover should have zero additional resource cost');
    assert.equal(final.markers[space]?.supportOpposition, 'neutral', 'Takeover should shift opposition one level toward neutral');
    assert.equal(countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'base'), 0);

    const nvaBase = (final.zones[space] ?? []).find((token) => token.props.faction === 'NVA' && token.type === 'base');
    assert.ok(nvaBase, 'Takeover should place an NVA counterpart base');
    assert.equal(nvaBase!.props.tunnel, 'tunneled', 'Replacing a tunneled VC base should transfer tunnel status to NVA base');
  });

  it('executes bombard with per-space troop choice, faction-correct routing, and no die roll', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const profile = (def.actionPipelines ?? []).find((candidate) => candidate.id === 'bombard-profile');
    assert.ok(profile, 'Expected bombard-profile to exist');
    const resolveStage = profile!.stages.find((stage) => stage.stage === 'resolve-per-space');
    assert.ok(resolveStage, 'Expected bombard resolve-per-space stage');
    const perSpace = resolveStage!.effects.find((effect) => 'forEach' in effect && effect.forEach.bind === '$space');
    if (!perSpace || !('forEach' in perSpace)) {
      assert.fail('Expected per-space Bombard forEach');
    }

    const perSpaceEffects = perSpace.forEach.effects;
    const routingText = JSON.stringify(perSpaceEffects);
    assert.ok(routingText.includes('\"bind\":\"$bombardFaction@{$space}\"'));
    assert.ok(routingText.includes('\"bind\":\"$bombardTroops@{$space}\"'));
    assert.ok(routingText.includes('\"US\"') && routingText.includes('\"ARVN\"'));
    assert.ok(routingText.includes('\"query\":\"tokensInZone\"') && routingText.includes('\"prop\":\"type\"') && routingText.includes('\"troops\"'));
    assert.ok(routingText.includes('\"casualties-US:none\"'), 'US troop removal should route to casualties');
    assert.ok(routingText.includes('\"available-ARVN:none\"'), 'ARVN troop removal should route to available');
    assert.equal(routingText.includes('\"removeByPriority\"'), false, 'Bombard should not use removeByPriority');

    const hasRollRandom = (effects: readonly EffectAST[]): boolean =>
      effects.some((effect) => {
        if ('rollRandom' in effect) return true;
        if ('if' in effect) return hasRollRandom(effect.if.then) || (effect.if.else !== undefined && hasRollRandom(effect.if.else));
        if ('forEach' in effect) return hasRollRandom(effect.forEach.effects) || (effect.forEach.in !== undefined && hasRollRandom(effect.forEach.in));
        if ('let' in effect) return hasRollRandom(effect.let.in);
        if ('removeByPriority' in effect) return effect.removeByPriority.in !== undefined && hasRollRandom(effect.removeByPriority.in);
        return false;
      });
    assert.equal(hasRollRandom(profile!.stages.flatMap((stage) => stage.effects)), false, 'Bombard should be automatic (no die roll)');

    const space = 'quang-tri-thua-thien:none';
    const start = operationInitialState(def, 223, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 7,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('bomb-us-1', 'troops', 'US', { type: 'troops' }),
          makeToken('bomb-us-2', 'troops', 'US', { type: 'troops' }),
          makeToken('bomb-nva-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('bomb-nva-2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('bomb-nva-3', 'troops', 'NVA', { type: 'troops' }),
          makeToken('bomb-arvn-1', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
    };

    const casualtiesBefore = modifiedStart.zones['casualties-US:none']?.length ?? 0;
    const availableArvnBefore = modifiedStart.zones['available-ARVN:none']?.length ?? 0;

    const usResult = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('bombard'),
      params: {
        targetSpaces: [space],
        [`$bombardFaction@${space}`]: 'US',
        [`$bombardTroops@${space}`]: [asTokenId('bomb-us-1')],
      },
    });

    const usFinal = usResult.state;
    assert.equal(usFinal.globalVars.bombardCount, 1);
    assert.equal(usFinal.globalVars.nvaResources, 7, 'Bombard should have no additional resource cost');
    assert.equal(countTokens(usFinal, space, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(
      (usFinal.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore,
      1,
      'Bombard should send selected US troop to casualties',
    );
    assert.equal(
      (usFinal.zones['available-ARVN:none']?.length ?? 0) - availableArvnBefore,
      0,
      'Selecting US troop should not add ARVN troops to Available',
    );

    const arvnResult = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('bombard'),
      params: {
        targetSpaces: [space],
        [`$bombardFaction@${space}`]: 'ARVN',
        [`$bombardTroops@${space}`]: [asTokenId('bomb-arvn-1')],
      },
    });
    const arvnFinal = arvnResult.state;
    assert.equal(countTokens(arvnFinal, space, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
    assert.equal(
      (arvnFinal.zones['available-ARVN:none']?.length ?? 0) - availableArvnBefore,
      1,
      'Bombard should send selected ARVN troop to available',
    );
    assert.equal(
      (arvnFinal.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore,
      0,
      'Selecting ARVN troop should not add US troops to casualties',
    );
  });

  it('executes NVA ambush with one-guerrilla activation, no attacker losses, and LoC-adjacent targeting', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const locSpace = 'loc-hue-khe-sanh:none';
    const adjacentTarget = 'hue:none';
    const start = operationInitialState(def, 227, 4);
    const modifiedStart: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        nvaResources: 8,
      },
      zones: {
        ...start.zones,
        [locSpace]: [
          makeToken('amb-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('amb-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ],
        [adjacentTarget]: [
          makeToken('amb-us-t1', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const nvaBefore = countTokens(modifiedStart, locSpace, (token) => token.props.faction === 'NVA');
    const casualtiesBefore = modifiedStart.zones['casualties-US:none']?.length ?? 0;

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('ambushNva'),
      params: {
        targetSpaces: [locSpace],
        [`$ambushTargetMode@${locSpace}`]: 'adjacent',
        [`$ambushAdjacentTargets@${locSpace}`]: [adjacentTarget],
      },
    });

    const final = result.state;
    const nvaAfter = countTokens(final, locSpace, (token) => token.props.faction === 'NVA');
    assert.equal(final.globalVars.nvaAmbushCount, 1);
    assert.equal(final.globalVars.nvaResources, 8, 'Ambush should have no additional resource cost');
    assert.equal(nvaAfter, nvaBefore, 'NVA Ambush should not inflict attacker attrition');
    assert.equal(
      countTokens(final, locSpace, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
      'Ambush should activate exactly one underground NVA guerrilla',
    );
    assert.equal(countTokens(final, adjacentTarget, (token) => token.props.faction === 'US' && token.type === 'troops'), 0);
    assert.equal((final.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore, 1, 'LoC ambush may remove from adjacent space');
  });

  it('executes tax using LoC econ or 2x population gain and shifts province/city support', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const locSpace = 'loc-hue-khe-sanh:none';
    const provinceSpace = 'quang-nam:none';
    const locValues = getMapSpace(locSpace);
    const provinceValues = getMapSpace(provinceSpace);

    const start = operationInitialState(def, 241, 4);
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 5,
      },
      zones: {
        ...start.zones,
        [locSpace]: [
          makeToken('tax-vc-g-loc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tax-arvn-loc', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('tax-us-loc', 'troops', 'US', { type: 'troops' }),
        ],
        [provinceSpace]: [
          makeToken('tax-vc-g-prov', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tax-arvn-prov', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
      markers: {
        ...start.markers,
        [provinceSpace]: {
          ...(start.markers[provinceSpace] ?? {}),
          supportOpposition: 'neutral',
        },
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('tax'),
      params: {
        targetSpaces: [locSpace, provinceSpace],
      },
    });

    const expectedResourceGain = locValues.econ + (provinceValues.population * 2);
    const final = result.state;
    assert.equal(final.globalVars.taxCount, 1);
    assert.equal(final.globalVars.vcResources, 5 + expectedResourceGain, 'Tax gain should be LoC econ + 2x population');
    assert.equal(
      countTokens(final, locSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
      'Tax should activate one underground VC guerrilla in each selected space',
    );
    assert.equal(
      countTokens(final, provinceSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
    );
    assert.equal(final.markers[provinceSpace]?.supportOpposition, 'passiveSupport', 'Tax should shift province/city one level toward Active Support');
  });

  it('defines Tax province/city support shift without a population gate', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const taxPipeline = (def.actionPipelines ?? []).find((pipeline) => String(pipeline.actionId) === 'tax');
    assert.ok(taxPipeline, 'Tax pipeline should exist');

    const resolveStage = taxPipeline!.stages.find((stage) => stage.stage === 'resolve-per-space');
    assert.ok(resolveStage, 'Tax should include resolve-per-space stage');

    const supportShiftBranches = findDeep(resolveStage!.effects, (node: unknown) => {
      const candidate = node as { if?: { when?: unknown; then?: unknown[] } };
      return candidate.if !== undefined &&
        findDeep(candidate.if.then ?? [], (inner: unknown) => {
          const innerCandidate = inner as { shiftMarker?: { marker?: unknown } };
          return innerCandidate.shiftMarker?.marker === 'supportOpposition';
        }).length > 0;
    });
    assert.equal(supportShiftBranches.length, 1, 'Tax resolve should include exactly one support shift branch');

    const supportShiftWhen = (supportShiftBranches[0] as { if: { when: unknown } }).if.when;
    assert.deepEqual(
      supportShiftWhen,
      { op: '!=', left: { ref: 'markerState', space: '$space', marker: 'supportOpposition' }, right: 'activeSupport' },
      'Tax support shift should only guard against activeSupport',
    );
    assert.equal(
      findDeep(supportShiftWhen, (node: unknown) => {
        const candidate = node as { ref?: unknown; prop?: unknown };
        return candidate.ref === 'zoneProp' && candidate.prop === 'population';
      }).length,
      0,
      'Tax support shift guard must not reference population',
    );
  });

  it('executes tax support shift for population-0 provinces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const pop0Province = 'phuoc-long:none';
    const pop0Values = getMapSpace(pop0Province);
    assert.equal(pop0Values.population, 0, 'Test setup requires a population-0 province');

    const start = operationInitialState(def, 271, 4);
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 3,
      },
      zones: {
        ...start.zones,
        [pop0Province]: [
          makeToken('tax-pop0-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
      },
      markers: {
        ...start.markers,
        [pop0Province]: {
          ...(start.markers[pop0Province] ?? {}),
          supportOpposition: 'passiveSupport',
        },
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('tax'),
      params: {
        targetSpaces: [pop0Province],
      },
    });

    const final = result.state;
    assert.equal(final.markers[pop0Province]?.supportOpposition, 'activeSupport');
    assert.equal(final.globalVars.vcResources, 3, 'Population-0 province should add 0 resources while still shifting support');
  });

  it('does not shift Tax support beyond active support', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const provinceSpace = 'quang-nam:none';
    const provinceValues = getMapSpace(provinceSpace);

    const start = operationInitialState(def, 281, 4);
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 6,
      },
      zones: {
        ...start.zones,
        [provinceSpace]: [
          makeToken('tax-active-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
      },
      markers: {
        ...start.markers,
        [provinceSpace]: {
          ...(start.markers[provinceSpace] ?? {}),
          supportOpposition: 'activeSupport',
        },
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('tax'),
      params: {
        targetSpaces: [provinceSpace],
      },
    });

    const final = result.state;
    assert.equal(final.markers[provinceSpace]?.supportOpposition, 'activeSupport');
    assert.equal(final.globalVars.vcResources, 6 + (provinceValues.population * 2));
  });

  it('executes subvert remove/replace modes and applies rounded-down patronage penalty', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const subvertPipeline = (def.actionPipelines ?? []).find((pipeline) => String(pipeline.actionId) === 'subvert');
    assert.ok(subvertPipeline, 'Subvert pipeline should exist');
    assert.equal(
      containsFloorDivOp(subvertPipeline),
      true,
      'Subvert patronage penalty should be encoded using floorDiv instead of threshold branching',
    );
    assert.notEqual(
      subvertPipeline.legality,
      null,
      'Subvert should encode base legality at profile level instead of relying only on selection-stage filtering',
    );
    assert.equal(
      containsSetActivityActive(subvertPipeline),
      false,
      'Subvert resolve pipeline should not activate VC guerrillas',
    );

    const removeSpace = 'tay-ninh:none';
    const replaceSpace = 'quang-tin-quang-ngai:none';
    const start = operationInitialState(def, 251, 4);
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        patronage: 10,
        vcResources: 4,
      },
      zones: {
        ...start.zones,
        [removeSpace]: [
          makeToken('sub-vc-g-remove', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('sub-arvn-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('sub-arvn-t2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('sub-arvn-base', 'base', 'ARVN', { type: 'base' }),
        ],
        [replaceSpace]: [
          makeToken('sub-vc-g-replace', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('sub-arvn-p1', 'police', 'ARVN', { type: 'police' }),
        ],
        'available-VC:none': [
          ...(start.zones['available-VC:none'] ?? []),
          makeToken('sub-vc-avail-g1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('subvert'),
      params: {
        targetSpaces: [removeSpace, replaceSpace],
        [`$subvertMode@${removeSpace}`]: 'remove-2',
        [`$subvertRemovedCubes@${removeSpace}`]: [asTokenId('sub-arvn-t1'), asTokenId('sub-arvn-t2')],
        [`$subvertMode@${replaceSpace}`]: 'replace-1',
        [`$subvertReplacedCube@${replaceSpace}`]: [asTokenId('sub-arvn-p1')],
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.subvertCount, 1);
    assert.equal(final.globalVars.vcResources, 4, 'Subvert should have no additional resource cost');
    assert.equal(final.globalVars.patronage, 9, 'Subvert patronage drop should be floor((2 + 1) / 2) = 1');
    assert.equal(countTokens(final, removeSpace, (token) => token.props.faction === 'ARVN' && token.type === 'base'), 1, 'Subvert must never remove ARVN bases');
    assert.equal(countTokens(final, removeSpace, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
    assert.equal(countTokens(final, replaceSpace, (token) => token.props.faction === 'ARVN' && token.type === 'police'), 0);
    assert.equal(countTokens(final, replaceSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'), 2, 'Replace-1 should place one VC guerrilla from Available');
    assert.equal(
      countTokens(final, removeSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'underground'),
      1,
      'Subvert should keep existing underground VC guerrillas underground',
    );
    assert.equal(
      countTokens(final, replaceSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'underground'),
      2,
      'Subvert replacement should not activate VC guerrillas',
    );
    assert.equal(
      countTokens(final, removeSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      0,
    );
    assert.equal(
      countTokens(final, replaceSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      0,
    );
  });

  it('executes VC ambush with one-guerrilla activation, no attacker losses, and LoC-adjacent targeting', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const locSpace = 'loc-hue-khe-sanh:none';
    const adjacentTarget = 'hue:none';
    const start = operationInitialState(def, 257, 4);
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 6,
      },
      zones: {
        ...start.zones,
        [locSpace]: [
          makeToken('vc-amb-g1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('vc-amb-g2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
        [adjacentTarget]: [
          makeToken('vc-amb-us-t1', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const vcBefore = countTokens(modifiedStart, locSpace, (token) => token.props.faction === 'VC');
    const casualtiesBefore = modifiedStart.zones['casualties-US:none']?.length ?? 0;

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('ambushVc'),
      params: {
        targetSpaces: [locSpace],
        [`$ambushTargetMode@${locSpace}`]: 'adjacent',
        [`$ambushAdjacentTargets@${locSpace}`]: [adjacentTarget],
      },
    });

    const final = result.state;
    const vcAfter = countTokens(final, locSpace, (token) => token.props.faction === 'VC');
    assert.equal(final.globalVars.vcAmbushCount, 1);
    assert.equal(final.globalVars.vcResources, 6, 'VC Ambush should have no additional resource cost');
    assert.equal(vcAfter, vcBefore, 'VC Ambush should not inflict attacker attrition');
    assert.equal(
      countTokens(final, locSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
      'VC Ambush should activate exactly one underground VC guerrilla',
    );
    assert.equal(countTokens(final, adjacentTarget, (token) => token.props.faction === 'US' && token.type === 'troops'), 0);
    assert.equal((final.zones['casualties-US:none']?.length ?? 0) - casualtiesBefore, 1, 'LoC ambush may remove from adjacent space');
  });

  it('rejects infiltrate when accompanied by an operation outside accompanyingOps', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 313, 4);

    // Use 'attack' as the accompanying operation — it's a legal NVA operation (seat 2)
    // but is NOT in infiltrate-profile's accompanyingOps: [rally, march].
    assert.throws(
      () => applyMoveWithResolvedDecisionIds(compiled.gameDef!, state, {
        actionId: asActionId('attack'),
        params: {},
        compound: {
          specialActivity: { actionId: asActionId('infiltrate'), params: {} },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly message?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        if (details.reason !== undefined) {
          assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
        } else {
          assert.match(String(details.message), /Could not normalize decision params|choiceRuntimeValidationFailed/);
        }
        return true;
      },
    );
  });

  it('allows bombard when accompanyingOps is any', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 229, 4);
    const assaultSpace = 'quang-tri-thua-thien:none';
    const nvaSupportSpace = 'hue:none';
    const seeded: GameState = {
      ...state,
      globalVars: {
        ...state.globalVars,
        nvaResources: 0,
        trail: 4,
      },
      zones: {
        ...state.zones,
        [assaultSpace]: [
          makeToken('any-arvn-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('any-arvn-t2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('any-arvn-t3', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [nvaSupportSpace]: [
          makeToken('any-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('any-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('any-nva-t3', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(compiled.gameDef!, seeded, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [] },
      compound: {
        specialActivity: { actionId: asActionId('bombard'), params: { targetSpaces: [assaultSpace] } },
        timing: 'after',
      },
    });
    assert.equal(result.state.globalVars.bombardCount, 1);
  });

  it('rejects NVA ambush when SA targetSpaces are not a subset of operation targetSpaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 347, 4);
    const seeded: GameState = {
      ...state,
      zones: {
        ...state.zones,
        'quang-nam:none': [
          makeToken('subset-nva-g', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
          makeToken('subset-us-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    assert.throws(
      () => applyMoveWithResolvedDecisionIds(compiled.gameDef!, seeded, {
        actionId: asActionId('march'),
        params: {
          targetSpaces: ['quang-tri-thua-thien:none'],
          '$movingGuerrillas@quang-tri-thua-thien:none': [],
          '$movingTroops@quang-tri-thua-thien:none': [],
          chainSpaces: [],
        },
        compound: {
          specialActivity: {
            actionId: asActionId('ambushNva'),
            params: {
              targetSpaces: ['quang-nam:none'],
              '$ambushTargetMode@quang-nam:none': 'self',
            },
          },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as { readonly reason?: string; readonly context?: { readonly relation?: string }; readonly message?: string };
        if (details.reason !== undefined) {
          assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED);
          assert.equal(details.context?.relation, 'subset');
        } else {
          assert.match(String(details.message), /Could not normalize decision params|choiceRuntimeValidationFailed/);
        }
        return true;
      },
    );
  });

});
