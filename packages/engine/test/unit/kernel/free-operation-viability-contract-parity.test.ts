import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../../src/cnl/compile-effects.js';
import {
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
  isTurnFlowFreeOperationGrantViabilityPolicy,
  type TurnFlowFreeOperationGrantViabilityPolicy,
} from '../../../src/contracts/index.js';
import type { FreeOperationSequenceContextContract } from '../../../src/kernel/free-operation-sequence-context-contract.js';
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
type EffectGrantSequenceContext = NonNullable<EffectGrantFreeOperation['sequenceContext']>;
type EventGrantSequenceContext = NonNullable<EventFreeOperationGrantDef['sequenceContext']>;
type RuntimeGrantSequenceContext = NonNullable<TurnFlowFreeOperationGrantContract['sequenceContext']>;

type CanonicalCoversTurnFlowType = TurnFlowFreeOperationGrantViabilityPolicy extends TurnFlowTypeViabilityPolicy ? true : false;
type TurnFlowTypeCoversCanonical = TurnFlowTypeViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type CanonicalCoversEffect = TurnFlowFreeOperationGrantViabilityPolicy extends EffectGrantViabilityPolicy ? true : false;
type EffectCoversCanonical = EffectGrantViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type CanonicalCoversEvent = TurnFlowFreeOperationGrantViabilityPolicy extends EventGrantViabilityPolicy ? true : false;
type EventCoversCanonical = EventGrantViabilityPolicy extends TurnFlowFreeOperationGrantViabilityPolicy ? true : false;
type EffectGrantSharesRuntimeContract = EffectGrantFreeOperation extends TurnFlowFreeOperationGrantContract ? true : false;
type CanonicalSequenceContextCoversEffect = FreeOperationSequenceContextContract extends EffectGrantSequenceContext ? true : false;
type EffectSequenceContextCoversCanonical = EffectGrantSequenceContext extends FreeOperationSequenceContextContract ? true : false;
type CanonicalSequenceContextCoversEvent = FreeOperationSequenceContextContract extends EventGrantSequenceContext ? true : false;
type EventSequenceContextCoversCanonical = EventGrantSequenceContext extends FreeOperationSequenceContextContract ? true : false;
type CanonicalSequenceContextCoversRuntime = FreeOperationSequenceContextContract extends RuntimeGrantSequenceContext ? true : false;
type RuntimeSequenceContextCoversCanonical = RuntimeGrantSequenceContext extends FreeOperationSequenceContextContract ? true : false;

const CANONICAL_COVERS_TURN_FLOW_TYPE: CanonicalCoversTurnFlowType = true;
const TURN_FLOW_TYPE_COVERS_CANONICAL: TurnFlowTypeCoversCanonical = true;
const CANONICAL_COVERS_EFFECT: CanonicalCoversEffect = true;
const EFFECT_COVERS_CANONICAL: EffectCoversCanonical = true;
const CANONICAL_COVERS_EVENT: CanonicalCoversEvent = true;
const EVENT_COVERS_CANONICAL: EventCoversCanonical = true;
const EFFECT_GRANT_SHARES_RUNTIME_CONTRACT: EffectGrantSharesRuntimeContract = true;
const CANONICAL_SEQUENCE_CONTEXT_COVERS_EFFECT: CanonicalSequenceContextCoversEffect = true;
const EFFECT_SEQUENCE_CONTEXT_COVERS_CANONICAL: EffectSequenceContextCoversCanonical = true;
const CANONICAL_SEQUENCE_CONTEXT_COVERS_EVENT: CanonicalSequenceContextCoversEvent = true;
const EVENT_SEQUENCE_CONTEXT_COVERS_CANONICAL: EventSequenceContextCoversCanonical = true;
const CANONICAL_SEQUENCE_CONTEXT_COVERS_RUNTIME: CanonicalSequenceContextCoversRuntime = true;
const RUNTIME_SEQUENCE_CONTEXT_COVERS_CANONICAL: RuntimeSequenceContextCoversCanonical = true;

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

  it('keeps sequenceContext types aligned across canonical, runtime, AST, and event grant surfaces', () => {
    assert.equal(CANONICAL_SEQUENCE_CONTEXT_COVERS_EFFECT, true);
    assert.equal(EFFECT_SEQUENCE_CONTEXT_COVERS_CANONICAL, true);
    assert.equal(CANONICAL_SEQUENCE_CONTEXT_COVERS_EVENT, true);
    assert.equal(EVENT_SEQUENCE_CONTEXT_COVERS_CANONICAL, true);
    assert.equal(CANONICAL_SEQUENCE_CONTEXT_COVERS_RUNTIME, true);
    assert.equal(RUNTIME_SEQUENCE_CONTEXT_COVERS_CANONICAL, true);
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

  it('keeps AST and event schema completion-contract coupling aligned', () => {
    const validAst = EffectASTSchema.safeParse({
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
      },
    });
    assert.equal(validAst.success, true);

    const validEvent = EventCardFreeOperationGrantSchema.safeParse({
      seat: '0',
      operationClass: 'operation',
      sequence: { chain: 'parity-chain', step: 0 },
      completionPolicy: 'required',
      postResolutionTurnFlow: 'resumeCardFlow',
    });
    assert.equal(validEvent.success, true);

    const invalidCases = [
      {
        ast: {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            completionPolicy: 'required',
          },
        },
        event: {
          seat: '0',
          operationClass: 'operation',
          sequence: { chain: 'parity-chain', step: 0 },
          completionPolicy: 'required',
        },
      },
      {
        ast: {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            postResolutionTurnFlow: 'resumeCardFlow',
          },
        },
        event: {
          seat: '0',
          operationClass: 'operation',
          sequence: { chain: 'parity-chain', step: 0 },
          postResolutionTurnFlow: 'resumeCardFlow',
        },
      },
    ] as const;

    for (const invalid of invalidCases) {
      assert.equal(EffectASTSchema.safeParse(invalid.ast).success, false);
      assert.equal(EventCardFreeOperationGrantSchema.safeParse(invalid.event).success, false);
    }
  });

  it('keeps validate-gamedef-behavior wired to the canonical shared grant-contract helper', () => {
    const source = readKernelSource('src/kernel/validate-gamedef-behavior.ts');
    assert.match(
      source,
      /collectTurnFlowFreeOperationGrantContractViolations\(grant\)/u,
      'validate-gamedef-behavior.ts must validate grants through the canonical shared grant-contract helper',
    );
  });
});
