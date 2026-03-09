import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../../src/cnl/compile-effects.js';
import {
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
  isTurnFlowFreeOperationGrantViabilityPolicy,
  type TurnFlowFreeOperationGrantViabilityPolicy,
} from '../../../src/contracts/index.js';
import { EffectASTSchema } from '../../../src/kernel/schemas-ast.js';
import { EventCardFreeOperationGrantSchema } from '../../../src/kernel/schemas-extensions.js';
import type { EffectAST } from '../../../src/kernel/types-ast.js';
import type { EventFreeOperationGrantDef } from '../../../src/kernel/types-events.js';
import type {
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantViabilityPolicy as TurnFlowTypeViabilityPolicy,
} from '../../../src/kernel/types-turn-flow.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

type EffectGrantFreeOperation = Extract<EffectAST, { readonly grantFreeOperation: unknown }>['grantFreeOperation'];
type EffectGrantViabilityPolicy = NonNullable<EffectGrantFreeOperation['viabilityPolicy']>;
type EventGrantViabilityPolicy = NonNullable<EventFreeOperationGrantDef['viabilityPolicy']>;

type CanonicalCoversTurnFlowType = TurnFlowFreeOperationGrantViabilityPolicy extends TurnFlowTypeViabilityPolicy ? true : false;
type TurnFlowTypeCoversCanonical = TurnFlowTypeViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type CanonicalCoversEffect = TurnFlowFreeOperationGrantViabilityPolicy extends EffectGrantViabilityPolicy ? true : false;
type EffectCoversCanonical = EffectGrantViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type CanonicalCoversEvent = TurnFlowFreeOperationGrantViabilityPolicy extends EventGrantViabilityPolicy ? true : false;
type EventCoversCanonical = EventGrantViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type EffectGrantSharesRuntimeContract = EffectGrantFreeOperation extends TurnFlowFreeOperationGrantContract ? true : false;

const CANONICAL_COVERS_TURN_FLOW_TYPE: CanonicalCoversTurnFlowType = true;
const TURN_FLOW_TYPE_COVERS_CANONICAL: TurnFlowTypeCoversCanonical = true;
const CANONICAL_COVERS_EFFECT: CanonicalCoversEffect = true;
const EFFECT_COVERS_CANONICAL: EffectCoversCanonical = true;
const CANONICAL_COVERS_EVENT: CanonicalCoversEvent = true;
const EVENT_COVERS_CANONICAL: EventCoversCanonical = true;
const EFFECT_GRANT_SHARES_RUNTIME_CONTRACT: EffectGrantSharesRuntimeContract = true;

const loweringContext: EffectLoweringContext = {
  ownershipByBase: {},
};

describe('free-operation viability policy contract parity', () => {
  it('keeps type-level viabilityPolicy unions aligned across canonical, turn-flow, AST, and event grant surfaces', () => {
    assert.equal(CANONICAL_COVERS_TURN_FLOW_TYPE, true);
    assert.equal(TURN_FLOW_TYPE_COVERS_CANONICAL, true);
    assert.equal(CANONICAL_COVERS_EFFECT, true);
    assert.equal(EFFECT_COVERS_CANONICAL, true);
    assert.equal(CANONICAL_COVERS_EVENT, true);
    assert.equal(EVENT_COVERS_CANONICAL, true);
    assert.equal(EFFECT_GRANT_SHARES_RUNTIME_CONTRACT, true);
  });

  it('keeps runtime guard, AST schema, and event schema acceptance aligned with canonical viability policy values', () => {
    for (const policy of TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES) {
      assert.equal(isTurnFlowFreeOperationGrantViabilityPolicy(policy), true, `runtime guard should accept ${policy}`);

      const astParsed = EffectASTSchema.safeParse({
        grantFreeOperation: {
          seat: 'self',
          operationClass: 'operation',
          viabilityPolicy: policy,
        },
      });
      assert.equal(astParsed.success, true, `EffectAST schema should accept ${policy}`);

      const eventParsed = EventCardFreeOperationGrantSchema.safeParse({
        seat: '0',
        operationClass: 'operation',
        viabilityPolicy: policy,
        sequence: { chain: 'parity-chain', step: 0 },
      });
      assert.equal(eventParsed.success, true, `EventCard free-operation grant schema should accept ${policy}`);
    }
  });

  it('rejects non-canonical viability policy values across runtime guard, AST schema, event schema, and lowering', () => {
    const invalidValues = [
      '',
      'emitAlways ',
      'requireUsableAtIssueNow',
      'REQUIRE_USABLE_AT_ISSUE',
      'invalidPolicy',
    ] as const;

    for (const value of invalidValues) {
      assert.equal(isTurnFlowFreeOperationGrantViabilityPolicy(value), false, `runtime guard should reject ${value}`);

      const astParsed = EffectASTSchema.safeParse({
        grantFreeOperation: {
          seat: 'self',
          operationClass: 'operation',
          viabilityPolicy: value,
        },
      });
      assert.equal(astParsed.success, false, `EffectAST schema should reject ${value}`);

      const eventParsed = EventCardFreeOperationGrantSchema.safeParse({
        seat: '0',
        operationClass: 'operation',
        viabilityPolicy: value,
        sequence: { chain: 'parity-chain', step: 0 },
      });
      assert.equal(eventParsed.success, false, `EventCard free-operation grant schema should reject ${value}`);

      const lowered = lowerEffectArray(
        [{ grantFreeOperation: { seat: 'self', operationClass: 'operation', viabilityPolicy: value } }],
        loweringContext,
        'doc.actions.0.effects',
      );
      assert.equal(lowered.value, null, `compile-effects should reject ${value}`);
      assert.equal(
        lowered.diagnostics.some((diagnostic) => diagnostic.path.endsWith('grantFreeOperation.viabilityPolicy')),
        true,
        `compile-effects should report viabilityPolicy path for ${value}`,
      );
    }
  });

  it('keeps validate-gamedef-behavior wired to canonical viability-policy runtime guard', () => {
    const source = readKernelSource('src/kernel/validate-gamedef-behavior.ts');
    assert.match(
      source,
      /isTurnFlowFreeOperationGrantViabilityPolicy\(grant\.viabilityPolicy\)/u,
      'validate-gamedef-behavior.ts must validate grant.viabilityPolicy through canonical runtime guard',
    );
  });
});
