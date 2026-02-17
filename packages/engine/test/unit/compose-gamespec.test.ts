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
});
