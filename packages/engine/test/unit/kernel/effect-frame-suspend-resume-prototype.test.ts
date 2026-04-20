// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { validateCompoundTurnInventory } from '../../fixtures/spec-140-compound-turn-shapes/validate.js';

type ZoneSetId = 'highlands' | 'delta';
type DecisionKind = 'chooseOne' | 'chooseN';
type Choice = 'confirm';

interface ChooseOneFrame {
  readonly kind: 'chooseOne';
  readonly frameId: string;
  readonly decisionKey: '$zoneSet';
  readonly options: readonly ZoneSetId[];
}

interface EffectFrame {
  readonly kind: 'effect';
  readonly frameId: string;
  readonly cursor: 'awaitOuterChoice' | 'forEach';
  readonly selectedZoneSet: ZoneSetId | null;
  readonly pendingZones: readonly string[];
  readonly zoneIndex: number;
}

interface ChooseNFrame {
  readonly kind: 'chooseN';
  readonly frameId: string;
  readonly decisionKey: string;
  readonly zoneId: string;
  readonly options: readonly string[];
  readonly min: number;
  readonly max: number;
  readonly selected: readonly string[];
}

type PrototypeFrame = ChooseOneFrame | EffectFrame | ChooseNFrame;

interface PrototypeState {
  readonly decisionStack: readonly PrototypeFrame[];
  readonly selectionsByZone: Readonly<Record<string, readonly string[]>>;
  readonly executionLog: readonly string[];
  readonly nextFrameId: number;
  readonly stateHash: string;
}

interface PublishedMicroturn {
  readonly kind: DecisionKind;
  readonly frameId: string;
  readonly decisionKey: string;
  readonly zoneId?: string;
  readonly options: readonly string[];
}

const ZONE_SETS: Readonly<Record<ZoneSetId, readonly string[]>> = {
  highlands: ['kontum', 'pleiku'],
  delta: ['can-tho', 'my-tho'],
};

const TOKENS_BY_ZONE: Readonly<Record<string, readonly string[]>> = {
  kontum: ['k-guerrilla-a', 'k-guerrilla-b', 'k-guerrilla-c'],
  pleiku: ['p-guerrilla-a', 'p-guerrilla-b', 'p-guerrilla-c'],
  'can-tho': ['c-guerrilla-a', 'c-guerrilla-b', 'c-guerrilla-c'],
  'my-tho': ['m-guerrilla-a', 'm-guerrilla-b', 'm-guerrilla-c'],
};

test('validates the spec-140 FITL compound-turn inventory fixture', () => {
  const entries = validateCompoundTurnInventory();
  assert.ok(entries.length >= 100, 'inventory should cover the full live FITL compound-turn surface');
});

test('prototypes effect-frame suspend/resume across outer chooseOne and nested chooseN frames', () => {
  let state = createPrototypeState();

  const initialMicroturn = requirePublishedMicroturn(state);
  assert.equal(initialMicroturn.kind, 'chooseOne');
  assert.equal(initialMicroturn.decisionKey, '$zoneSet');
  assert.equal(state.decisionStack[0]?.kind, 'effect');
  assert.equal(state.decisionStack[1]?.kind, 'chooseOne');

  state = applyChooseOne(state, 'highlands');
  const afterOuterBind = requirePublishedMicroturn(state);
  assert.equal(afterOuterBind.kind, 'chooseN');
  assert.equal(afterOuterBind.zoneId, 'kontum');
  assert.deepEqual(currentEffectFrame(state)?.pendingZones, ['kontum', 'pleiku']);
  assert.equal(currentEffectFrame(state)?.zoneIndex, 0);

  const roundTripped = deserializePrototypeState(serializePrototypeState(state));
  assert.deepEqual(roundTripped, state);
  assert.equal(roundTripped.stateHash, state.stateHash);

  state = applyChooseN(state, ['k-guerrilla-a', 'k-guerrilla-b'], 'confirm');
  const secondZone = requirePublishedMicroturn(state);
  assert.equal(secondZone.kind, 'chooseN');
  assert.equal(secondZone.zoneId, 'pleiku');
  assert.deepEqual(state.selectionsByZone.kontum, ['k-guerrilla-a', 'k-guerrilla-b']);
  assert.equal(currentEffectFrame(state)?.zoneIndex, 1);

  state = applyChooseN(state, ['p-guerrilla-a'], 'confirm');
  assert.equal(publishMicroturn(state), null);
  assert.deepEqual(state.selectionsByZone, {
    kontum: ['k-guerrilla-a', 'k-guerrilla-b'],
    pleiku: ['p-guerrilla-a'],
  });
  assert.deepEqual(state.executionLog, [
    'selected-zone-set:highlands',
    'entered-forEach:kontum',
    'confirmed:kontum:k-guerrilla-a,k-guerrilla-b',
    'entered-forEach:pleiku',
    'confirmed:pleiku:p-guerrilla-a',
    'post-selection-effect',
  ]);
  assert.equal(state.decisionStack.length, 0);
});

function createPrototypeState(): PrototypeState {
  return withStateHash({
    decisionStack: [
      {
        kind: 'effect',
        frameId: 'frame-1',
        cursor: 'awaitOuterChoice',
        selectedZoneSet: null,
        pendingZones: [],
        zoneIndex: 0,
      },
      {
        kind: 'chooseOne',
        frameId: 'frame-2',
        decisionKey: '$zoneSet',
        options: ['highlands', 'delta'],
      },
    ],
    selectionsByZone: {},
    executionLog: [],
    nextFrameId: 3,
  });
}

