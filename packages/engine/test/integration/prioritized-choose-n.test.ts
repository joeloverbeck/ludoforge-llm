import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import {
  advanceChooseN,
  asActionId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  resolveMoveDecisionSequence,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';

const optionLegalityByValue = (
  options: readonly { readonly value: unknown; readonly legality: string }[],
): Readonly<Record<string, string>> => Object.fromEntries(options.map((option) => [String(option.value), option.legality]));

const makeToken = (id: string, color: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { color },
});

const buildSyntheticSpec = (): string => [
  '# Prioritized chooseN synthetic integration fixture',
  '',
  '```yaml',
  'metadata:',
  '  id: prioritized-choose-n-integration',
  '  players:',
  '    min: 2',
  '    max: 2',
  'zones:',
  '  - id: supply',
  '    owner: none',
  '    visibility: public',
  '    ordering: stack',
  '  - id: board',
  '    owner: none',
  '    visibility: public',
  '    ordering: stack',
  'tokenTypes:',
  '  - id: piece',
  '    props:',
  '      color: string',
  'turnStructure:',
  '  phases:',
  '    - id: main',
  'actions:',
  '  - id: selectPieces',
  '    actor: active',
  '    executor: actor',
  '    phase: [main]',
  '    params: []',
  '    pre: null',
  '    cost: []',
  '    effects:',
  '      - chooseN:',
  '          bind: $targets',
  '          options:',
  '            query: prioritized',
  '            qualifierKey: color',
  '            tiers:',
  '              - query: tokensInZone',
  '                zone: supply:none',
  '              - query: tokensInZone',
  '                zone: board:none',
  '          min: 1',
  '          max: 2',
  '    limits: []',
  'terminal:',
  '  conditions:',
  '    - when:',
  '        op: "=="',
  '        left: 1',
  '        right: 1',
  '      result:',
  '        type: draw',
  '```',
  '',
].join('\n');

const compileSyntheticDef = (): GameDef => {
  const parsed = parseGameSpec(buildSyntheticSpec(), { sourceId: 'prioritized-choose-n.test.md' });
  assertNoErrors(parsed);

  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  assert.deepEqual(validatorDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);

  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
  assertNoDiagnostics(compiled, parsed.sourceMap);
  assert.notEqual(compiled.gameDef, null, 'Expected synthetic prioritized chooseN spec to compile.');
  return compiled.gameDef!;
};

const makeState = (def: GameDef): GameState => {
  const base = initialState(def, 11, 2).state;
  return {
    ...base,
    zones: {
      ...base.zones,
      'supply:none': [makeToken('supply-red', 'red')],
      'board:none': [makeToken('board-red', 'red'), makeToken('board-blue', 'blue')],
    },
  };
};

const makeMove = (): Move => ({
  actionId: asActionId('selectPieces'),
  params: {},
});

describe('prioritized chooseN integration', () => {
  it('recomputes qualifier-aware legality through add, remove, and confirm in a synthetic non-FITL spec', () => {
    const def = compileSyntheticDef();
    const state = makeState(def);
    const move = makeMove();

    const initial = legalChoicesEvaluate(def, state, move);
    assert.equal(initial.kind, 'pending');
    if (initial.kind !== 'pending' || initial.type !== 'chooseN') {
      throw new Error('Expected chooseN pending request.');
    }

    assert.deepEqual(optionLegalityByValue(initial.options), {
      'supply-red': 'legal',
      'board-red': 'illegal',
      'board-blue': 'legal',
    });

    const afterBoardBlue = advanceChooseN(def, state, move, initial.decisionKey, initial.selected, {
      type: 'add',
      value: 'board-blue',
    });
    assert.equal(afterBoardBlue.done, false);
    if (afterBoardBlue.done) {
      throw new Error('Expected pending chooseN state after adding board-blue.');
    }
    assert.deepEqual(afterBoardBlue.pending.selected, ['board-blue']);
    assert.equal(afterBoardBlue.pending.canConfirm, true);
    assert.deepEqual(optionLegalityByValue(afterBoardBlue.pending.options), {
      'supply-red': 'legal',
      'board-red': 'illegal',
      'board-blue': 'illegal',
    });

    const afterRemoveBoardBlue = advanceChooseN(
      def,
      state,
      move,
      initial.decisionKey,
      afterBoardBlue.pending.selected,
      { type: 'remove', value: 'board-blue' },
    );
    assert.equal(afterRemoveBoardBlue.done, false);
    if (afterRemoveBoardBlue.done) {
      throw new Error('Expected pending chooseN state after removing board-blue.');
    }
    assert.deepEqual(afterRemoveBoardBlue.pending.selected, []);
    assert.deepEqual(optionLegalityByValue(afterRemoveBoardBlue.pending.options), {
      'supply-red': 'legal',
      'board-red': 'illegal',
      'board-blue': 'legal',
    });

    const afterSupplyRed = advanceChooseN(def, state, move, initial.decisionKey, initial.selected, {
      type: 'add',
      value: 'supply-red',
    });
    assert.equal(afterSupplyRed.done, false);
    if (afterSupplyRed.done) {
      throw new Error('Expected pending chooseN state after adding supply-red.');
    }
    assert.deepEqual(afterSupplyRed.pending.selected, ['supply-red']);
    assert.deepEqual(optionLegalityByValue(afterSupplyRed.pending.options), {
      'supply-red': 'illegal',
      'board-red': 'legal',
      'board-blue': 'legal',
    });

    const afterRemoveSupplyRed = advanceChooseN(
      def,
      state,
      move,
      initial.decisionKey,
      afterSupplyRed.pending.selected,
      { type: 'remove', value: 'supply-red' },
    );
    assert.equal(afterRemoveSupplyRed.done, false);
    if (afterRemoveSupplyRed.done) {
      throw new Error('Expected pending chooseN state after removing supply-red.');
    }
    assert.deepEqual(afterRemoveSupplyRed.pending.selected, []);
    assert.deepEqual(optionLegalityByValue(afterRemoveSupplyRed.pending.options), {
      'supply-red': 'legal',
      'board-red': 'illegal',
      'board-blue': 'legal',
    });

    const confirmedSelection = advanceChooseN(def, state, move, initial.decisionKey, afterBoardBlue.pending.selected, {
      type: 'confirm',
    });
    assert.equal(confirmedSelection.done, true);
    if (!confirmedSelection.done) {
      throw new Error('Expected confirm to finalize board-blue selection.');
    }
    assert.deepEqual(confirmedSelection.value, ['board-blue']);
  });

  it('keeps discovery-time and AI fast-path apply-time legality in sync', () => {
    const def = compileSyntheticDef();
    const state = makeState(def);
    const move = makeMove();

    assert.throws(
      () => resolveMoveDecisionSequence(def, state, move, {
        choose: (request) => (request.type === 'chooseN' ? ['board-red'] : undefined),
      }),
      /violates prioritized tier ordering/,
    );

    const resolved = resolveMoveDecisionSequence(def, state, move, {
      choose: (request) => (request.type === 'chooseN' ? ['board-blue'] : undefined),
    });
    assert.equal(resolved.complete, true);
    assert.equal(resolved.illegal, undefined);
    assert.equal(
      Object.values(resolved.move.params).some((value) =>
        Array.isArray(value) && value.length === 1 && value[0] === 'board-blue'),
      true,
    );
  });
});
