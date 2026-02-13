import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/parser.js';

describe('parseGameSpec API shape', () => {
  it('returns an all-null document for empty input', () => {
    const result = parseGameSpec('');

    assert.deepEqual(result.doc, {
      metadata: null,
      constants: null,
      dataAssets: null,
      globalVars: null,
      perPlayerVars: null,
      zones: null,
      tokenTypes: null,
      setup: null,
      turnStructure: null,
      turnOrder: null,
      actionPipelines: null,
      eventDecks: null,
      terminal: null,
      actions: null,
      triggers: null,
      effectMacros: null,
    });
    assert.deepEqual(result.sourceMap.byPath, {});
  });

  it('returns parsed sections while keeping total deterministic result shape', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: game',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.deepEqual(result.doc.metadata, {
      id: 'game',
      players: {
        min: 2,
        max: 4,
      },
    });
    assert.equal(result.doc.constants, null);
    assert.equal(result.doc.turnStructure, null);
    assert.ok('metadata' in result.sourceMap.byPath);
    assert.ok(result.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
  });

  it('anchors nested canonical metadata paths in sourceMap.byPath', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: game',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.ok(result.sourceMap.byPath['metadata'] !== undefined);
    assert.ok(result.sourceMap.byPath['metadata.id'] !== undefined);
    assert.ok(result.sourceMap.byPath['metadata.players'] !== undefined);
    assert.ok(result.sourceMap.byPath['metadata.players.min'] !== undefined);
    assert.ok(result.sourceMap.byPath['metadata.players.max'] !== undefined);
  });

  it('surfaces YAML lint diagnostics from fenced YAML blocks', () => {
    const result = parseGameSpec('```yaml\nmetadata:  \n  id: on\n```');

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_004'));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_005'));
    assert.ok(result.diagnostics.every((diagnostic) => diagnostic.path.startsWith('yaml.block.0.')));
  });

  it('does not throw for arbitrary input', () => {
    assert.doesNotThrow(() => parseGameSpec('\u0000\u0001 not yaml'));
  });

  it('reports malformed fenced YAML with parse diagnostics', () => {
    const result = parseGameSpec('```yaml\nmetadata:\n  id: [1\n```');
    const parseDiagnostic = result.diagnostics.find((diagnostic) => diagnostic.code === 'CNL_PARSER_YAML_PARSE_ERROR');

    assert.ok(parseDiagnostic !== undefined);
    assert.equal(parseDiagnostic?.path, 'yaml.block.0.parse');
    assert.match(parseDiagnostic?.message ?? '', /line/i);
  });

  it('keeps YAML 1.2 boolean-like scalars as strings', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: on',
      '  players:',
      '    min: 2',
      '    max: 4',
      'constants:',
      '  yes: yes',
      '  no: no',
      '  off: off',
      '```',
    ].join('\n'));

    assert.equal(result.doc.metadata?.id, 'on');
    assert.equal(result.doc.constants?.yes, 'yes');
    assert.equal(result.doc.constants?.no, 'no');
    assert.equal(result.doc.constants?.off, 'off');
  });

  it('is equivalent for reversed singleton section order', () => {
    const forward = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: game-a',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '```',
    ].join('\n'));
    const reversed = parseGameSpec([
      '```yaml',
      'turnStructure:',
      '  phases:',
      '    - id: main',
      '```',
      '```yaml',
      'metadata:',
      '  id: game-a',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.deepEqual(forward.doc.metadata, reversed.doc.metadata);
    assert.deepEqual(forward.doc.turnStructure, reversed.doc.turnStructure);
    assert.ok(forward.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
    assert.ok(reversed.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'));
  });

  it('uses first singleton section and emits a warning for duplicates', () => {
    const result = parseGameSpec([
      '```yaml',
      'metadata:',
      '  id: first',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
      '```yaml',
      'metadata:',
      '  id: second',
      '  players:',
      '    min: 2',
      '    max: 4',
      '```',
    ].join('\n'));

    assert.equal(result.doc.metadata?.id, 'first');
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_DUPLICATE_SINGLETON_SECTION'));
  });

  it('appends repeated list sections preserving encounter order', () => {
    const result = parseGameSpec([
      '```yaml',
      'actions:',
      '  - id: a1',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
      '```yaml',
      'actions:',
      '  - id: a2',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
    ].join('\n'));

    assert.deepEqual(
      result.doc.actions?.map((action) => action.id),
      ['a1', 'a2'],
    );
  });

  it('parses dataAssets section and anchors merged list paths', () => {
    const result = parseGameSpec([
      '```yaml',
      'dataAssets:',
      '  - id: fitl-map-foundation',
      '    kind: map',
      '    payload:',
      '      spaces: []',
      '```',
    ].join('\n'));

    assert.equal(result.doc.dataAssets?.length, 1);
    assert.equal(result.doc.dataAssets?.[0]?.id, 'fitl-map-foundation');
    assert.ok(result.sourceMap.byPath['dataAssets[0].id'] !== undefined);
    assert.ok(result.sourceMap.byPath['dataAssets[0].kind'] !== undefined);
  });

  it('parses actionPipelines section and anchors merged list paths', () => {
    const result = parseGameSpec([
      '```yaml',
      'actionPipelines:',
      '  - id: patrol-profile',
      '    actionId: patrol',
      '    legality: true',
      '    costValidation: null',
      '    costEffects: []',
      '    targeting: {}',
      '    stages:',
      '      - stage: apply',
      '    atomicity: atomic',
      '```',
    ].join('\n'));

    assert.equal(result.doc.actionPipelines?.length, 1);
    assert.equal(result.doc.actionPipelines?.[0]?.id, 'patrol-profile');
    assert.ok(result.sourceMap.byPath['actionPipelines[0].id'] !== undefined);
    assert.ok(result.sourceMap.byPath['actionPipelines[0].atomicity'] !== undefined);
  });

  it('parses turnOrder cardDriven config and terminal singleton sections', () => {
    const result = parseGameSpec([
      '```yaml',
      'turnOrder:',
      '  type: cardDriven',
      '  config:',
      '    turnFlow:',
      '      cardLifecycle:',
      '        played: played:none',
      '        lookahead: lookahead:none',
      '        leader: leader:none',
      '      eligibility:',
      '        factions: [us, nva]',
      '        overrideWindows: []',
      '      optionMatrix: []',
      '      passRewards: []',
      '      durationWindows: [card]',
      '    coupPlan:',
      '      phases:',
      '        - id: victory',
      '          steps: [check-thresholds]',
      '      maxConsecutiveRounds: 1',
      'terminal:',
      '  conditions:',
      '    - when: { op: "==", left: 1, right: 1 }',
      '      result: { type: draw }',
      '  checkpoints:',
      '    - id: us-threshold',
      '      faction: us',
      '      timing: duringCoup',
      '      when: { op: ">", left: 51, right: 50 }',
      '```',
    ].join('\n'));

    assert.equal(result.doc.turnOrder?.type, 'cardDriven');
    assert.equal(result.doc.turnOrder?.type === 'cardDriven' ? result.doc.turnOrder.config.coupPlan?.phases[0]?.id : undefined, 'victory');
    assert.equal(result.doc.terminal?.checkpoints?.[0]?.id, 'us-threshold');
    assert.ok(result.sourceMap.byPath['turnOrder.config.coupPlan.phases[0].id'] !== undefined);
    assert.ok(result.sourceMap.byPath['terminal.checkpoints[0].id'] !== undefined);
  });

  it('anchors appended list entries using canonical merged indexes', () => {
    const result = parseGameSpec([
      '```yaml',
      'actions:',
      '  - id: a1',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
      '```yaml',
      'actions:',
      '  - id: a2',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
    ].join('\n'));

    assert.ok(result.sourceMap.byPath['actions[0].id'] !== undefined);
    assert.ok(result.sourceMap.byPath['actions[1].id'] !== undefined);
    assert.equal(result.sourceMap.byPath['actions[0].id']?.blockIndex, 0);
    assert.equal(result.sourceMap.byPath['actions[1].id']?.blockIndex, 1);
  });

  it('emits ambiguity diagnostics when fallback cannot resolve uniquely', () => {
    const result = parseGameSpec([
      '```yaml',
      'foo: bar',
      '```',
    ].join('\n'));

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_SECTION_AMBIGUOUS'));
  });

  it('caps diagnostics and appends a trailing truncation warning', () => {
    const markdown = [
      '```yaml',
      'metadata:  ',
      '  id: on',
      '```',
      '```yaml',
      'metadata:  ',
      '  id: on',
      '```',
    ].join('\n');

    const result = parseGameSpec(markdown, { maxDiagnostics: 3 });

    assert.equal(result.diagnostics.length, 3);
    assert.equal(result.diagnostics[2]?.code, 'CNL_PARSER_DIAGNOSTICS_TRUNCATED');
    assert.equal(result.diagnostics[2]?.path, 'parser.diagnostics');
    assert.equal(result.diagnostics[2]?.severity, 'warning');
  });

  it('produces deterministic sourceMap output for identical markdown input', () => {
    const markdown = [
      '```yaml',
      'metadata:',
      '  id: game-a',
      '  players:',
      '    min: 2',
      '    max: 4',
      'actions:',
      '  - id: a1',
      '    actor: active',
      '    phase: main',
      '    params: []',
      '    pre: null',
      '    cost: []',
      '    effects: []',
      '    limits: []',
      '```',
    ].join('\n');

    const first = parseGameSpec(markdown);
    const second = parseGameSpec(markdown);

    assert.deepEqual(first.sourceMap.byPath, second.sourceMap.byPath);
  });

  it('returns a limit diagnostic when maxInputBytes is exceeded', () => {
    const result = parseGameSpec('```yaml\nmetadata: {}\n```', { maxInputBytes: 4 });

    assert.equal(result.doc.metadata, null);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED'));
  });

  it('limits parsed YAML blocks to maxYamlBlocks', () => {
    const result = parseGameSpec(
      [
        '```yaml',
        'metadata:',
        '  id: first',
        '  players: { min: 2, max: 4 }',
        '```',
        '```yaml',
        'metadata:',
        '  id: second',
        '  players: { min: 2, max: 4 }',
        '```',
      ].join('\n'),
      { maxYamlBlocks: 1 },
    );

    assert.equal(result.doc.metadata?.id, 'first');
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_YAML_BLOCKS_EXCEEDED'));
  });

  it('skips oversized YAML blocks when maxBlockBytes is exceeded', () => {
    const result = parseGameSpec(
      [
        '```yaml',
        'metadata:',
        '  id: tiny',
        '  players:',
        '    min: 2',
        '    max: 4',
        '```',
      ].join('\n'),
      { maxBlockBytes: 8 },
    );

    assert.equal(result.doc.metadata, null);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_MAX_BLOCK_BYTES_EXCEEDED'));
  });
});
