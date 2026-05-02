// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { disassemble } from '../../../src/agents/policy-bytecode/index.js';
import { compilePolicyBytecode } from '../../../src/cnl/policy-bytecode/index.js';
import {
  buildEncodedStateLayout,
  type CompiledPolicyExpr,
} from '../../../src/kernel/index.js';
import { getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';

describe('policy bytecode disassembler', () => {
  it('prints a readable opcode listing with operands and comments', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const expr: CompiledPolicyExpr = {
      kind: 'op',
      op: 'gt',
      args: [
        { kind: 'literal', value: 5 },
        { kind: 'literal', value: 2 },
      ],
    };

    const bytecode = compilePolicyBytecode(expr, def, layout);
    const text = disassemble(bytecode);

    assert.match(text, /0000: LOAD_CONST 1 ; const=5/u);
    assert.match(text, /LOAD_CONST 0 ; const=2/u);
    assert.match(text, /GT/u);
    assert.match(text, /HALT/u);
  });
});
