import * as assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { composeGameSpec } from '../../src/cnl/compose-gamespec.js';

function resolveImport(importPath: string, importer: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), importPath));
}

describe('composeGameSpec', () => {
  it('composes imports deterministically in post-order traversal and remaps source-map spans', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./a.md\n  - ./b.md\nactions:\n  - id: root\n    actor: active\n    phase: main\n    params: []\n    pre: null\n    cost: []\n    effects: []\n    limits: []\n```',
      '/spec/a.md': '```yaml\nimports:\n  - ./shared.md\nactions:\n  - id: from-a\n    actor: active\n    phase: main\n    params: []\n    pre: null\n    cost: []\n    effects: []\n    limits: []\n```',
      '/spec/b.md': '```yaml\nactions:\n  - id: from-b\n    actor: active\n    phase: main\n    params: []\n    pre: null\n    cost: []\n    effects: []\n    limits: []\n```',
      '/spec/shared.md': '```yaml\nactions:\n  - id: from-shared\n    actor: active\n    phase: main\n    params: []\n    pre: null\n    cost: []\n    effects: []\n    limits: []\n```',
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.sourceOrder, ['/spec/shared.md', '/spec/a.md', '/spec/b.md', '/spec/root.md']);
    assert.deepEqual(
      result.doc.actions?.map((action) => action.id),
      ['from-shared', 'from-a', 'from-b', 'root'],
    );
    assert.equal(result.sourceMap.byPath['actions[0].id']?.sourceId, '/spec/shared.md');
    assert.equal(result.sourceMap.byPath['actions[3].id']?.sourceId, '/spec/root.md');
  });

  it('emits unresolved import diagnostics', () => {
    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => (sourceId === '/spec/root.md' ? '```yaml\nimports:\n  - ./missing.md\n```' : null),
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPOSE_IMPORT_NOT_FOUND'), true);
  });

  it('emits cycle diagnostics for recursive imports', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./a.md\n```',
      '/spec/a.md': '```yaml\nimports:\n  - ./root.md\n```',
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPOSE_IMPORT_CYCLE'), true);
  });

  it('merges phaseTemplates list sections across fragments without data loss', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./a.md\nphaseTemplates:\n  - id: "tmpl-root"\n    params: []\n    phase: { id: "root-phase" }\n```',
      '/spec/a.md': '```yaml\nphaseTemplates:\n  - id: "tmpl-a"\n    params:\n      - name: "x"\n    phase: { id: "a-phase" }\n```',
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(
      result.doc.phaseTemplates?.map((tmpl) => tmpl.id),
      ['tmpl-a', 'tmpl-root'],
    );
    assert.ok(result.sourceMap.byPath['phaseTemplates[0].id'] !== undefined);
    assert.ok(result.sourceMap.byPath['phaseTemplates[1].id'] !== undefined);
  });

  it('emits singleton conflict diagnostics when duplicate singleton sections are imported', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./a.md\n  - ./b.md\n```',
      '/spec/a.md': '```yaml\nmetadata:\n  id: game-a\n  players: { min: 2, max: 2 }\n```',
      '/spec/b.md': '```yaml\nmetadata:\n  id: game-b\n  players: { min: 2, max: 2 }\n```',
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPOSE_SINGLETON_CONFLICT'), true);
    assert.equal(result.doc.metadata?.id, 'game-a');
  });

  it('preserves victoryStandings singleton sections during composition', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./victory.md\n  - ./terminal.md\n```',
      '/spec/victory.md': [
        '```yaml',
        'victoryStandings:',
        '  seatGroupConfig:',
        '    coinSeats: [us]',
        '    insurgentSeats: [vc]',
        '    soloSeat: us',
        '    seatProp: faction',
        '  markerName: supportOpposition',
        '  defaultMarkerState: neutral',
        '  markerConfigs:',
        '    support:',
        '      activeState: activeSupport',
        '      passiveState: passiveSupport',
        '  tieBreakOrder: [us, vc]',
        '  entries:',
        '    - seat: us',
        '      threshold: 50',
        '      formula:',
        '        type: controlledPopulationPlusGlobalVar',
        '        controlFn: coin',
        '        varName: patronage',
        '```',
      ].join('\n'),
      '/spec/terminal.md': '```yaml\nterminal:\n  conditions:\n    - when: { op: "==", left: 1, right: 1 }\n      result: { type: draw }\n```',
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.doc.victoryStandings?.entries[0]?.seat, 'us');
    assert.equal(result.sourceMap.byPath['victoryStandings.entries[0].seat']?.sourceId, '/spec/victory.md');
  });

  it('merges event deck cards across fragments with the same deck id deterministically', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./deck-a.md\n  - ./deck-b.md\n```',
      '/spec/deck-a.md': [
        '```yaml',
        'eventDecks:',
        '  - id: production-deck',
        '    drawZone: deck:none',
        '    discardZone: played:none',
        '    shuffleOnSetup: true',
        '    cards:',
        '      - id: card-2',
        '        title: Card 2',
        '        sideMode: single',
        '        order: 2',
        '        unshaded:',
        '          text: Two',
        '      - id: card-4',
        '        title: Card 4',
        '        sideMode: single',
        '        order: 4',
        '        unshaded:',
        '          text: Four',
        '```',
      ].join('\n'),
      '/spec/deck-b.md': [
        '```yaml',
        'eventDecks:',
        '  - id: production-deck',
        '    drawZone: deck:none',
        '    discardZone: played:none',
        '    shuffleOnSetup: true',
        '    cards:',
        '      - id: card-1',
        '        title: Card 1',
        '        sideMode: single',
        '        order: 1',
        '        unshaded:',
        '          text: One',
        '      - id: card-3',
        '        title: Card 3',
        '        sideMode: single',
        '        order: 3',
        '        unshaded:',
        '          text: Three',
        '```',
      ].join('\n'),
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.doc.eventDecks?.length, 1);
    assert.deepEqual(
      result.doc.eventDecks?.[0]?.cards.map((card) => card.id),
      ['card-2', 'card-4', 'card-1', 'card-3'],
    );
    assert.equal(result.sourceMap.byPath['eventDecks[0].cards[0].id']?.sourceId, '/spec/deck-a.md');
    assert.equal(result.sourceMap.byPath['eventDecks[0].cards[2].id']?.sourceId, '/spec/deck-b.md');
    assert.equal(result.sourceMap.byPath['eventDecks[0].cards[3].id']?.sourceId, '/spec/deck-b.md');
  });

  it('emits a compose diagnostic when duplicate event deck fragments redefine deck metadata', () => {
    const sources: Record<string, string> = {
      '/spec/root.md': '```yaml\nimports:\n  - ./deck-a.md\n  - ./deck-b.md\n```',
      '/spec/deck-a.md': [
        '```yaml',
        'eventDecks:',
        '  - id: production-deck',
        '    drawZone: deck:none',
        '    discardZone: played:none',
        '    shuffleOnSetup: true',
        '    cards:',
        '      - id: card-1',
        '        title: Card 1',
        '        sideMode: single',
        '        unshaded:',
        '          text: One',
        '```',
      ].join('\n'),
      '/spec/deck-b.md': [
        '```yaml',
        'eventDecks:',
        '  - id: production-deck',
        '    drawZone: other-deck:none',
        '    discardZone: played:none',
        '    shuffleOnSetup: true',
        '    cards:',
        '      - id: card-2',
        '        title: Card 2',
        '        sideMode: single',
        '        unshaded:',
        '          text: Two',
        '```',
      ].join('\n'),
    };

    const result = composeGameSpec('/spec/root.md', {
      loadSource: (sourceId) => sources[sourceId] ?? null,
      resolveImport,
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPOSE_EVENT_DECK_CONFLICT'), true);
    assert.deepEqual(result.doc.eventDecks?.[0]?.cards.map((card) => card.id), ['card-1']);
  });
});