function publishMicroturn(state: PrototypeState): PublishedMicroturn | null {
  const top = state.decisionStack.at(-1);
  if (top == null) {
    return null;
  }
  if (top.kind === 'chooseOne') {
    return {
      kind: 'chooseOne',
      frameId: top.frameId,
      decisionKey: top.decisionKey,
      options: top.options,
    };
  }
  if (top.kind === 'chooseN') {
    return {
      kind: 'chooseN',
      frameId: top.frameId,
      decisionKey: top.decisionKey,
      zoneId: top.zoneId,
      options: top.options,
    };
  }
  return null;
}

function requirePublishedMicroturn(state: PrototypeState): PublishedMicroturn {
  const microturn = publishMicroturn(state);
  assert.ok(microturn, 'expected a published microturn');
  return microturn;
}

function applyChooseOne(state: PrototypeState, zoneSet: ZoneSetId): PrototypeState {
  const top = state.decisionStack.at(-1);
  assert.equal(top?.kind, 'chooseOne');
  assert.ok(top.options.includes(zoneSet), `unknown zone-set selection ${zoneSet}`);

  const effectFrame = currentEffectFrame(state);
  assert.ok(effectFrame, 'outer effect frame must be present before the first bind');

  const selectedZones = ZONE_SETS[zoneSet];
  const resumedEffect: EffectFrame = {
    ...effectFrame,
    cursor: 'forEach',
    selectedZoneSet: zoneSet,
    pendingZones: selectedZones,
    zoneIndex: 0,
  };
  const chooseNFrame = createChooseNFrame(state.nextFrameId, selectedZones[0]!);

  return withStateHash({
    ...state,
    decisionStack: [resumedEffect, chooseNFrame],
    executionLog: [...state.executionLog, `selected-zone-set:${zoneSet}`, `entered-forEach:${selectedZones[0]}`],
    nextFrameId: state.nextFrameId + 1,
  });
}

function applyChooseN(state: PrototypeState, selected: readonly string[], choice: Choice): PrototypeState {
  assert.equal(choice, 'confirm');
  const top = state.decisionStack.at(-1);
  assert.equal(top?.kind, 'chooseN');
  assert.ok(selected.length >= top.min, `selection for ${top.zoneId} must satisfy minimum cardinality`);
  assert.ok(selected.length <= top.max, `selection for ${top.zoneId} must satisfy maximum cardinality`);
  assert.ok(selected.every((token) => top.options.includes(token)), `selection for ${top.zoneId} must stay within published options`);

  const effectFrame = currentEffectFrame(state);
  assert.ok(effectFrame, 'effect frame must remain suspended while chooseN is active');

  const nextSelections = {
    ...state.selectionsByZone,
    [top.zoneId]: [...selected],
  };
  const nextZoneIndex = effectFrame.zoneIndex + 1;
  const baseLog = [...state.executionLog, `confirmed:${top.zoneId}:${selected.join(',')}`];

  if (nextZoneIndex >= effectFrame.pendingZones.length) {
    return withStateHash({
      ...state,
      decisionStack: [],
      selectionsByZone: nextSelections,
      executionLog: [...baseLog, 'post-selection-effect'],
    });
  }

  const nextZone = effectFrame.pendingZones[nextZoneIndex]!;
  const resumedEffect: EffectFrame = {
    ...effectFrame,
    zoneIndex: nextZoneIndex,
  };
  const nextChooseN = createChooseNFrame(state.nextFrameId, nextZone);

  return withStateHash({
    ...state,
    decisionStack: [resumedEffect, nextChooseN],
    selectionsByZone: nextSelections,
    executionLog: [...baseLog, `entered-forEach:${nextZone}`],
    nextFrameId: state.nextFrameId + 1,
  });
}

function currentEffectFrame(state: PrototypeState): EffectFrame | null {
  const effectFrame = state.decisionStack.find((frame): frame is EffectFrame => frame.kind === 'effect');
  return effectFrame ?? null;
}

function createChooseNFrame(nextFrameId: number, zoneId: string): ChooseNFrame {
  return {
    kind: 'chooseN',
    frameId: `frame-${nextFrameId}`,
    decisionKey: `$selectedTokens@${zoneId}`,
    zoneId,
    options: TOKENS_BY_ZONE[zoneId] ?? [],
    min: 1,
    max: 3,
    selected: [],
  };
}

function serializePrototypeState(state: PrototypeState): string {
  return JSON.stringify(state);
}

function deserializePrototypeState(serialized: string): PrototypeState {
  const parsed = JSON.parse(serialized) as Omit<PrototypeState, 'stateHash'> & { readonly stateHash: string };
  return withStateHash({
    decisionStack: parsed.decisionStack,
    selectionsByZone: parsed.selectionsByZone,
    executionLog: parsed.executionLog,
    nextFrameId: parsed.nextFrameId,
  });
}

function withStateHash(stateLike: Omit<PrototypeState, 'stateHash'> | PrototypeState): PrototypeState {
  const { stateHash, ...state } = stateLike as PrototypeState;
  void stateHash;
  const canonical = JSON.stringify(state);
  return {
    ...state,
    stateHash: createHash('sha256').update(canonical).digest('hex'),
  };
}
