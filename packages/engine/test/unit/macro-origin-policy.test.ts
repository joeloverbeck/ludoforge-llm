import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findFirstMacroOriginByBindFields,
  hasSameMacroBindingOrigin,
  resolveRemoveByPriorityParentMacroOrigin,
  type MacroBindingOrigin,
} from '../../src/cnl/macro-origin-policy.js';

function originByBinding(entries: Array<[string, MacroBindingOrigin]>): ReadonlyMap<string, MacroBindingOrigin> {
  return new Map(entries);
}

describe('macro-origin-policy', () => {
  it('finds first bind-field origin in declared order', () => {
    const node: Record<string, unknown> = {
      firstBind: '$first',
      secondBind: '$second',
    };
    const origin = findFirstMacroOriginByBindFields(
      node,
      ['firstBind', 'secondBind'],
      originByBinding([
        ['$first', { macroId: 'm', stem: 'first' }],
        ['$second', { macroId: 'm', stem: 'second' }],
      ]),
    );
    assert.deepEqual(origin, { macroId: 'm', stem: 'first' });
  });

  it('prefers remainingBind origin for removeByPriority parent origin', () => {
    const parentOrigin = resolveRemoveByPriorityParentMacroOrigin(
      {
        remainingBind: '$remaining',
        groups: [{ bind: '$candidate' }],
      },
      originByBinding([
        ['$remaining', { macroId: 'macro', stem: 'remaining' }],
        ['$candidate', { macroId: 'macro', stem: 'candidate' }],
      ]),
    );
    assert.deepEqual(parentOrigin, { macroId: 'macro', stem: 'remaining' });
  });

  it('returns undefined when removeByPriority groups are mixed', () => {
    const parentOrigin = resolveRemoveByPriorityParentMacroOrigin(
      {
        groups: [{ bind: '$a' }, { bind: '$b' }],
      },
      originByBinding([
        ['$a', { macroId: 'macro', stem: 'a' }],
        ['$b', { macroId: 'macro', stem: 'b' }],
      ]),
    );
    assert.equal(parentOrigin, undefined);
  });

  it('returns uniform group origin when all groups match', () => {
    const parentOrigin = resolveRemoveByPriorityParentMacroOrigin(
      {
        groups: [{ bind: '$a' }, { bind: '$a' }],
      },
      originByBinding([
        ['$a', { macroId: 'macro', stem: 'a' }],
      ]),
    );
    assert.deepEqual(parentOrigin, { macroId: 'macro', stem: 'a' });
  });

  it('returns undefined when any group lacks origin', () => {
    const parentOrigin = resolveRemoveByPriorityParentMacroOrigin(
      {
        groups: [{ bind: '$a' }, { bind: '$unknown' }],
      },
      originByBinding([
        ['$a', { macroId: 'macro', stem: 'a' }],
      ]),
    );
    assert.equal(parentOrigin, undefined);
  });

  it('checks macro-origin identity by macroId+stem only', () => {
    assert.equal(
      hasSameMacroBindingOrigin({ macroId: 'macro', stem: 'a' }, { macroId: 'macro', stem: 'a' }),
      true,
    );
    assert.equal(
      hasSameMacroBindingOrigin({ macroId: 'macro', stem: 'a' }, { macroId: 'macro', stem: 'b' }),
      false,
    );
  });
});
