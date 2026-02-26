import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveBindingTemplate } from '../../src/kernel/binding-template.js';

describe('resolveBindingTemplate', () => {
  it('replaces {name} with a string binding value', () => {
    assert.equal(resolveBindingTemplate('zone-{region}', { region: 'north' }), 'zone-north');
  });

  it('replaces {name} with a number binding value', () => {
    assert.equal(resolveBindingTemplate('player-{idx}', { idx: 42 }), 'player-42');
  });

  it('replaces {name} with a boolean binding value', () => {
    assert.equal(resolveBindingTemplate('flag-{active}', { active: true }), 'flag-true');
  });

  it('replaces {name} with object-with-id binding (uses .id)', () => {
    assert.equal(
      resolveBindingTemplate('token-{piece}', { piece: { id: 'warrior', hp: 5 } }),
      'token-warrior',
    );
  });

  it('leaves {name} unchanged when binding is missing', () => {
    assert.equal(resolveBindingTemplate('zone-{missing}', {}), 'zone-{missing}');
  });

  it('leaves {name} unchanged when value is undefined', () => {
    assert.equal(resolveBindingTemplate('zone-{x}', { x: undefined }), 'zone-{x}');
  });

  it('leaves {name} unchanged when value is an array (no .id)', () => {
    assert.equal(resolveBindingTemplate('list-{arr}', { arr: [1, 2, 3] }), 'list-{arr}');
  });

  it('leaves {name} unchanged when value is an object without id', () => {
    assert.equal(
      resolveBindingTemplate('obj-{thing}', { thing: { name: 'hello' } }),
      'obj-{thing}',
    );
  });

  it('replaces multiple placeholders in one template', () => {
    assert.equal(
      resolveBindingTemplate('{a}-{b}-{c}', { a: 'x', b: 'y', c: 'z' }),
      'x-y-z',
    );
  });

  it('handles empty bindings map with no placeholders', () => {
    assert.equal(resolveBindingTemplate('no-placeholders', {}), 'no-placeholders');
  });

  it('handles template with no placeholders and non-empty bindings', () => {
    assert.equal(resolveBindingTemplate('literal', { a: 'unused' }), 'literal');
  });

  it('trims whitespace inside placeholder braces', () => {
    assert.equal(resolveBindingTemplate('{ name }', { name: 'alice' }), 'alice');
  });

  it('handles mixed resolved and unresolved placeholders', () => {
    assert.equal(
      resolveBindingTemplate('{found}-{missing}', { found: 'ok' }),
      'ok-{missing}',
    );
  });
});
